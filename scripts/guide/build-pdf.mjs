// 이용 가이드(md)를 인쇄용 PDF로 만든다. 그림은 파일 안에 넣는다. 실행: node scripts/guide/build-pdf.mjs (Edge와 인터넷 연결 필요, playwright-core 필요)
// 다른 문서도 만들 수 있다: node scripts/guide/build-pdf.mjs docs/서비스_종합_설계기획서.md docs/기술_상세_기획서.md (PDF는 md 옆에 생긴다)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const G = path.join(ROOT, 'docs', 'guides');
const font = fs.readFileSync(path.join(ROOT, 'public', 'assets', 'fonts', 'PretendardVariable.woff2')).toString('base64');
const NOTE = { NOTE: '참고', TIP: '도움말', IMPORTANT: '중요', WARNING: '주의' };
const browser = await chromium.launch({ channel: 'msedge' });
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml' };
const files = process.argv.length > 2 ? process.argv.slice(2).map((f) => path.resolve(f)) : ['고객_이용_가이드', '관리자_이용_가이드'].map((n) => path.join(G, n + '.md'));
for (const file of files) {
  const dir = path.dirname(file), name = path.basename(file, '.md');
  const md = fs.readFileSync(file, 'utf8')
    // 문서 옆 상대 경로의 그림(<img src> 와 ![](...))을 파일 안에 넣는다
    .replace(/(src="|\]\()([^")]+\.(png|jpe?g|svg))(?=[")])/g, (m, pre, p, ext) => (/^(https?:|data:)/.test(p) ? m : `${pre}data:${MIME[ext.toLowerCase()]};base64,${fs.readFileSync(path.join(dir, decodeURI(p))).toString('base64')}`))
    .replace(/^> \[!(\w+)\]\r?\n/gm, (_, k) => `> **${NOTE[k] ?? k}** `) // GitHub의 안내 상자 표시를 인쇄용 글머리로 바꾼다
    .replace(/^\[가이드 목차\].*$/m, '');
  const p = await browser.newPage();
  await p.setContent(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
@font-face { font-family: Pretendard; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 45 920; }
@page { size: A4; margin: 16mm 15mm; }
body { font: 11px/1.7 Pretendard, sans-serif; color: #18202f; word-break: keep-all; overflow-wrap: anywhere; }
h1 { margin: 0 0 12px; padding: 20px 22px; border-radius: 12px; background: #14284b; color: #fff; font-size: 22px; }
h2 { margin: 26px 0 10px; padding-left: 10px; border-left: 4px solid #14284b; font-size: 16px; break-after: avoid; }
h3 { margin: 18px 0 6px; font-size: 13px; break-after: avoid; }
p { margin: 6px 0; } hr { border: 0; border-top: 1px solid #d5dbe8; margin: 18px 0; } a { color: #14284b; }
img { display: block; margin: 10px auto; border: 1px solid #d5dbe8; border-radius: 8px; break-inside: avoid; max-height: 215mm; object-fit: contain; }
table { width: 100%; margin: 8px 0 12px; border-collapse: collapse; font-size: 10px; }
th { background: #14284b; color: #fff; text-align: left; } th, td { padding: 6px 8px; border: 1px solid #d5dbe8; vertical-align: top; } tr { break-inside: avoid; }
blockquote { margin: 10px 0; padding: 8px 12px; border-left: 4px solid #14284b; background: #eef1f7; border-radius: 0 8px 8px 0; break-inside: avoid; }
code { padding: 1px 4px; border-radius: 4px; background: #eef1f7; font: 10px Consolas, monospace; }
</style></head><body><div id="doc"></div><script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script></body></html>`);
  await p.waitForFunction(() => window.marked, null, { timeout: 20000 });
  await p.evaluate((md) => { document.getElementById('doc').innerHTML = marked.parse(md); }, md);
  await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {})).concat(document.fonts.ready)));
  const out = path.join(dir, name + '.pdf');
  await p.pdf({ path: out, format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: `<div style="width:100%;padding:0 15mm;font:8px sans-serif;color:#667;display:flex;justify-content:space-between"><span>가구다방 ${name.replaceAll('_', ' ')}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>` });
  console.log(name + '.pdf', Math.round(fs.statSync(out).size / 1024) + 'KB');
  await p.close();
}
await browser.close();
