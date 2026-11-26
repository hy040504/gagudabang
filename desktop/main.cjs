// 운영자용 Electron 래퍼. 서버(npm start)가 떠 있어야 한다. 주소는 GAGU_URL로 변경 가능.
const { app, BrowserWindow } = require('electron');
const http = require('node:http');
const base = process.env.GAGU_URL || 'http://127.0.0.1:3000';

function waitForServer(tries = 30) {
  return new Promise((resolve, reject) => {
    const ping = (n) => http.get(base + '/api/health', (r) => { r.resume(); r.statusCode === 200 ? resolve() : retry(n); }).on('error', () => retry(n));
    const retry = (n) => (n <= 0 ? reject(new Error('서버에 연결할 수 없습니다: ' + base)) : setTimeout(() => ping(n - 1), 500));
    ping(tries);
  });
}

app.whenReady().then(async () => {
  await waitForServer();
  const win = new BrowserWindow({ width: 1440, height: 900, title: '가구다방 파트너스 스튜디오', webPreferences: { contextIsolation: true, nodeIntegration: false } });
  win.setMenuBarVisibility(false);
  await win.loadURL(base + '/admin.html');
}).catch((e) => { console.error(e.message); app.quit(); });
app.on('window-all-closed', () => app.quit());
