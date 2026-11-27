import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// 디자인 토큰(public/styles/tokens.css)의 색 짝이 밝은 화면과 어두운 화면 모두에서 읽히는지 확인한다.
// 글자는 4.5:1, 입력 칸 테두리와 포커스 표시는 3:1 이상이어야 한다 (WCAG 1.4.3, 1.4.11).
const css = fs.readFileSync(path.join(process.cwd(), 'public', 'styles', 'tokens.css'), 'utf8');
const block = (re: RegExp) => Object.fromEntries([...(re.exec(css)?.[1] ?? '').matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
const light = block(/:root \{([\s\S]*?)\n\}/);
const dark = { ...light, ...block(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/) };

function hex(tokens: Record<string, string>, name: string): string {
  let v = tokens[name];
  for (let i = 0; v?.startsWith('var(') && i < 5; i++) v = tokens[v.slice(4, -1)];
  assert.match(v ?? '', /^#[0-9a-f]{6}$/i, `${name} 토큰이 16진수 색으로 풀리지 않는다: ${v}`);
  return v!;
}
function luminance(c: string) {
  const [r, g, b] = [1, 3, 5].map((i) => { const x = parseInt(c.slice(i, i + 2), 16) / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]; return (hi + 0.05) / (lo + 0.05); };

const TEXT: Array<[string, string]> = [
  ['--text-1', '--bg-app'], ['--text-2', '--bg-app'], ['--text-3', '--bg-app'],
  ['--text-1', '--bg-card'], ['--text-2', '--bg-card'], ['--text-3', '--bg-card'],
  ['--text-3', '--bg-subtle'], ['--text-1', '--bg-hover'], ['--text-3', '--bg-muted'], ['--text-1', '--bg-input'],
  ['--primary', '--bg-app'], ['--primary', '--bg-card'], ['--primary-fg', '--primary'], ['--primary-fg', '--primary-hover'],
  ['--accent-fg', '--accent'], ['--bad-fg', '--bad'],
  ['--good', '--bg-card'], ['--warn', '--bg-card'], ['--bad', '--bg-card'], ['--bad', '--bg-app'], ['--info', '--bg-card'],
  ['--panel-fg', '--panel-bg'], ['--panel-muted', '--panel-bg'], ['--panel-action-fg', '--panel-action-bg'], ['--panel-action-fg', '--panel-action-hover'],
  ['--bg-card', '--text-1'], // 알림: 글자색 바탕에 카드색 글자
];
const NON_TEXT: Array<[string, string]> = [
  ['--border-control', '--bg-input'], ['--border-control', '--bg-app'], ['--border-control', '--bg-card'],
  ['--focus', '--bg-app'], ['--focus', '--bg-card'], ['--panel-fg', '--panel-bg'],
];

for (const [theme, tokens] of [['밝은 화면', light], ['어두운 화면', dark]] as const) {
  test(`토큰 대비: ${theme}`, () => {
    const check = (pairs: Array<[string, string]>, min: number) => {
      for (const [fg, bg] of pairs) {
        const ratio = contrast(hex(tokens, fg), hex(tokens, bg));
        assert.ok(ratio >= min, `${fg} / ${bg} = ${ratio.toFixed(2)}:1 (최소 ${min}:1)`);
      }
    };
    check(TEXT, 4.5);
    check(NON_TEXT, 3);
  });
}

test('어두운 화면 묶음은 밝은 화면에 있는 이름만 바꾼다', () => {
  for (const name of Object.keys(block(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/))) assert.ok(name in light, `${name}이 :root에 없다`);
});
