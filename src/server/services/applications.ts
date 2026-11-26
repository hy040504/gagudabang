import type { Db } from '../db.js';
import { tx } from '../db.js';
import { AppError, hashSecret, isIsoDate, normalizePhone, todayKst } from '../lib.js';
import { removeFiles, storeImage } from './media.js';
import {
  CATEGORIES, CONDITIONS, DEFAULT_PUBLIC_NOTICE, ELEVATORS, HANDLING_TYPES, ITEM_STATUSES, PREFERENCES, TRANSITIONS,
  type AdminApplicationDetailDto, type AdminItemDto, type AdminItemPatchDto, type ApplicationPayload, type ItemStatus,
  type PublicApplicationDto, type PublicItemDto, type StatusHistoryDto,
} from '../../shared/types.js';

type Row = Record<string, any>; // node:sqlite 행은 unknown 값 — DTO 변환 지점에서만 느슨하게 다룬다.

// ---------- 조회 + 직렬화 ----------
function photosOf(db: Db, itemId: number): PublicItemDto['photos'] {
  return (db.prepare('SELECT stored_name, photo_tag, mime_type FROM item_photos WHERE item_id = ? ORDER BY sort_order, id').all(itemId) as Row[])
    .map((p) => ({ storedName: p.stored_name, url: `/api/uploads/${p.stored_name}`, photoTag: p.photo_tag, mimeType: p.mime_type }));
}

function publicItem(db: Db, r: Row): PublicItemDto {
  return {
    id: r.id, category: r.category, itemName: r.item_name, conditionGrade: r.condition_grade, customerPreference: r.customer_preference,
    itemNote: r.item_note, handlingType: r.handling_type, status: r.status, saleDeadline: r.sale_deadline, pickupSchedule: r.pickup_schedule,
    publicNotice: r.public_notice || DEFAULT_PUBLIC_NOTICE[r.status as ItemStatus], photos: photosOf(db, r.id),
  };
}

/** FN-11: 필드를 하나씩 골라 담는 화이트리스트 방식 — admin_memo/admin_item_memo/lookup_pin_hash는 구조적으로 포함될 수 없다. */
export function toPublicApplicationDto(db: Db, a: Row): PublicApplicationDto {
  const items = db.prepare('SELECT * FROM application_items WHERE application_id = ? ORDER BY sort_order, id').all(a.id) as Row[];
  return {
    requestCode: a.request_code, applicantName: a.applicant_name, phone: a.phone, zipcode: a.zipcode, address: a.address,
    addressDetail: a.address_detail, elevatorInfo: a.elevator_info, movingDate: a.moving_date, preferredPickupDate: a.preferred_pickup_date,
    customerMemo: a.customer_memo, createdAt: a.created_at, items: items.map((i) => publicItem(db, i)),
  };
}

export function toAdminApplicationDetailDto(db: Db, a: Row): AdminApplicationDetailDto {
  const { items: _omit, ...base } = toPublicApplicationDto(db, a);
  const rows = db.prepare('SELECT * FROM application_items WHERE application_id = ? ORDER BY sort_order, id').all(a.id) as Row[];
  const items: AdminItemDto[] = rows.map((r) => ({ ...publicItem(db, r), adminItemMemo: r.admin_item_memo, version: r.version, updatedAt: r.updated_at }));
  return { ...base, id: a.id, adminMemo: a.admin_memo, isDemo: !!a.is_demo, version: a.version, userId: a.user_id, items };
}

export const getApplicationByCode = (db: Db, code: string) =>
  db.prepare('SELECT * FROM applications WHERE request_code = ?').get(code) as Row | undefined;
export const getApplicationById = (db: Db, id: number) =>
  db.prepare('SELECT * FROM applications WHERE id = ?').get(id) as Row | undefined;

export function historyOf(db: Db, applicationId: number): StatusHistoryDto[] {
  return (db.prepare('SELECT * FROM status_history WHERE application_id = ? ORDER BY id DESC').all(applicationId) as Row[]).map((h) => ({
    id: h.id, applicationId: h.application_id, itemId: h.item_id, actorRole: h.actor_role, actorName: h.actor_name, actionType: h.action_type,
    before: JSON.parse(h.before_json), after: JSON.parse(h.after_json), note: h.note, createdAt: h.created_at,
  }));
}

function addHistory(db: Db, h: { applicationId: number; itemId?: number | null; role: 'CUSTOMER' | 'ADMIN' | 'SYSTEM'; actor: string; type: string; before?: unknown; after?: unknown; note?: string }) {
  const info = db.prepare('INSERT INTO status_history (application_id, item_id, actor_role, actor_name, action_type, before_json, after_json, note) VALUES (?,?,?,?,?,?,?,?)')
    .run(h.applicationId, h.itemId ?? null, h.role, h.actor, h.type, JSON.stringify(h.before ?? {}), JSON.stringify(h.after ?? {}), h.note ?? '');
  return Number(info.lastInsertRowid);
}

// ---------- 신청 생성 (FN-07/08/09/10) ----------
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function validatePayload(p: ApplicationPayload, today: string): void {
  const f: Record<string, string> = {};
  if (!str(p.applicantName, 50)) f.applicantName = '이름을 입력해 주세요.';
  if (!/^01\d{8,9}$/.test(normalizePhone(p.phone))) f.phone = '올바른 휴대폰 번호를 입력해 주세요.';
  if (!/^\d{4}$/.test(String(p.pin ?? ''))) f.pin = '조회용 PIN은 숫자 4자리입니다.';
  if (!str(p.address, 200)) f.address = '수거 주소를 입력해 주세요.';
  if (!ELEVATORS.includes(p.elevatorInfo)) f.elevatorInfo = '엘리베이터 정보를 선택해 주세요.';
  if (p.privacyConsented !== true) f.privacyConsented = '개인정보 수집·이용에 동의해 주세요.';
  if (!isIsoDate(p.movingDate) || p.movingDate < today) f.movingDate = '이사일은 오늘 이후 날짜여야 합니다.';
  if (!isIsoDate(p.preferredPickupDate) || p.preferredPickupDate < today) f.preferredPickupDate = '희망 반출일은 오늘 이후 날짜여야 합니다.';
  else if (isIsoDate(p.movingDate) && p.preferredPickupDate > p.movingDate) f.preferredPickupDate = '희망 반출일은 이사일 이전이어야 합니다.';
  if (!Array.isArray(p.items) || p.items.length < 1 || p.items.length > 20) f.items = '가구 품목을 1~20개 입력해 주세요.';
  else p.items.forEach((it, i) => {
    if (!CATEGORIES.includes(it.category) || !str(it.itemName, 60) || !CONDITIONS.includes(it.conditionGrade) || !PREFERENCES.includes(it.customerPreference)) f[`items.${i}`] = '품목 정보를 확인해 주세요.';
  });
  if (Object.keys(f).length) throw new AppError(422, 'VALIDATION_ERROR', '입력값을 확인해 주세요.', f);
}

export interface UploadedFile { field: string; buffer: Buffer; originalname: string }

export function createApplication(db: Db, uploadDir: string, p: ApplicationPayload, files: UploadedFile[], idemKey: string | undefined, userId: number | null = null, now = new Date()) {
  const today = todayKst(now);
  validatePayload(p, today);
  // 가구마다 사진 1장 이상: 담당자가 사진으로 상태를 확인하므로 사진 없는 품목은 받지 않는다.
  const noPhoto: Record<string, string> = {};
  p.items.forEach((_, i) => { if (!files.some((f) => f.field === `photos_${i}`)) noPhoto[`items.${i}.photos`] = '사진을 1장 이상 올려 주세요.'; });
  if (Object.keys(noPhoto).length) throw new AppError(422, 'VALIDATION_ERROR', '가구마다 사진을 1장 이상 올려 주세요.', noPhoto);

  if (idemKey) {
    const hit = db.prepare('SELECT status_code, response_json FROM idempotency_keys WHERE key = ?').get(idemKey) as Row | undefined;
    if (hit) return { status: hit.status_code as number, body: JSON.parse(hit.response_json) as unknown };
  }

  // 사진 검증/저장(UUID 이름) — 이후 DB 실패 시 전부 롤백 삭제 (FN-09)
  const stored: string[] = [];
  try {
    // 저장 즉시 stored에 기록해야, 뒤 파일이 거부되어도 앞서 저장된 파일이 롤백 대상에 남는다.
    const saved = files.map((f) => { const s = storeImage(uploadDir, f.buffer); stored.push(s.storedName); return { f, s }; });

    const result = tx(db, () => {
      const ymd = today.replaceAll('-', '');
      const n = (db.prepare('SELECT COUNT(*) AS c FROM applications WHERE request_code LIKE ?').get(`FR-${ymd}-%`) as Row).c as number;
      const requestCode = `FR-${ymd}-${String(n + 1).padStart(3, '0')}`;
      const phone = normalizePhone(p.phone);
      const appId = Number(db.prepare(`INSERT INTO applications (request_code, user_id, lookup_pin_hash, applicant_name, phone, zipcode, address, address_detail,
        elevator_info, moving_date, preferred_pickup_date, customer_memo, marketing_consented) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(requestCode, userId, hashSecret(p.pin), str(p.applicantName, 50), phone, str(p.zipcode, 10), str(p.address, 200),
          str(p.addressDetail, 100), p.elevatorInfo, p.movingDate, p.preferredPickupDate, str(p.customerMemo, 1000), p.marketingConsented ? 1 : 0).lastInsertRowid);
      const insItem = db.prepare('INSERT INTO application_items (application_id, sort_order, category, item_name, condition_grade, customer_preference, item_note) VALUES (?,?,?,?,?,?,?)');
      const insPhoto = db.prepare('INSERT INTO item_photos (item_id, stored_name, original_name, mime_type, byte_size, photo_tag, sort_order) VALUES (?,?,?,?,?,?,?)');
      p.items.forEach((it, i) => {
        const itemId = Number(insItem.run(appId, i, it.category, str(it.itemName, 60), it.conditionGrade, it.customerPreference, str(it.itemNote, 500)).lastInsertRowid);
        saved.filter((x) => x.f.field === `photos_${i}`).forEach((x, j) =>
          insPhoto.run(itemId, x.s.storedName, str(x.f.originalname, 120), x.s.mime, x.s.size, it.photoTags?.[j] === 'DETAIL' ? 'DETAIL' : 'FULL', j));
      });
      addHistory(db, { applicationId: appId, role: 'CUSTOMER', actor: str(p.applicantName, 50), type: 'CREATED', after: { requestCode, itemCount: p.items.length } });
      const body = { ok: true, data: { requestCode, movingDate: p.movingDate, preferredPickupDate: p.preferredPickupDate, itemCount: p.items.length } };
      if (idemKey) db.prepare('INSERT INTO idempotency_keys (key, endpoint, status_code, response_json) VALUES (?,?,?,?)').run(idemKey, 'POST /api/applications', 201, JSON.stringify(body));
      return { status: 201, body };
    });
    return result;
  } catch (e) {
    removeFiles(uploadDir, stored);
    throw e;
  }
}

// ---------- 고객 취소 (FN-12) ----------
export function cancelByCustomer(db: Db, app: Row, actor: string, reason: string) {
  tx(db, () => {
    const items = db.prepare('SELECT * FROM application_items WHERE application_id = ?').all(app.id) as Row[];
    if (items.some((i) => i.status !== 'PENDING')) throw new AppError(409, 'TRANSITION_DENIED', '이미 진행 중인 신청은 온라인으로 취소할 수 없습니다. 고객센터로 문의해 주세요.');
    const upd = db.prepare("UPDATE application_items SET status = 'CANCELED', public_notice = ?, version = version + 1, updated_at = datetime('now') WHERE id = ?");
    for (const i of items) {
      upd.run(reason ? `고객 요청으로 취소되었습니다. (${reason})` : '고객 요청으로 취소되었습니다.', i.id);
      addHistory(db, { applicationId: app.id, itemId: i.id, role: 'CUSTOMER', actor, type: 'CUSTOMER_CANCELED', before: { status: 'PENDING' }, after: { status: 'CANCELED' }, note: reason });
    }
  });
}

// ---------- 관리자 품목 처리 (FN-20) ----------
export const isAllowedTransition = (from: ItemStatus, to: ItemStatus) => from === to || TRANSITIONS[from].includes(to);

export function updateItemWorkflow(db: Db, itemId: number, patch: AdminItemPatchDto, adminName: string) {
  const f: Record<string, string> = {};
  if (!HANDLING_TYPES.includes(patch.handlingType)) f.handlingType = '처리 구분이 올바르지 않습니다.';
  if (!ITEM_STATUSES.includes(patch.status)) f.status = '상태가 올바르지 않습니다.';
  if (!Number.isInteger(patch.version)) f.version = 'version이 필요합니다.';
  if (patch.saleDeadline && !isIsoDate(patch.saleDeadline)) f.saleDeadline = '판매 마감일 형식이 올바르지 않습니다.';
  if (Object.keys(f).length) throw new AppError(422, 'VALIDATION_ERROR', '입력값을 확인해 주세요.', f);

  return tx(db, () => {
    const cur = db.prepare('SELECT * FROM application_items WHERE id = ?').get(itemId) as Row | undefined;
    if (!cur) throw new AppError(404, 'NOT_FOUND', '대상 가구 품목을 찾을 수 없습니다.');
    if (cur.version !== patch.version) throw new AppError(409, 'VERSION_CONFLICT', '다른 관리자가 먼저 변경했습니다. 최신 상태를 확인해 주세요.');
    if (!isAllowedTransition(cur.status, patch.status)) throw new AppError(409, 'TRANSITION_DENIED', `현재 상태(${cur.status})에서 ${patch.status}(으)로 변경할 수 없습니다.`);
    const app = getApplicationById(db, cur.application_id)!;
    const pickup = str(patch.pickupSchedule, 40);
    const notice = str(patch.publicNotice, 500);
    if (patch.status === 'SCHEDULED' && !pickup) throw new AppError(422, 'VALIDATION_ERROR', '반출예정 상태로 변경하려면 확정 반출 일정을 입력해야 합니다.', { pickupSchedule: '확정 반출 일정이 필요합니다.' });
    if (patch.status === 'CANCELED' && cur.status !== 'CANCELED' && !notice) throw new AppError(422, 'VALIDATION_ERROR', '취소·반려 사유를 고객 안내문에 입력해야 합니다.', { publicNotice: '사유가 필요합니다.' });
    if (patch.saleDeadline && patch.saleDeadline > app.moving_date) throw new AppError(422, 'VALIDATION_ERROR', '판매 마감일은 이사일 이전이어야 합니다.', { saleDeadline: '이사일 이전이어야 합니다.' });

    db.prepare(`UPDATE application_items SET handling_type=?, status=?, sale_deadline=?, pickup_schedule=?, public_notice=?, admin_item_memo=?,
      version = version + 1, updated_at = datetime('now') WHERE id = ?`)
      .run(patch.handlingType, patch.status, patch.saleDeadline ?? '', pickup, notice, str(patch.adminItemMemo, 1000), itemId);
    const pick = (r: Row) => ({ handlingType: r.handling_type ?? r.handlingType, status: r.status, saleDeadline: r.sale_deadline ?? r.saleDeadline, pickupSchedule: r.pickup_schedule ?? r.pickupSchedule, publicNotice: r.public_notice ?? r.publicNotice });
    const historyId = addHistory(db, {
      applicationId: cur.application_id, itemId, role: 'ADMIN', actor: adminName, type: 'ITEM_UPDATED',
      before: pick(cur), after: pick({ ...patch, pickupSchedule: pickup, publicNotice: notice }), note: str(patch.note, 300),
    });
    const next = db.prepare('SELECT * FROM application_items WHERE id = ?').get(itemId) as Row;
    const item: AdminItemDto = { ...publicItem(db, next), adminItemMemo: next.admin_item_memo, version: next.version, updatedAt: next.updated_at };
    const historyEntry = historyOf(db, cur.application_id).find((h) => h.id === historyId)!;
    return { item, historyEntry };
  });
}

export function updateAdminMemo(db: Db, appId: number, adminMemo: string, version: number, adminName: string) {
  tx(db, () => {
    const cur = getApplicationById(db, appId);
    if (!cur) throw new AppError(404, 'NOT_FOUND', '신청 건을 찾을 수 없습니다.');
    if (cur.version !== version) throw new AppError(409, 'VERSION_CONFLICT', '다른 관리자가 먼저 변경했습니다. 최신 상태를 확인해 주세요.');
    db.prepare("UPDATE applications SET admin_memo = ?, version = version + 1, updated_at = datetime('now') WHERE id = ?").run(str(adminMemo, 2000), appId);
    addHistory(db, { applicationId: appId, role: 'ADMIN', actor: adminName, type: 'MEMO_UPDATED', note: '운영 메모 수정' });
  });
}

export function claimApplication(db: Db, appId: number, userId: number, actor: string) {
  tx(db, () => {
    db.prepare('UPDATE applications SET user_id = ? WHERE id = ?').run(userId, appId);
    addHistory(db, { applicationId: appId, role: 'CUSTOMER', actor, type: 'CLAIMED', after: { userId } });
  });
}
