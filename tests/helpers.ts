import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/server/app.js';

export const ADMIN_PW = 'adminpw-1234';

/** 임시 data 디렉터리 + 임의 포트로 실제 서버를 기동한다. 테스트 파일마다 격리된 DB를 쓴다. */
export function startServer(clock?: () => number) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-test-'));
  const { app, db } = createApp({ dataDir: dir, publicDir: dir, secret: 'test-secret', adminPassword: ADMIN_PW, clock });
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  return {
    base, db, dir, app,
    close: () => { srv.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); },
  };
}

export interface Res { status: number; json: any; text: string; headers: Headers; bytes: Uint8Array }

/** 쿠키 항아리를 가진 간이 클라이언트. 항아리마다 별개의 브라우저로 취급한다. */
export function client(base: string) {
  const jar = new Map<string, string>();
  const call = async (method: string, url: string, body?: unknown, opts: { form?: FormData; headers?: Record<string, string> } = {}): Promise<Res> => {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(base + url, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...opts.headers },
      body: opts.form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    for (const c of res.headers.getSetCookie()) {
      const kv = c.split(';')[0]!;
      const i = kv.indexOf('=');
      const [k, v] = [kv.slice(0, i), kv.slice(i + 1)];
      if (c.includes('Max-Age=0')) jar.delete(k); else jar.set(k, v);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
    let json: any = null;
    if ((res.headers.get('content-type') ?? '').includes('json')) json = JSON.parse(text);
    return { status: res.status, json, text, headers: res.headers, bytes };
  };
  return { call, jar };
}

// ---- 테스트용 이미지 ----
const SOS_AND_EOI = Buffer.from([0xff, 0xda, 0x00, 0x02, 1, 2, 3, 0xff, 0xd9]);
export const GPS_MARK = 'GPSDATA-LAT-LON';
/** GPS 문자열을 담은 APP1(Exif) 세그먼트가 들어 있는 최소 JPEG. */
export function jpegWithGps(): Buffer {
  const data = Buffer.concat([Buffer.from('Exif\0\0'), Buffer.from(GPS_MARK)]);
  const len = Buffer.alloc(2); len.writeUInt16BE(data.length + 2);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from([0xff, 0xe1]), len, data, SOS_AND_EOI]);
}

export function validPayload(over: Record<string, unknown> = {}) {
  return {
    applicantName: '테스터', phone: '010-1234-5678', pin: '4321', address: '청주시', elevatorInfo: 'YES',
    movingDate: '2099-12-31', preferredPickupDate: '2099-12-20', privacyConsented: true,
    items: [
      { category: 'SOFA', itemName: '소파', conditionGrade: 'BEST', customerPreference: 'RESALE' },
      { category: 'DINING', itemName: '식탁', conditionGrade: 'POOR_DISPOSE', customerPreference: 'DISPOSE' },
    ],
    ...over,
  };
}

/** files를 생략하면 payload의 품목마다 사진 1장을 붙인다 (서버가 품목별 사진 1장 이상을 요구한다). */
export function applicationForm(payload: unknown, files?: [field: string, data: Buffer, name: string][]) {
  const items = (payload as { items?: unknown })?.items;
  files ??= Array.from({ length: Array.isArray(items) ? items.length : 0 }, (_, i) => [`photos_${i}`, jpegWithGps(), `p${i}.jpg`] as [string, Buffer, string]);
  const f = new FormData();
  f.set('payload', JSON.stringify(payload));
  for (const [field, data, name] of files) f.append(field, new Blob([new Uint8Array(data)]), name);
  return f;
}
