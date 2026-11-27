// 화면을 둘러보기 위한 예시 데이터. 접수 20건(사진 포함)과 지난 15개월의 방문 기록, 일정 몇 개를 넣는다.
// 이름·번호·주소는 지어낸 것이다. 모든 행에 is_demo = 1을 붙여 나중에 한 번에 지울 수 있다(docs/DEVELOPMENT_STATUS.md).
// 사진은 public/assets/demo/ 에 있다(출처: public/assets/demo/CREDITS.md).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db.js';
import { hashSecret, todayKst } from './lib.js';
import type { ItemStatus } from '../shared/types.js';

type Cat = 'BED' | 'SOFA' | 'DINING' | 'CLOSET' | 'DESK' | 'ETC';
type Cond = 'BEST' | 'GOOD' | 'FAIR' | 'POOR_DISPOSE';
type Pref = 'RESALE' | 'DISPOSE' | 'CONSULT';
type Hand = 'UNDECIDED' | 'RESALE' | 'DISPOSE';
interface DemoItem { cat: Cat; name: string; cond: Cond; pref: Pref; note: string; photos: string[]; status: ItemStatus; hand: Hand; notice?: string; memo?: string }
interface DemoApp {
  name: string; phone: string; zip: string; addr: string; detail: string; elev: 'YES' | 'NO_STAIRS' | 'FIRST_FLOOR';
  ago: number; move: number; memo: string; adminMemo?: string; member?: boolean; marketing?: boolean; items: DemoItem[];
}

/** ago: 오늘로부터 며칠 전에 접수했는지, move: 접수일로부터 며칠 뒤가 이사일인지 */
const APPS: DemoApp[] = [
  { name: '박서연', phone: '01048213367', zip: '03925', addr: '서울특별시 마포구 월드컵북로 402', detail: '5층 502호', elev: 'YES', ago: 322, move: 30, memo: '평일 오후 6시 이후에 연락 주세요.',
    items: [{ cat: 'BED', name: '원목 퀸 침대 프레임', cond: 'GOOD', pref: 'RESALE', note: '5년 사용했어요. 헤드 쪽에 생활 흠집 조금 있습니다. 매트리스는 따로 처리했어요.', photos: ['bed-1', 'bed-4'], status: 'COMPLETED', hand: 'RESALE' }] },
  { name: '이준호', phone: '01092647105', zip: '06212', addr: '서울특별시 강남구 선릉로 314', detail: '1203호', elev: 'YES', ago: 291, move: 25, memo: '관리실에 엘리베이터 사용 예약해야 해서 날짜 미리 알려 주세요.',
    items: [{ cat: 'DINING', name: '6인 원목 식탁', cond: 'FAIR', pref: 'DISPOSE', note: '상판 모서리 까짐이 있고 다리 하나가 조금 흔들립니다.', photos: ['dining-4'], status: 'COMPLETED', hand: 'DISPOSE' }] },
  { name: '최민지', phone: '01035872914', zip: '13561', addr: '경기도 성남시 분당구 정자일로 95', detail: '108동 1502호', elev: 'YES', ago: 252, move: 21, memo: '',
    items: [{ cat: 'SOFA', name: 'ㄱ자 패브릭 소파', cond: 'GOOD', pref: 'RESALE', note: '커버 분리 세탁 가능합니다. 반려동물 없는 집이에요.', photos: ['sofa-1'], status: 'COMPLETED', hand: 'RESALE' }] },
  { name: '정우진', phone: '01077340926', zip: '34126', addr: '대전광역시 유성구 대학로 211', detail: '302호', elev: 'NO_STAIRS', ago: 213, move: 28, memo: '3층이고 계단만 있어요. 혼자 들기 어려운 무게입니다.',
    items: [
      { cat: 'DESK', name: '원목 책상과 서랍장 세트', cond: 'GOOD', pref: 'CONSULT', note: '책상 120cm, 서랍장은 3단입니다.', photos: ['desk-1'], status: 'COMPLETED', hand: 'RESALE' },
      { cat: 'ETC', name: '5단 책장', cond: 'FAIR', pref: 'DISPOSE', note: '선반 하나 휘었어요.', photos: ['desk-4'], status: 'COMPLETED', hand: 'DISPOSE' },
    ] },
  { name: '강하은', phone: '01061598432', zip: '48095', addr: '부산광역시 해운대구 센텀중앙로 78', detail: '2204호', elev: 'YES', ago: 183, move: 20, memo: '',
    items: [{ cat: 'CLOSET', name: '앤틱 거울 옷장', cond: 'GOOD', pref: 'RESALE', note: '부모님 쓰시던 옷장인데 거울 깨짐 없습니다.', photos: ['closet-1'], status: 'CANCELED', hand: 'UNDECIDED', notice: '고객 요청으로 취소되었습니다. (지인에게 넘기기로 함)' }] },
  { name: '윤성민', phone: '01024916758', zip: '16679', addr: '경기도 수원시 영통구 봉영로 1612', detail: '301동 804호', elev: 'YES', ago: 152, move: 30, memo: '아이가 있어서 오전 방문은 어렵습니다.',
    items: [
      { cat: 'BED', name: '수납형 슈퍼싱글 침대', cond: 'GOOD', pref: 'RESALE', note: '아이 방에서 3년 썼어요. 서랍 2칸 모두 잘 열립니다.', photos: ['bed-6'], status: 'COMPLETED', hand: 'RESALE' },
      { cat: 'CLOSET', name: '6칸 서랍장', cond: 'FAIR', pref: 'CONSULT', note: '손잡이 하나 교체했습니다.', photos: ['closet-3'], status: 'COMPLETED', hand: 'DISPOSE' },
    ] },
  { name: '임지아', phone: '01058320471', zip: '42019', addr: '대구광역시 수성구 동대구로 330', detail: '15층', elev: 'YES', ago: 121, move: 25, memo: '',
    items: [{ cat: 'DINING', name: '4인 식탁과 의자 4개', cond: 'BEST', pref: 'RESALE', note: '1년 정도 썼고 거의 새것입니다. 의자 방석 포함이에요.', photos: ['dining-5', 'dining-6'], status: 'COMPLETED', hand: 'RESALE' }] },
  { name: '한도윤', phone: '01089045126', zip: '07327', addr: '서울특별시 영등포구 여의대방로 43', detail: '7층 701호', elev: 'YES', ago: 96, move: 30, memo: '주차는 지하 2층에 가능합니다.',
    items: [
      { cat: 'SOFA', name: '3인용 가죽 소파', cond: 'POOR_DISPOSE', pref: 'DISPOSE', note: '팔걸이 가죽이 갈라졌어요. 처분 희망합니다.', photos: ['sofa-2'], status: 'COMPLETED', hand: 'DISPOSE' },
      { cat: 'CLOSET', name: '원목 거실장', cond: 'GOOD', pref: 'RESALE', note: '폭 180cm, 서랍 3칸입니다.', photos: ['closet-5'], status: 'COMPLETED', hand: 'RESALE' },
    ] },
  { name: '오수빈', phone: '01013679284', zip: '61186', addr: '광주광역시 북구 첨단과기로 123', detail: '1004호', elev: 'YES', ago: 71, move: 21, memo: '',
    items: [{ cat: 'DESK', name: '조명 포함 컴퓨터 책상', cond: 'GOOD', pref: 'RESALE', note: '스탠드는 같이 드려요. 상판 140cm.', photos: ['desk-2'], status: 'COMPLETED', hand: 'RESALE' }] },
  { name: '김하늘', phone: '01000001234', zip: '04147', addr: '서울특별시 마포구 독막로 100', detail: '101동 1203호', elev: 'YES', ago: 62, move: 20, memo: '경비실에 말씀하시면 엘리베이터 잡아 드립니다.', member: true,
    items: [{ cat: 'DINING', name: '원형 원목 식탁', cond: 'GOOD', pref: 'RESALE', note: '지름 100cm입니다. 의자는 없어요.', photos: ['dining-3'], status: 'COMPLETED', hand: 'RESALE' }] },
  { name: '신예린', phone: '01046718352', zip: '21999', addr: '인천광역시 연수구 컨벤시아대로 165', detail: '2302호', elev: 'YES', ago: 46, move: 30, memo: '',
    items: [{ cat: 'BED', name: '서랍형 싱글 침대', cond: 'GOOD', pref: 'CONSULT', note: '매트리스 포함입니다. 커버 세탁해 두었어요.', photos: ['bed-5'], status: 'COMPLETED', hand: 'RESALE' }] },
  { name: '조현우', phone: '01095283016', zip: '28644', addr: '충청북도 청주시 서원구 사직대로 245', detail: '4층', elev: 'NO_STAIRS', ago: 30, move: 33, memo: '계단이 좁아서 식탁 상판 분리해서 내려야 할 수도 있어요.',
    items: [
      { cat: 'DINING', name: '6인 식탁', cond: 'FAIR', pref: 'DISPOSE', note: '상판 얼룩이 지워지지 않아요.', photos: ['dining-2'], status: 'SCHEDULED', hand: 'DISPOSE' },
      { cat: 'DINING', name: '식탁 의자 6개', cond: 'FAIR', pref: 'DISPOSE', note: '', photos: ['dining-7'], status: 'SCHEDULED', hand: 'DISPOSE' },
    ] },
  { name: '배소영', phone: '01067391845', zip: '05510', addr: '서울특별시 송파구 올림픽로 269', detail: '1105호', elev: 'YES', ago: 25, move: 41, memo: '소파는 판매되면 연락 주세요.', adminMemo: '소파 문의 2건 있음',
    items: [
      { cat: 'SOFA', name: '4인용 카우치 소파', cond: 'BEST', pref: 'RESALE', note: '작년 봄에 샀어요. 이사 가는 집이 좁아서 내놓습니다.', photos: ['sofa-4', 'sofa-3'], status: 'IN_PROGRESS', hand: 'RESALE' },
      { cat: 'ETC', name: '벨벳 1인 안락의자', cond: 'GOOD', pref: 'RESALE', note: '앉는 부분이 살짝 눌렸어요.', photos: ['etc-1'], status: 'IN_PROGRESS', hand: 'RESALE' },
    ] },
  { name: '송재훈', phone: '01030468219', zip: '63309', addr: '제주특별자치도 제주시 연북로 260', detail: '201호', elev: 'FIRST_FLOOR', ago: 18, move: 30, memo: '1층 주택입니다. 대문 앞까지 차가 들어옵니다.',
    items: [
      { cat: 'CLOSET', name: '3문 원목 옷장', cond: 'GOOD', pref: 'RESALE', note: '분해 조립식이에요.', photos: ['closet-4'], status: 'IN_PROGRESS', hand: 'RESALE' },
      { cat: 'BED', name: '저상형 퀸 침대', cond: 'FAIR', pref: 'DISPOSE', note: '프레임 삐걱거림이 있어요.', photos: ['bed-2'], status: 'SCHEDULED', hand: 'DISPOSE' },
    ] },
  { name: '권나연', phone: '01082157630', zip: '35208', addr: '대전광역시 서구 둔산로 100', detail: '908호', elev: 'YES', ago: 12, move: 33, memo: '',
    items: [{ cat: 'DESK', name: '책장 겸용 1인 책상', cond: 'GOOD', pref: 'RESALE', note: '재택근무용으로 썼어요. 모니터는 포함 안 됩니다.', photos: ['desk-3'], status: 'IN_PROGRESS', hand: 'RESALE' }] },
  { name: '황태민', phone: '01056924387', zip: '44543', addr: '울산광역시 중구 종가로 405', detail: '1801호', elev: 'YES', ago: 9, move: 30, memo: '토요일 반출 가능하면 좋겠어요.',
    items: [{ cat: 'DINING', name: '세라믹 상판 6인 식탁', cond: 'BEST', pref: 'RESALE', note: '상판 스크래치 없습니다. 의자 4개 같이 드려요.', photos: ['dining-8', 'dining-1'], status: 'IN_PROGRESS', hand: 'RESALE' }] },
  { name: '안유진', phone: '01043187592', zip: '10881', addr: '경기도 파주시 문발로 242', detail: '503동 1101호', elev: 'YES', ago: 6, move: 26, memo: '', marketing: true,
    items: [
      { cat: 'BED', name: '패밀리 침대 프레임', cond: 'GOOD', pref: 'CONSULT', note: '아이 둘이랑 같이 쓰던 침대라 큽니다(2400mm).', photos: ['bed-3'], status: 'PENDING', hand: 'UNDECIDED' },
      { cat: 'CLOSET', name: '원목 수납장', cond: 'GOOD', pref: 'RESALE', note: '', photos: ['closet-2'], status: 'PENDING', hand: 'UNDECIDED' },
    ] },
  { name: '김하늘', phone: '01000001234', zip: '04147', addr: '서울특별시 마포구 독막로 100', detail: '101동 1203호', elev: 'YES', ago: 4, move: 30, memo: '', member: true,
    items: [{ cat: 'DESK', name: '화이트 붙박이형 책상', cond: 'GOOD', pref: 'CONSULT', note: '벽에 고정했던 거라 분리 작업이 필요해요.', photos: ['desk-5'], status: 'PENDING', hand: 'UNDECIDED' }] },
  { name: '류승호', phone: '01070528146', zip: '26464', addr: '강원특별자치도 원주시 시청로 50', detail: '702호', elev: 'YES', ago: 2, move: 24, memo: '전화보다 문자가 편합니다.',
    items: [
      { cat: 'DINING', name: '원형 4인 식탁 세트', cond: 'GOOD', pref: 'RESALE', note: '의자 4개 포함입니다.', photos: ['dining-9'], status: 'PENDING', hand: 'UNDECIDED' },
      { cat: 'BED', name: '싱글 침대와 매트리스', cond: 'FAIR', pref: 'DISPOSE', note: '매트리스 커버에 얼룩 있어요.', photos: ['bed-4'], status: 'PENDING', hand: 'UNDECIDED' },
    ] },
  { name: '전다은', phone: '01029653174', zip: '03170', addr: '서울특별시 종로구 사직로8길 34', detail: '402호', elev: 'NO_STAIRS', ago: 0, move: 18, memo: '4층인데 엘리베이터가 없어요. 비용 미리 알려 주시면 좋겠습니다.',
    items: [{ cat: 'CLOSET', name: '원목 6칸 수납장', cond: 'GOOD', pref: 'CONSULT', note: '옆면에 스티커 자국이 있어요.', photos: ['etc-2'], status: 'PENDING', hand: 'UNDECIDED' }] },
];

const STATUS_KO: Record<ItemStatus, string> = { PENDING: '접수대기', IN_PROGRESS: '진행중', SCHEDULED: '반출예정', COMPLETED: '처리완료', CANCELED: '취소·반려' };
const ADMIN_NAME = '운영 관리자';
export const DEMO_PIN = '1234'; // 예시 접수의 조회용 PIN (docs/DEVELOPMENT_STATUS.md에 적어 두었다)
export const DEMO_COUNT = APPS.length;

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** 한국 날짜·시각을 DB가 쓰는 UTC 문자열로 바꾼다 */
const utc = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+09:00`).toISOString().slice(0, 19).replace('T', ' ');
/** 인스턴스마다 같은 이름이 나오도록 내용에서 만든 UUID 모양 파일 이름 (사진 주소 검사와 같은 형식) */
const demoFileName = (key: string) => {
  const h = crypto.createHash('sha256').update(`gagudabang-demo:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}.jpg`;
};
/** 같은 값이 나오는 난수 (방문 기록이 인스턴스마다 달라지지 않게) */
function rng(seed: number) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** 사진을 읽는 방법: 파일이 있으면 파일에서, 없으면(Vercel 함수) 배포된 정적 주소에서 받는다 */
export function demoPhotoLoader(publicDir: string, baseUrl?: string) {
  return async (name: string): Promise<Buffer> => {
    const file = path.join(publicDir, 'assets', 'demo', `${name}.jpg`);
    if (fs.existsSync(file)) return fs.readFileSync(file);
    if (!baseUrl) throw new Error(`예시 사진이 없습니다: ${name}`);
    const r = await fetch(`${baseUrl}/assets/demo/${name}.jpg`);
    if (!r.ok) throw new Error(`예시 사진을 받지 못했습니다: ${name} (${r.status})`);
    return Buffer.from(await r.arrayBuffer());
  };
}

/** 예시 데이터를 한 번만 넣는다. 넣었으면 true. */
export async function seedDemoData(db: Db, uploadDir: string, loadPhoto: (name: string) => Promise<Buffer>, now = new Date()): Promise<boolean> {
  if (db.prepare("SELECT 1 FROM site_settings WHERE key = 'demoSeeded'").get()) return false;
  const names = [...new Set(APPS.flatMap((a) => a.items.flatMap((i) => i.photos)))];
  const photos = new Map(await Promise.all(names.map(async (n) => [n, await loadPhoto(n)] as const)));
  const today = todayKst(now);
  const member = db.prepare("SELECT id FROM users WHERE username = 'abcd'").get() as { id: number } | undefined;
  fs.mkdirSync(uploadDir, { recursive: true });

  db.exec('BEGIN IMMEDIATE');
  try {
    const insApp = db.prepare(`INSERT INTO applications (request_code, user_id, lookup_pin_hash, applicant_name, phone, zipcode, address, address_detail, elevator_info,
      moving_date, preferred_pickup_date, customer_memo, admin_memo, marketing_consented, is_demo, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`);
    const insItem = db.prepare(`INSERT INTO application_items (application_id, sort_order, category, item_name, condition_grade, customer_preference, item_note,
      handling_type, status, sale_deadline, pickup_schedule, public_notice, admin_item_memo, version, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insPhoto = db.prepare('INSERT OR IGNORE INTO item_photos (item_id, stored_name, original_name, mime_type, byte_size, photo_tag, sort_order, created_at) VALUES (?,?,?,?,?,?,?,?)');
    const insHist = db.prepare('INSERT INTO status_history (application_id, item_id, actor_role, actor_name, action_type, before_json, after_json, note, created_at) VALUES (?,?,?,?,?,?,?,?,?)');
    const insSms = db.prepare('INSERT INTO sms_log (application_id, item_id, actor_name, to_phone, body, created_at) VALUES (?,?,?,?,?,?)');
    const pinHash = hashSecret(DEMO_PIN);

    APPS.forEach((a, n) => {
      const day = addDays(today, -a.ago);
      const created = utc(day, `${String(9 + (n * 5) % 12).padStart(2, '0')}:${String((n * 17) % 60).padStart(2, '0')}`);
      const moving = addDays(day, a.move);
      const pickupWish = addDays(moving, -3);
      const seq = (db.prepare('SELECT COUNT(*) AS c FROM applications WHERE request_code LIKE ?').get(`FR-${day.replaceAll('-', '')}-%`) as { c: number }).c + 1;
      const code = `FR-${day.replaceAll('-', '')}-${String(seq).padStart(3, '0')}`;
      const touched = utc(addDays(day, Math.min(a.ago, 2)), '14:20');
      const appId = Number(insApp.run(code, a.member ? member?.id ?? null : null, pinHash, a.name, a.phone, a.zip, a.addr, a.detail, a.elev, moving, pickupWish,
        a.memo, a.adminMemo ?? '', a.marketing ? 1 : 0, created, created).lastInsertRowid);
      insHist.run(appId, null, 'CUSTOMER', a.name, 'CREATED', '{}', JSON.stringify({ requestCode: code, itemCount: a.items.length }), '', created);

      a.items.forEach((it, i) => {
        const deadline = it.hand === 'RESALE' && it.status !== 'PENDING' ? addDays(moving, it.status === 'IN_PROGRESS' && a.ago > 20 ? -15 : -5) : '';
        const pickup = ['SCHEDULED', 'COMPLETED'].includes(it.status) ? `${addDays(moving, -2)} 10:00` : '';
        const notice = it.notice ?? '';
        const itemId = Number(insItem.run(appId, i, it.cat, it.name, it.cond, it.pref, it.note, it.hand, it.status, deadline, pickup, notice, it.memo ?? '',
          it.status === 'PENDING' ? 1 : 2, it.status === 'PENDING' ? created : touched).lastInsertRowid);
        it.photos.forEach((p, j) => {
          const stored = demoFileName(`${code}:${i}:${p}`);
          const buf = photos.get(p)!;
          const file = path.join(uploadDir, stored);
          if (!fs.existsSync(file)) fs.writeFileSync(file, buf);
          insPhoto.run(itemId, stored, `${p}.jpg`, 'image/jpeg', buf.length, j === 0 ? 'FULL' : 'DETAIL', j, created);
        });
        if (it.status === 'PENDING') return;
        const after = { handlingType: it.hand, status: it.status, saleDeadline: deadline, pickupSchedule: pickup, publicNotice: notice };
        if (it.status === 'CANCELED') {
          insHist.run(appId, itemId, 'CUSTOMER', a.name, 'CUSTOMER_CANCELED', '{"status":"PENDING"}', '{"status":"CANCELED"}', '지인에게 넘기기로 함', touched);
          return;
        }
        insHist.run(appId, itemId, 'ADMIN', ADMIN_NAME, 'ITEM_UPDATED', JSON.stringify({ status: 'PENDING' }), JSON.stringify(after), `${STATUS_KO.PENDING} → ${STATUS_KO[it.status]}`, touched);
        if (it.status === 'SCHEDULED' || it.status === 'COMPLETED') {
          const body = `[가구다방] ${a.name}님, 접수번호 ${code} '${it.name}' 반출 일정이 확정되었습니다. 일정: ${pickup}`;
          insSms.run(appId, itemId, ADMIN_NAME, a.phone, body, touched);
        }
      });
    });

    // 직접 추가한 일정
    const insEv = db.prepare('INSERT INTO custom_events (event_date, title) VALUES (?, ?)');
    [3, 10, -4].forEach((d, i) => insEv.run(addDays(today, d), DEMO_EVENTS[i]!));

    // 방문 기록: 15개월 전부터 오늘까지. 조금씩 늘어나고 주말에 더 많다.
    const rand = rng(20261127);
    const insVisit = db.prepare('INSERT INTO visits (day, visitor, path, is_demo, created_at) VALUES (?,?,?,1,?)');
    const PATHS = ['home', 'home', 'home', 'apply', 'lookup', 'lookup', 'login', 'my', 'signup', 'terms'];
    const SPAN = 455;
    for (let d = SPAN; d >= 0; d--) {
      const day = addDays(today, -d);
      const growth = 10 + 70 * ((SPAN - d) / SPAN) ** 1.4;
      const weekend = [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay()) ? 1.3 : 1;
      const visitors = Math.max(1, Math.round(growth * weekend * (0.75 + rand() * 0.5) * (d === 0 ? 0.45 : 1)));
      for (let v = 0; v < visitors; v++) {
        const id = crypto.createHash('sha256').update(`${day}:${v}`).digest('hex').slice(0, 16);
        const views = 1 + Math.floor(rand() * rand() * 5);
        for (let k = 0; k < views; k++) insVisit.run(day, id, PATHS[Math.floor(rand() * PATHS.length)]!, utc(day, `${String(8 + Math.floor(rand() * 15)).padStart(2, '0')}:00`));
      }
    }
    db.prepare("INSERT INTO site_settings (key, value) VALUES ('demoSeeded', ?)").run(today);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return true;
}


const DEMO_EVENTS = ['1톤 트럭 정기 점검', '물류 창고 정리', '중고 플랫폼 판매글 일괄 갱신'];

/**
 * 예시 데이터를 지운다: is_demo 접수(품목·사진·이력·문자 기록은 함께 지워진다), 사진 파일, 예시 방문 기록, 예시 일정.
 * 다시 넣지 않도록 demoSeeded 표시는 'cleared'로 남긴다. 실제 고객의 접수와 방문 기록은 건드리지 않는다.
 */
export function clearDemoData(db: Db, uploadDir: string) {
  const files = (db.prepare('SELECT p.stored_name AS n FROM item_photos p JOIN application_items i ON i.id = p.item_id JOIN applications a ON a.id = i.application_id WHERE a.is_demo = 1').all() as { n: string }[]).map((r) => r.n);
  db.exec('BEGIN IMMEDIATE');
  try {
    const apps = Number(db.prepare('DELETE FROM applications WHERE is_demo = 1').run().changes);
    const visits = Number(db.prepare('DELETE FROM visits WHERE is_demo = 1').run().changes);
    const events = Number(db.prepare(`DELETE FROM custom_events WHERE title IN (${DEMO_EVENTS.map(() => '?').join(',')})`).run(...DEMO_EVENTS).changes);
    db.prepare("INSERT INTO site_settings (key, value) VALUES ('demoSeeded', 'cleared') ON CONFLICT(key) DO UPDATE SET value = 'cleared'").run();
    db.exec('COMMIT');
    for (const n of files) fs.rmSync(path.join(uploadDir, n), { force: true });
    return { applications: apps, visits, events, files: files.length };
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}