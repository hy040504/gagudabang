// 운영자용 Electron 래퍼: 서버의 관리자 화면을 창 하나로 연다.
// 주소는 GAGU_URL로 바꿀 수 있다. 정하지 않으면 설치한 앱은 배포된 서버를, 개발 실행(npm run desktop)은 로컬 서버(npm start)를 연다.
const { app, BrowserWindow } = require('electron');
const base = process.env.GAGU_URL || (app.isPackaged ? 'https://gagudabang.vercel.app' : 'http://127.0.0.1:3000');

async function waitForServer(tries = 30) {
  for (let n = 0; n < tries; n++) {
    try { if ((await fetch(base + '/api/health')).ok) return; } catch { /* 아직 안 떴다 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('서버에 연결할 수 없습니다: ' + base);
}

app.whenReady().then(async () => {
  await waitForServer();
  const win = new BrowserWindow({ width: 1440, height: 900, title: '가구다방 파트너스 스튜디오', webPreferences: { contextIsolation: true, nodeIntegration: false } });
  win.setMenuBarVisibility(false);
  await win.loadURL(base + '/admin.html');
}).catch((e) => { console.error(e.message); app.quit(); });
app.on('window-all-closed', () => app.quit());
