import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { BRAND_NAME } from '../shared/types.js';
import { hashSecret } from './lib.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK (role IN ('CUSTOMER', 'ADMIN')),
  login_id TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  default_zipcode TEXT NOT NULL DEFAULT '',
  default_address TEXT NOT NULL DEFAULT '',
  default_address_detail TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_code TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  lookup_pin_hash TEXT NOT NULL,
  applicant_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  zipcode TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL,
  address_detail TEXT NOT NULL DEFAULT '',
  elevator_info TEXT NOT NULL CHECK (elevator_info IN ('YES', 'NO_STAIRS', 'FIRST_FLOOR')),
  moving_date TEXT NOT NULL,
  preferred_pickup_date TEXT NOT NULL,
  customer_memo TEXT NOT NULL DEFAULT '',
  admin_memo TEXT NOT NULL DEFAULT '',
  privacy_consented INTEGER NOT NULL DEFAULT 1 CHECK (privacy_consented = 1),
  marketing_consented INTEGER NOT NULL DEFAULT 0 CHECK (marketing_consented IN (0, 1)),
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS application_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL CHECK (category IN ('BED', 'SOFA', 'DINING', 'CLOSET', 'DESK', 'ETC')),
  item_name TEXT NOT NULL,
  condition_grade TEXT NOT NULL CHECK (condition_grade IN ('BEST', 'GOOD', 'FAIR', 'POOR_DISPOSE')),
  customer_preference TEXT NOT NULL CHECK (customer_preference IN ('RESALE', 'DISPOSE', 'CONSULT')),
  item_note TEXT NOT NULL DEFAULT '',
  handling_type TEXT NOT NULL DEFAULT 'UNDECIDED' CHECK (handling_type IN ('UNDECIDED', 'RESALE', 'DISPOSE')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'SCHEDULED', 'COMPLETED', 'CANCELED')),
  sale_deadline TEXT NOT NULL DEFAULT '',
  pickup_schedule TEXT NOT NULL DEFAULT '',
  public_notice TEXT NOT NULL DEFAULT '',
  admin_item_memo TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS item_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES application_items(id) ON DELETE CASCADE,
  stored_name TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  photo_tag TEXT NOT NULL DEFAULT 'FULL' CHECK (photo_tag IN ('FULL', 'DETAIL')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES application_items(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('CUSTOMER', 'ADMIN', 'SYSTEM')),
  actor_name TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('CREATED', 'ITEM_UPDATED', 'MEMO_UPDATED', 'CUSTOMER_CANCELED', 'CLAIMED')),
  before_json TEXT NOT NULL DEFAULT '{}',
  after_json TEXT NOT NULL DEFAULT '{}',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_apps_moving_date ON applications(moving_date);
CREATE INDEX IF NOT EXISTS idx_apps_phone ON applications(phone);
CREATE INDEX IF NOT EXISTS idx_apps_user_id ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_items_app_id ON application_items(application_id);
CREATE INDEX IF NOT EXISTS idx_items_status_deadline ON application_items(status, sale_deadline);
CREATE INDEX IF NOT EXISTS idx_history_app_time ON status_history(application_id, created_at DESC);
`;

// 미확정 사업자 정보는 지어내지 않고 [TBD]로 둔다 (운영자 설정 화면에서 입력).
const DEFAULT_SETTINGS: Record<string, string> = {
  companyName: BRAND_NAME, ceoName: '[TBD]', bizNo: '[TBD]', phone: '[TBD]', hours: '[TBD]', address: '[TBD]',
};

export type Db = DatabaseSync;

export function openDb(file: string): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  const ins = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, v);
  return db;
}

/** 관리자 계정이 없을 때만 생성. 비밀번호는 호출자가 환경변수로 주입한다. */
export function ensureAdmin(db: Db, loginId: string, password: string) {
  const exists = db.prepare("SELECT 1 FROM users WHERE role = 'ADMIN' LIMIT 1").get();
  if (!exists) db.prepare("INSERT INTO users (role, login_id, password_hash, name) VALUES ('ADMIN', ?, ?, '운영 관리자')").run(loginId, hashSecret(password));
}

/** FN-26: 생성 후 24시간이 지난 멱등성 키 삭제. nowMs는 주입 가능한 현재 시각. */
export function purgeExpiredIdempotency(db: Db, nowMs: number = Date.now()): number {
  return Number(db.prepare("DELETE FROM idempotency_keys WHERE created_at < datetime(?, 'unixepoch', '-1 day')").run(Math.floor(nowMs / 1000)).changes);
}

export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}
