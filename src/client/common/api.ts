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
  // 호스팅 서비스가 요청 크기 제한으로 먼저 거절하면 JSON이 아닌 413이 온다
  if (!json) throw new ApiError(res.status, 'BAD_RESPONSE', res.status === 413 ? '사진 용량이 너무 큽니다. 사진 수를 줄이거나 나눠서 접수해 주세요.' : '서버 응답을 해석할 수 없습니다.');
  if (!json.ok) throw new ApiError(res.status, json.error.code, json.error.message, json.error.fieldErrors);
  return json.data;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown, extra?: RequestInit) => request<T>('POST', url, body, extra),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body),
};
