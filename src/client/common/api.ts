import type { ApiErr, ApiOk } from '../../shared/types.js';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fieldErrors?: Record<string, string>) { super(message); }
}

async function request<T>(method: string, url: string, body?: unknown, extra: RequestInit = {}): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method, credentials: 'same-origin', ...extra,
    headers: { ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(extra.headers ?? {}) },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as ApiOk<T> | ApiErr | null;
  if (!json) throw new ApiError(res.status, 'BAD_RESPONSE', '서버 응답을 해석할 수 없습니다.');
  if (!json.ok) throw new ApiError(res.status, json.error.code, json.error.message, json.error.fieldErrors);
  return json.data;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown, extra?: RequestInit) => request<T>('POST', url, body, extra),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body),
};
