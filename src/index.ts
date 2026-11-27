// Vercel 배포용 진입점. Vercel은 이 파일이 기본으로 내보낸 Express 앱을 함수 하나로 실행한다 (로컬 실행은 src/server/index.ts).
import express from 'express';
import os from 'node:os';
import path from 'node:path';
import { createApp } from './server/app.js';

// 기본 관리자 비밀번호와 임시 서명 키로 공개되지 않게 막는다. 서명 키가 인스턴스마다 다르면 로그인도 풀린다.
if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) throw new Error('ADMIN_PASSWORD와 SESSION_SECRET 환경 변수를 지정해야 합니다.');

// shortcut: 함수에서 쓸 수 있는 디스크는 임시 폴더뿐이라 인스턴스가 바뀌면 접수 데이터와 사진이 지워진다. 실제 운영 전에 외부 DB와 파일 저장소로 바꾼다.
const { app: inner } = createApp({
  dataDir: path.join(os.tmpdir(), 'gagudabang'),
  publicDir: path.resolve('public'), // 정적 파일은 Vercel이 public/에서 직접 내보내므로 여기서는 쓰이지 않는다
  adminId: process.env.ADMIN_ID,
  adminPassword: process.env.ADMIN_PASSWORD,
  secret: process.env.SESSION_SECRET,
});
// 요청이 Vercel 프록시를 거쳐 온다. 접속자 IP(요청 횟수 제한과 잠금의 기준)와 HTTPS 여부를 전달 헤더에서 읽는다.
inner.set('trust proxy', true);

// 첫 화면(/)은 vercel.json의 rewrites가 public/index.html로 이어 준다. 여기에 '/' 경로를 따로 두면 Vercel이 그 요청을 함수로 보내므로 두지 않는다.
const app = express();
app.disable('x-powered-by');
app.use(inner);

export default app;
