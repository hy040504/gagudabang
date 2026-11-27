// 관리자 통계 차트. 라이브러리 없이 SVG와 HTML로 그린다.
// 색은 tokens.css의 --chart-* 토큰을 클래스로 고르고, 이름과 값은 textContent로만 넣는다(HTML로 해석하지 않는다).
// 모든 값은 각 차트 아래 "표로 보기"에도 있다. 툴팁은 보조 수단이다.

const NS = 'http://www.w3.org/2000/svg';
const num = (n: number) => n.toLocaleString('ko-KR');

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, cls = '') {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (cls) e.setAttribute('class', cls);
  return e;
}

// ---------- 툴팁: 화면에 하나만 두고 차트들이 같이 쓴다 ----------
export interface TipRow { name: string; value: string; cls?: string }
let tip: HTMLDivElement | null = null;
export function showTip(x: number, y: number, title: string, rows: TipRow[]) {
  if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tip'; tip.setAttribute('aria-hidden', 'true'); document.body.append(tip); }
  const head = document.createElement('div');
  head.className = 'chart-tip-title';
  head.textContent = title;
  tip.replaceChildren(head, ...rows.map((r) => {
    const row = document.createElement('div');
    row.className = 'chart-tip-row';
    const key = document.createElement('i');
    key.className = `key ${r.cls ?? ''}`;
    const v = document.createElement('b');
    v.textContent = r.value;
    const n = document.createElement('span');
    n.textContent = r.name;
    row.append(key, v, n);
    return row;
  }));
  tip.hidden = false;
  // 포인터 오른쪽 위에 두고, 화면 밖으로 나가면 반대쪽으로 넘긴다
  const w = tip.offsetWidth, h = tip.offsetHeight;
  const left = x + 14 + w > innerWidth - 8 ? x - 14 - w : x + 14;
  tip.style.left = `${Math.max(8, left)}px`;
  tip.style.top = `${Math.max(8, Math.min(y - h - 10, innerHeight - h - 8))}px`;
}
export const hideTip = () => { if (tip) tip.hidden = true; };

/** 넓이가 바뀌면 다시 그린다 (휴대폰 회전, 창 크기 조절) */
function responsive(host: HTMLElement, draw: (width: number) => void) {
  let last = 0;
  const run = () => { const w = Math.round(host.clientWidth); if (w && w !== last) { last = w; draw(w); } };
  run();
  new ResizeObserver(run).observe(host);
}

/** 0부터 시작하는 보기 좋은 최댓값과 눈금 (1, 2, 5 단위) */
function niceScale(max: number, steps = 4) {
  if (max <= 0) return { top: steps, ticks: Array.from({ length: steps + 1 }, (_, i) => i) };
  const raw = max / steps, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const stepInt = Math.max(1, Math.ceil(step));
  const top = stepInt * Math.ceil(max / stepInt);
  return { top, ticks: Array.from({ length: Math.round(top / stepInt) + 1 }, (_, i) => i * stepInt) };
}

export interface Series { name: string; cls: string; values: number[] }
export interface XYSpec {
  kind: 'line' | 'bar';
  keys: string[];
  /** 가로축 글자 (짧게) */
  tick: (key: string) => string;
  /** 툴팁 제목 (길게) */
  title: (key: string) => string;
  series: Series[];
  label: string; // 화면 읽기 프로그램이 읽는 차트 이름
}

/** 꺾은선(추이)과 세로 막대(비교). 가로축 한 칸마다 포인터·키보드로 값을 볼 수 있다. */
export function xyChart(host: HTMLElement, spec: XYSpec) {
  const n = spec.keys.length;
  const max = Math.max(0, ...spec.series.flatMap((s) => s.values));
  if (!max) { host.replaceChildren(empty()); return; }
  responsive(host, (W) => {
    const H = W < 480 ? 200 : 240;
    const m = { top: 12, right: 12, bottom: 28, left: 44 };
    const iw = W - m.left - m.right, ih = H - m.top - m.bottom;
    const { top, ticks } = niceScale(max);
    const y = (v: number) => m.top + ih - (v / top) * ih;
    const band = iw / n;
    const x = (i: number) => (spec.kind === 'bar' ? m.left + band * (i + 0.5) : m.left + (n === 1 ? iw / 2 : (iw * i) / (n - 1)));
    const svg = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': spec.label }, 'chart-svg');

    // 눈금선은 옅게, 숫자는 왼쪽에만
    for (const t of ticks) {
      svg.append(svgEl('line', { x1: m.left, x2: W - m.right, y1: y(t), y2: y(t) }, t ? 'grid' : 'axis'));
      const lab = svgEl('text', { x: m.left - 8, y: y(t), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, 'tick');
      lab.textContent = num(t);
      svg.append(lab);
    }
    // 가로축 글자: 겹치지 않을 만큼만 건너뛰며 보여 준다
    const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 56))));
    spec.keys.forEach((k, i) => {
      if ((n - 1 - i) % every) return; // 마지막 칸(오늘, 이번 달)은 늘 보이게 끝에서부터 센다
      const lab = svgEl('text', { x: x(i), y: H - 8, 'text-anchor': 'middle' }, 'tick');
      lab.textContent = spec.tick(k);
      svg.append(lab);
    });

    const marks: SVGElement[][] = spec.series.map(() => []);
    if (spec.kind === 'bar') {
      const s = spec.series[0]!;
      const bw = Math.max(2, Math.min(36, band - 4)); // 막대 사이는 바탕색 틈
      s.values.forEach((v, i) => {
        const h = Math.max(v ? 2 : 0, y(0) - y(v)), r = Math.min(4, bw / 2, h);
        const x0 = x(i) - bw / 2, y0 = y(0) - h;
        // 위쪽 끝만 둥글게, 바닥은 축에 붙인다
        const d = `M${x0},${y(0)}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + bw - r}Q${x0 + bw},${y0} ${x0 + bw},${y0 + r}V${y(0)}Z`;
        const bar = svgEl('path', { d }, `bar ${s.cls}`);
        svg.append(bar);
        marks[0]!.push(bar);
      });
    } else {
      spec.series.forEach((s, si) => {
        const pts = s.values.map((v, i) => `${x(i)},${y(v)}`);
        if (si === 0) svg.append(svgEl('path', { d: `M${x(0)},${y(0)}L${pts.join('L')}L${x(n - 1)},${y(0)}Z` }, `area ${s.cls}`));
        svg.append(svgEl('path', { d: `M${pts.join('L')}` }, `line ${s.cls}`));
        s.values.forEach((v, i) => {
          const dot = svgEl('circle', { cx: x(i), cy: y(v), r: 4 }, `dot ${s.cls}`);
          svg.append(dot);
          marks[si]!.push(dot);
        });
      });
    }

    // 세로 안내선과 넓은 덮개: 선이나 막대를 정확히 겨누지 않아도 가장 가까운 칸을 고른다
    const cross = svgEl('line', { y1: m.top, y2: m.top + ih }, 'crosshair');
    const hit = svgEl('rect', { x: m.left, y: m.top, width: iw, height: ih, tabindex: 0, 'aria-label': `${spec.label}. 왼쪽·오른쪽 방향키로 값을 봅니다.` }, 'hit');
    svg.append(cross, hit);
    let cur = -1;
    const pick = (i: number, cx?: number, cy?: number) => {
      cur = Math.max(0, Math.min(n - 1, i));
      cross.setAttribute('x1', String(x(cur)));
      cross.setAttribute('x2', String(x(cur)));
      svg.classList.add('on');
      marks.forEach((ms) => ms.forEach((mk, j) => mk.classList.toggle('active', j === cur)));
      const r = svg.getBoundingClientRect();
      showTip(cx ?? r.left + x(cur), cy ?? r.top + y(Math.max(...spec.series.map((s) => s.values[cur]!))), spec.title(spec.keys[cur]!),
        spec.series.map((s) => ({ name: s.name, value: num(s.values[cur]!), cls: s.cls })));
    };
    const leave = () => { cur = -1; svg.classList.remove('on'); marks.forEach((ms) => ms.forEach((mk) => mk.classList.remove('active'))); hideTip(); };
    hit.addEventListener('pointermove', (e) => {
      const px = e.clientX - svg.getBoundingClientRect().left;
      pick(spec.kind === 'bar' ? Math.floor((px - m.left) / band) : Math.round(((px - m.left) / iw) * (n - 1)), e.clientX, e.clientY);
    });
    hit.addEventListener('pointerleave', leave);
    hit.addEventListener('blur', leave);
    hit.addEventListener('focus', () => pick(n - 1));
    hit.addEventListener('keydown', (e) => {
      const step = { ArrowLeft: -1, ArrowRight: 1, Home: -n, End: n }[e.key];
      if (step === undefined) return;
      e.preventDefault();
      pick((cur < 0 ? n - 1 : cur) + step);
    });
    host.replaceChildren(svg);
  });
}

export interface Part { label: string; value: number; cls: string }

/** 도넛: 전체 중 비율 (다섯 칸 이하). 가운데에 합계, 옆 목록에 이름·수·비율을 늘 보여 준다. */
export function donut(host: HTMLElement, parts: Part[], center: string) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) { host.replaceChildren(empty()); return; }
  const S = 168, R = 64, C = 2 * Math.PI * R, GAP = 2;
  const svg = svgEl('svg', { width: S, height: S, viewBox: `0 0 ${S} ${S}`, role: 'img', 'aria-label': `${center} ${num(total)}` }, 'chart-svg donut');
  svg.append(svgEl('circle', { cx: S / 2, cy: S / 2, r: R }, 'donut-track'));
  let at = 0;
  const shown = parts.filter((p) => p.value > 0);
  for (const p of shown) {
    const len = (p.value / total) * C;
    const seg = svgEl('circle', { cx: S / 2, cy: S / 2, r: R, 'stroke-dasharray': `${Math.max(0, len - (shown.length > 1 ? GAP : 0))} ${C}`, 'stroke-dashoffset': -at, transform: `rotate(-90 ${S / 2} ${S / 2})` }, `seg ${p.cls}`);
    seg.addEventListener('pointermove', (e) => showTip(e.clientX, e.clientY, p.label, [{ name: `전체의 ${pct(p.value, total)}`, value: `${num(p.value)}개`, cls: p.cls }]));
    seg.addEventListener('pointerleave', hideTip);
    svg.append(seg);
    at += len;
  }
  const big = svgEl('text', { x: S / 2, y: S / 2 - 4, 'text-anchor': 'middle' }, 'donut-total');
  big.textContent = num(total);
  const small = svgEl('text', { x: S / 2, y: S / 2 + 18, 'text-anchor': 'middle' }, 'tick');
  small.textContent = center;
  svg.append(big, small);
  host.replaceChildren(svg, legend(parts, total));
}

/** 가로 막대: 항목끼리 비교. 값은 막대 옆에 늘 적는다. */
export function hbars(host: HTMLElement, parts: Part[]) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) { host.replaceChildren(empty()); return; }
  const max = Math.max(...parts.map((p) => p.value));
  const list = document.createElement('ul');
  list.className = 'hbars';
  for (const p of [...parts].sort((a, b) => b.value - a.value)) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = p.label;
    const track = document.createElement('span');
    track.className = 'track';
    const bar = document.createElement('i');
    bar.className = p.cls;
    bar.style.inlineSize = `${(p.value / max) * 100}%`;
    if (p.value) track.append(bar); // 0은 막대를 그리지 않는다
    const v = document.createElement('b');
    v.textContent = `${num(p.value)} (${pct(p.value, total)})`;
    li.append(name, track, v);
    list.append(li);
  }
  host.replaceChildren(list);
}

/** 한 줄 100% 막대: 몇 개 안 되는 구분의 구성 */
export function stack(host: HTMLElement, parts: Part[]) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) { host.replaceChildren(empty()); return; }
  const bar = document.createElement('div');
  bar.className = 'stack';
  for (const p of parts.filter((q) => q.value)) {
    const seg = document.createElement('i');
    seg.className = p.cls;
    seg.style.flexGrow = String(p.value);
    seg.addEventListener('pointermove', (e) => showTip(e.clientX, e.clientY, p.label, [{ name: `전체의 ${pct(p.value, total)}`, value: `${num(p.value)}개`, cls: p.cls }]));
    seg.addEventListener('pointerleave', hideTip);
    bar.append(seg);
  }
  host.replaceChildren(bar, legend(parts, total));
}

const pct = (v: number, total: number) => `${Math.round((v / total) * 100)}%`;

function legend(parts: Part[], total: number) {
  const ul = document.createElement('ul');
  ul.className = 'chart-legend';
  for (const p of parts) {
    const li = document.createElement('li');
    const key = document.createElement('i');
    key.className = `key box ${p.cls}`;
    const name = document.createElement('span');
    name.textContent = p.label;
    const v = document.createElement('b');
    v.textContent = `${num(p.value)} · ${pct(p.value, total)}`;
    li.append(key, name, v);
    ul.append(li);
  }
  return ul;
}

function empty() {
  const p = document.createElement('p');
  p.className = 'chart-empty';
  p.textContent = '이 기간에는 기록이 없습니다.';
  return p;
}
