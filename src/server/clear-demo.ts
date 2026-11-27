// 예시 데이터 지우기: npm run demo:clear (npm run build 뒤에, 서버를 끈 상태에서)
// 실제 운영을 시작하기 전에 한 번 실행한다. 다시 넣지 않으려면 서버의 .env에 DEMO_DATA=0도 넣는다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { clearDemoData } from './demo.js';

const dataDir = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'), 'data');
const db = openDb(path.join(dataDir, 'gagudabang.sqlite'));
const r = clearDemoData(db, path.join(dataDir, 'uploads'));
db.close();
console.log(`예시 데이터를 지웠습니다: 접수 ${r.applications}건, 사진 ${r.files}장, 방문 기록 ${r.visits}줄, 일정 ${r.events}개`);
