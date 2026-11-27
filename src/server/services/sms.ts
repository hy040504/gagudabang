import crypto from 'node:crypto';
import { AppError } from '../lib.js';

/** 문자 발송 설정. endpoint는 테스트에서 가짜 서버로 바꿀 때만 쓴다. */
export interface SmsConfig { apiKey: string; apiSecret: string; sender: string; endpoint?: string }

const SOLAPI_SEND = 'https://api.solapi.com/messages/v4/send-many/detail';

/** 환경 변수 세 개가 모두 있을 때만 발송 기능을 켠다 (SOLAPI_API_KEY, SOLAPI_API_SECRET, SMS_SENDER). */
export function smsFromEnv(env: NodeJS.ProcessEnv = process.env): SmsConfig | undefined {
  const { SOLAPI_API_KEY: apiKey, SOLAPI_API_SECRET: apiSecret, SMS_SENDER: sender } = env;
  return apiKey && apiSecret && sender ? { apiKey, apiSecret, sender: sender.replace(/\D/g, '') } : undefined;
}

/**
 * 솔라피(SOLAPI)로 문자 한 건을 보낸다. 90바이트를 넘는 문구는 솔라피가 장문으로 보낸다.
 * 발신번호는 솔라피에 미리 등록한 번호여야 한다. 실패하면 502 SMS_FAILED를 던진다.
 */
export async function sendSms(cfg: SmsConfig, to: string, text: string): Promise<void> {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString('hex');
  const signature = crypto.createHmac('sha256', cfg.apiSecret).update(date + salt).digest('hex');
  let status = 0;
  type Reply = { failedMessageList?: { statusMessage?: string }[]; errorMessage?: string } | null;
  let body: Reply = null;
  try {
    const res = await fetch(cfg.endpoint ?? SOLAPI_SEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `HMAC-SHA256 apiKey=${cfg.apiKey}, date=${date}, salt=${salt}, signature=${signature}` },
      body: JSON.stringify({ messages: [{ to: to.replace(/\D/g, ''), from: cfg.sender, text }] }),
      signal: AbortSignal.timeout(10_000),
    });
    status = res.status;
    body = (await res.json().catch(() => null)) as Reply;
  } catch {
    throw new AppError(502, 'SMS_FAILED', '문자 발송 서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
  }
  // 응답이 200이어도 failedMessageList에 들어 있으면 접수되지 않은 것이다
  const failed = body?.failedMessageList?.[0];
  if (status < 200 || status >= 300 || failed) {
    const why = String(failed?.statusMessage ?? body?.errorMessage ?? '').slice(0, 200);
    throw new AppError(502, 'SMS_FAILED', `문자를 보내지 못했습니다.${why ? ` (${why})` : ''}`);
  }
}
