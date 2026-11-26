import { Router, type Request } from 'express';
import type { Db } from '../db.js';
import {
  AppError, COOKIES, FailureLock, clearCookie, dayDiff, hashSecret, isIsoDate, ok, setCookie, todayKst, verifySecret, wrap,
} from '../lib.js';
import {
  getApplicationById, historyOf, toAdminApplicationDetailDto, updateAdminMemo, updateItemWorkflow,
} from '../services/applications.js';
import { authOf, type Ctx } from './public.js';
import type { AdminApplicationSummaryDto, AdminItemPatchDto, AdminKpis, ScheduleCalendarEventDto } from '../../shared/types.js';

type Row = Record<string, any>;
const ADMIN_TTL = 12 * 3600;
const PAGE_SIZE = 20;
const SETTING_KEYS = ['companyName', 'ceoName', 'bizNo', 'phone', 'hours', 'address'] as const;

export function adminRouter(ctx: Ctx) {
  const { db, signer } = ctx;
  const r = Router();
  const lock = new FailureLock(5, 60_000, ctx.clock);

  const adminOf = (req: Request): Row | null => {
    const id = authOf(ctx, req).adminId;
    return id ? ((db.prepare("SELECT * FROM users WHERE id = ? AND role = 'ADMIN' AND is_active = 1").get(id) as Row | undefined) ?? null) : null;
  };
  const requireAdmin = (req: Request) => {
    const a = adminOf(req);
    if (!a) throw new AppError(401, 'UNAUTHORIZED', '관리자 로그인이 필요합니다.');
    return a;
  };

  r.post('/admin/login', wrap((req, res) => {
    const loginId = String(req.body?.loginId ?? '').trim();
    const key = `${req.ip}|${loginId}`;
    lock.check(key);
    const a = db.prepare("SELECT * FROM users WHERE login_id = ? AND role = 'ADMIN' AND is_active = 1").get(loginId) as Row | undefined;
    // 사용자 존재 여부와 무관하게 동일 메시지, 존재하지 않아도 scrypt 비용을 치러 타이밍 차이를 줄인다.
    const valid = a ? verifySecret(String(req.body?.password ?? ''), a.password_hash) : (verifySecret('x', hashSecret('y')), false);
    if (!a || !valid) { lock.fail(key); throw new AppError(401, 'UNAUTHORIZED', '아이디 또는 비밀번호가 올바르지 않습니다.'); }
    lock.reset(key);
    setCookie(res, COOKIES.admin, signer.sign({ aid: a.id }, ADMIN_TTL), ADMIN_TTL);
    ok(res, { admin: { loginId: a.login_id, name: a.name } });
  }));

  r.post('/admin/logout', wrap((_req, res) => { clearCookie(res, COOKIES.admin); ok(res, { loggedOut: true }); }));

  // ---- 목록/KPI (FN-17, FN-18) ----
  type Loaded = { app: Row; items: Row[] };
  // month(YYYY-MM)를 주면 그 달에 이사일·판매마감·반출 일정이 걸린 신청만(해당 신청의 전 품목 포함) 읽는다.
  const loadAll = (hideDemo: boolean, month?: string): Loaded[] => {
    const where = [
      hideDemo ? 'a.is_demo = 0' : '',
      month ? '(a.moving_date LIKE @m OR a.id IN (SELECT application_id FROM application_items WHERE sale_deadline LIKE @m OR pickup_schedule LIKE @m))' : '',
    ].filter(Boolean).join(' AND ');
    const params: Record<string, string> = month ? { m: `${month}%` } : {};
    const cond = where ? `WHERE ${where}` : '';
    const apps = db.prepare(`SELECT a.* FROM applications a ${cond} ORDER BY a.id DESC`).all(params) as Row[];
    const items = db.prepare(`SELECT i.* FROM application_items i JOIN applications a ON a.id = i.application_id ${cond} ORDER BY i.sort_order, i.id`).all(params) as Row[];
    const by = new Map<number, Row[]>();
    for (const i of items) (by.get(i.application_id) ?? by.set(i.application_id, []).get(i.application_id)!).push(i);
    return apps.map((app) => ({ app, items: by.get(app.id) ?? [] }));
  };
  const open = (s: string) => s === 'PENDING' || s === 'IN_PROGRESS' || s === 'SCHEDULED';
  const deadlineDday = (i: Row, today: string) => (i.handling_type === 'RESALE' && i.status === 'IN_PROGRESS' && i.sale_deadline ? dayDiff(today, i.sale_deadline) : null);

  const filterLoaded = (req: Request, all: Loaded[]) => {
    const status = String(req.query.status ?? ''), handling = String(req.query.handling ?? '');
    const q = String(req.query.q ?? '').trim().toLowerCase();
    return all.filter(({ app, items }) => {
      if (status && !items.some((i) => i.status === status)) return false;
      if (handling && !items.some((i) => i.handling_type === handling)) return false;
      if (!q) return true;
      return [app.applicant_name, app.phone, app.request_code, app.address, ...items.map((i) => i.item_name)].some((s) => String(s).toLowerCase().includes(q));
    });
  };

  r.get('/admin/applications', wrap((req, res) => {
    requireAdmin(req);
    const today = todayKst(new Date(ctx.clock()));
    const all = loadAll(req.query.hideDemo === '1');
    const kpis: AdminKpis = { pendingItems: 0, movingSoonApplications: 0, deadlineAlertItems: 0, pickupIn7DaysItems: 0 };
    for (const { app, items } of all) {
      if (items.some((i) => open(i.status)) && dayDiff(today, app.moving_date) <= 3) kpis.movingSoonApplications++;
      for (const i of items) {
        if (i.status === 'PENDING') kpis.pendingItems++;
        const d = deadlineDday(i, today);
        if (d !== null && d <= 1) kpis.deadlineAlertItems++;
        if (i.status === 'SCHEDULED' && isIsoDate(i.pickup_schedule.slice(0, 10))) {
          const pd = dayDiff(today, i.pickup_schedule.slice(0, 10));
          if (pd >= 0 && pd <= 7) kpis.pickupIn7DaysItems++;
        }
      }
    }
    const rows = filterLoaded(req, all);
    if (String(req.query.sort ?? '') === 'moving_asc') rows.sort((a, b) => a.app.moving_date.localeCompare(b.app.moving_date));
    const page = Math.max(1, Number(req.query.page) || 1);
    const summaries: AdminApplicationSummaryDto[] = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(({ app, items }) => ({
      id: app.id, requestCode: app.request_code, applicantName: app.applicant_name, phone: app.phone, movingDate: app.moving_date,
      preferredPickupDate: app.preferred_pickup_date, createdAt: app.created_at, isDemo: !!app.is_demo,
      movingDday: items.some((i) => open(i.status)) ? dayDiff(today, app.moving_date) : null,
      items: items.map((i) => ({ id: i.id, itemName: i.item_name, status: i.status, handlingType: i.handling_type, saleDeadline: i.sale_deadline, deadlineDday: deadlineDday(i, today) })),
    }));
    ok(res, { kpis, items: summaries, total: rows.length, page });
  }));

  // FN-19
  r.get('/admin/schedule', wrap((req, res) => {
    requireAdmin(req);
    const month = String(req.query.month ?? todayKst(new Date(ctx.clock())).slice(0, 7));
    if (!/^\d{4}-\d{2}$/.test(month)) throw new AppError(422, 'VALIDATION_ERROR', 'month 형식은 YYYY-MM 입니다.');
    const events: ScheduleCalendarEventDto[] = [];
    for (const { app, items } of loadAll(req.query.hideDemo === '1', month)) {
      const base = { applicationId: app.id, requestCode: app.request_code };
      if (app.moving_date.startsWith(month) && items.some((i) => open(i.status))) events.push({ ...base, date: app.moving_date, kind: 'MOVING', itemId: null, label: `${app.applicant_name} 이사` });
      for (const i of items) {
        if (i.sale_deadline.startsWith(month) && i.handling_type === 'RESALE' && open(i.status)) events.push({ ...base, date: i.sale_deadline, kind: 'DEADLINE', itemId: i.id, label: `${i.item_name} 판매마감` });
        const pd = i.pickup_schedule.slice(0, 10);
        if (pd.startsWith(month) && isIsoDate(pd) && i.status === 'SCHEDULED') events.push({ ...base, date: pd, kind: 'PICKUP', itemId: i.id, label: `${i.item_name} 반출` });
      }
    }
    events.sort((a, b) => a.date.localeCompare(b.date));
    ok(res, { month, events });
  }));

  r.get('/admin/applications/:id', wrap((req, res) => {
    requireAdmin(req);
    const app = getApplicationById(db, Number(req.params.id));
    if (!app) throw new AppError(404, 'NOT_FOUND', '신청 건을 찾을 수 없습니다.');
    ok(res, { application: toAdminApplicationDetailDto(db, app), history: historyOf(db, app.id) });
  }));

  r.patch('/admin/applications/:id', wrap((req, res) => {
    const admin = requireAdmin(req);
    const id = Number(req.params.id);
    if (typeof req.body?.adminMemo !== 'string' || !Number.isInteger(req.body?.version)) throw new AppError(422, 'VALIDATION_ERROR', 'adminMemo와 version이 필요합니다.');
    updateAdminMemo(db, id, req.body.adminMemo, req.body.version, admin.name);
    ok(res, { application: toAdminApplicationDetailDto(db, getApplicationById(db, id)!) });
  }));

  r.patch('/admin/items/:itemId', wrap((req, res) => {
    const admin = requireAdmin(req);
    ok(res, updateItemWorkflow(db, Number(req.params.itemId), req.body as AdminItemPatchDto, admin.name));
  }));

  // FN-22: 수식 인젝션 방어 CSV
  r.get('/admin/export/csv', wrap((req, res) => {
    requireAdmin(req);
    const cell = (v: unknown) => {
      let s = String(v ?? '');
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return `"${s.replaceAll('"', '""')}"`;
    };
    const head = ['접수번호', '신청자', '연락처', '주소', '이사일', '희망반출일', '품목', '처리구분', '상태', '판매마감일', '확정반출일정', '시연데이터'];
    const lines = [head.map(cell).join(',')];
    for (const { app, items } of filterLoaded(req, loadAll(req.query.hideDemo === '1'))) {
      for (const i of items) {
        lines.push([app.request_code, app.applicant_name, app.phone, `${app.address} ${app.address_detail}`.trim(), app.moving_date, app.preferred_pickup_date,
          i.item_name, i.handling_type, i.status, i.sale_deadline, i.pickup_schedule, app.is_demo ? 'Y' : 'N'].map(cell).join(','));
      }
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="gagudabang-${todayKst(new Date(ctx.clock()))}.csv"`);
    res.send('﻿' + lines.join('\r\n'));
  }));

  // FN-24
  r.patch('/admin/settings', wrap((req, res) => {
    const admin = requireAdmin(req);
    const { currentPassword, newPassword, siteConfig } = req.body ?? {};
    if (newPassword !== undefined) {
      if (typeof newPassword !== 'string' || newPassword.length < 8) throw new AppError(422, 'VALIDATION_ERROR', '새 비밀번호는 8자 이상이어야 합니다.', { newPassword: '8자 이상' });
      if (typeof currentPassword !== 'string' || !verifySecret(currentPassword, admin.password_hash)) throw new AppError(422, 'VALIDATION_ERROR', '현재 비밀번호가 일치하지 않습니다.', { currentPassword: '일치하지 않습니다.' });
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashSecret(newPassword), admin.id);
    }
    if (siteConfig && typeof siteConfig === 'object') {
      const up = db.prepare("INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')");
      for (const k of SETTING_KEYS) if (typeof siteConfig[k] === 'string') up.run(k, siteConfig[k].trim().slice(0, 200));
    }
    ok(res, { updated: true });
  }));

  return r;
}
