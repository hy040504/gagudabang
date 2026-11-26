// 성능 목표 측정 (기획서 3.6): 조회 API p95 ≤ 150ms, 사진 5장 신청 저장 p95 ≤ 800ms.
// 실행: npm run perf   (SEED_APPS 환경변수로 시딩 건수 조절, 기본 500건)
import { ADMIN_PW, applicationForm, client, startServer, validPayload } from '../tests/helpers.js';

const SEED = Number(process.env.SEED_APPS) || 500;
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(xs.length * p) - 1)]!;
const fmt = (n: number) => n.toFixed(1).padStart(7);

async function time(n: number, fn: () => Promise<number>) {
  const ms: number[] = [];
  for (let i = 0; i < n; i++) { const t0 = performance.now(); const st = await fn(); if (st >= 400) throw new Error(`HTTP ${st}`); ms.push(performance.now() - t0); }
  return { p50: pct(ms, 0.5), p95: pct(ms, 0.95), max: Math.max(...ms), n };
}

const srv = startServer();
try {
  const admin = client(srv.base);
  await admin.call('POST', '/api/admin/login', { loginId: 'admin', password: ADMIN_PW });

  // 대량 시딩은 SQL로 직접 (PIN scrypt 비용 때문에 API로는 느리다)
  const st = ['PENDING', 'IN_PROGRESS', 'SCHEDULED', 'COMPLETED'] as const;
  srv.db.exec('BEGIN');
  const insA = srv.db.prepare(`INSERT INTO applications (request_code, lookup_pin_hash, applicant_name, phone, address, elevator_info, moving_date, preferred_pickup_date, is_demo)
    VALUES (?, 'x:y', ?, ?, '청주시 상당구 용암북로', 'YES', ?, ?, ?)`);
  const insI = srv.db.prepare(`INSERT INTO application_items (application_id, sort_order, category, item_name, condition_grade, customer_preference, handling_type, status, sale_deadline, pickup_schedule)
    VALUES (?, ?, 'SOFA', ?, 'GOOD', 'RESALE', 'RESALE', ?, ?, ?)`);
  for (let i = 0; i < SEED; i++) {
    const day = String(1 + (i % 28)).padStart(2, '0');
    const id = Number(insA.run(`FR-20991201-${String(i).padStart(4, '0')}`, `신청자${i}`, `010${String(10000000 + i)}`, `2099-12-${day}`, `2099-12-${day}`, i % 5 === 0 ? 1 : 0).lastInsertRowid);
    for (let j = 0; j < 2; j++) {
      const s = st[(i + j) % 4]!;
      insI.run(id, j, `품목${i}-${j}`, s, s === 'IN_PROGRESS' ? `2099-12-${day}` : '', s === 'SCHEDULED' ? `2099-12-${day} 10:00` : '');
    }
  }
  srv.db.exec('COMMIT');

  const rows: [string, number, Awaited<ReturnType<typeof time>>][] = [];
  const get = (u: string) => async () => (await admin.call('GET', u)).status;
  rows.push(['목록 /admin/applications', 150, await time(200, get('/api/admin/applications'))]);
  rows.push(['목록 검색 ?q=품목1&status=PENDING', 150, await time(200, get('/api/admin/applications?q=%ED%92%88%EB%AA%A91&status=PENDING'))]);
  rows.push(['상세 /admin/applications/250', 150, await time(200, get('/api/admin/applications/250'))]);
  rows.push(['캘린더 /admin/schedule?month=2099-12', 150, await time(200, get('/api/admin/schedule?month=2099-12'))]);
  rows.push(['CSV 내보내기', 150, await time(50, get('/api/admin/export/csv'))]);

  // 사진 5장(각 ~300KB) 신청. 클라이언트가 1440px로 압축한 뒤의 현실적 크기.
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xda, 0x00, 0x02]), Buffer.alloc(300 * 1024, 7), Buffer.from([0xff, 0xd9])]);
  const files = Array.from({ length: 5 }, (_, i) => [`photos_${i % 2}`, jpeg, `p${i}.jpg`] as [string, Buffer, string]);
  const guest = client(srv.base);
  // 신청 API는 IP당 분당 30건 제한이 있어 25회만 측정한다.
  rows.push(['신청 저장(사진 5장 ≈1.5MB)', 800, await time(25, async () => (await guest.call('POST', '/api/applications', undefined, { form: applicationForm(validPayload(), files) })).status)]);

  console.log(`\n시딩 ${SEED}건(품목 ${SEED * 2}개) 기준 · 단위 ms\n`);
  console.log('엔드포인트'.padEnd(44), '   p50     p95     max   목표   결과');
  let fail = 0;
  for (const [name, target, r] of rows) {
    const ok = r.p95 <= target; if (!ok) fail++;
    console.log(name.padEnd(40), fmt(r.p50), fmt(r.p95), fmt(r.max), String(target).padStart(5), ok ? ' 통과' : ' 초과', `(n=${r.n})`);
  }
  process.exitCode = fail ? 1 : 0;
} finally { srv.close(); }
