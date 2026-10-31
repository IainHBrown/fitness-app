// Small dependency-free SVG charts, styled by theme tokens.
// Tap or drag across a chart to read values.
import { h } from './dom.js';
import { daysBetween, parseKey } from '../dates.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 340;                           // viewBox width; the SVG scales to its container
const PAD = { l: 36, r: 8, t: 18, b: 20 };

const el = (tag, attrs = {}, style) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (style) e.setAttribute('style', style);
  return e;
};

export const shortDate = (key) => parseKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// "Nice" axis ticks covering [min, max].
function ticks(min, max, count = 3) {
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(+v.toFixed(6));
  return out;
}

function frame(height, yTicks, y, fmt) {
  const svg = el('svg', { viewBox: `0 0 ${W} ${height}`, class: 'chart-svg', role: 'img' });
  for (const t of yTicks) {
    svg.append(el('line', { x1: PAD.l, x2: W - PAD.r, y1: y(t), y2: y(t) }, 'stroke: var(--line); stroke-width: 1'));
    const label = el('text', { x: PAD.l - 6, y: y(t) + 3.5, 'text-anchor': 'end', class: 'chart-axis' });
    label.textContent = fmt(t);
    svg.append(label);
  }
  return svg;
}

function xLabels(svg, height, left, right) {
  [[PAD.l, 'start', left], [W - PAD.r, 'end', right]].forEach(([x, anchor, text]) => {
    const t = el('text', { x, y: height - 5, 'text-anchor': anchor, class: 'chart-axis' });
    t.textContent = text;
    svg.append(t);
  });
}

function goalLine(svg, y, goal) {
  if (goal == null) return;
  svg.append(el('line', { x1: PAD.l, x2: W - PAD.r, y1: y(goal), y2: y(goal) },
    'stroke: var(--good); stroke-width: 1.2; stroke-dasharray: 4 4; opacity: 0.8'));
}

// Read-out on tap/drag: vertical guide + "label · value" at the top.
function interactive(svg, height, points, xOf, describe) {
  if (!points.length) return;
  const guide = el('line', { y1: PAD.t - 4, y2: height - PAD.b, visibility: 'hidden' }, 'stroke: var(--text-3); stroke-width: 1');
  const dot = el('circle', { r: 4, visibility: 'hidden' }, 'fill: var(--text); stroke: var(--bg); stroke-width: 2');
  const label = el('text', { y: 11, class: 'chart-tip', visibility: 'hidden' });
  svg.append(guide, dot, label);

  const show = (evt) => {
    const box = svg.getBoundingClientRect();
    const vx = ((evt.clientX - box.left) / box.width) * W;
    let best = points[0];
    for (const p of points) if (Math.abs(xOf(p) - vx) < Math.abs(xOf(best) - vx)) best = p;
    const x = xOf(best);
    guide.setAttribute('x1', x); guide.setAttribute('x2', x);
    dot.setAttribute('cx', x); dot.setAttribute('cy', best.py);
    label.textContent = describe(best);
    label.setAttribute('x', Math.min(Math.max(x, PAD.l + 60), W - PAD.r - 60));
    label.setAttribute('text-anchor', 'middle');
    for (const e of [guide, dot, label]) e.setAttribute('visibility', 'visible');
  };
  const hide = () => { for (const e of [guide, dot, label]) e.setAttribute('visibility', 'hidden'); };
  svg.addEventListener('pointerdown', (e) => { svg.setPointerCapture?.(e.pointerId); show(e); });
  svg.addEventListener('pointermove', (e) => e.buttons && show(e));
  svg.addEventListener('pointerup', () => setTimeout(hide, 1600));
  svg.style.touchAction = 'pan-y';
}

const empty = (text, height) => h('div', { class: 'chart-empty', style: { height: `${height * 0.6}px` } }, text);

// ---------- Line chart over dates ----------
// series: [{ points: [{ x: 'YYYY-MM-DD', y }], color: 'var(--accent)', dots, width, dashed }]
// The first series drives the tap read-out.
export function lineChart({ series, start, end, goal = null, height = 160, fmt = (v) => v, axisFmt = fmt, zeroBased = false, emptyText = 'Not enough data yet' }) {
  const main = series[0]?.points || [];
  if (main.length < 2) return empty(emptyText, height);

  const ys = series.flatMap((s) => s.points.map((p) => p.y)).concat(goal != null ? [goal] : []);
  const yTicks = ticks(zeroBased ? 0 : Math.min(...ys), Math.max(...ys));
  const [lo, hi] = [yTicks[0], yTicks[yTicks.length - 1]];
  const span = Math.max(1, daysBetween(start, end));
  const x = (key) => PAD.l + (daysBetween(start, key) / span) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (height - PAD.t - PAD.b);

  const svg = frame(height, yTicks, y, axisFmt);
  goalLine(svg, y, goal);
  for (const s of series) {
    if (s.points.length > 1 && s.width !== 0) {
      svg.append(el('polyline', { points: s.points.map((p) => `${x(p.x)},${y(p.y)}`).join(' '), fill: 'none' },
        `stroke: ${s.color}; stroke-width: ${s.width ?? 2}; stroke-linejoin: round; stroke-linecap: round;${s.dashed ? ' stroke-dasharray: 3 4;' : ''}${s.opacity ? ` opacity: ${s.opacity};` : ''}`));
    }
    if (s.dots) for (const p of s.points) svg.append(el('circle', { cx: x(p.x), cy: y(p.y), r: s.points.length > 60 ? 1.6 : 2.6 }, `fill: ${s.color}`));
  }
  xLabels(svg, height, shortDate(start), shortDate(end));
  interactive(svg, height, main.map((p) => ({ ...p, py: y(p.y) })), (p) => x(p.x), (p) => `${shortDate(p.x)} · ${fmt(p.y)}`);
  return h('div', { class: 'chart' }, svg);
}

// ---------- Bar chart (evenly spaced bars) ----------
// bars: [{ label, y, hit }]; hit colours the bar as goal met.
export function barChart({ bars, goal = null, height = 150, fmt = (v) => v, axisFmt = fmt, emptyText = 'Nothing logged yet' }) {
  if (!bars.some((b) => b.y > 0)) return empty(emptyText, height);
  const yTicks = ticks(0, Math.max(...bars.map((b) => b.y), goal || 0));
  const hi = yTicks[yTicks.length - 1];
  const y = (v) => PAD.t + (1 - v / (hi || 1)) * (height - PAD.t - PAD.b);
  const slot = (W - PAD.l - PAD.r) / bars.length;
  const bw = Math.max(1.5, Math.min(22, slot * 0.68));
  const cx = (i) => PAD.l + slot * (i + 0.5);

  const svg = frame(height, yTicks, y, axisFmt);
  bars.forEach((b, i) => {
    if (b.y <= 0) return;
    svg.append(el('rect', { x: cx(i) - bw / 2, y: y(b.y), width: bw, height: Math.max(0, y(0) - y(b.y)), rx: Math.min(4, bw / 2) },
      `fill: ${b.hit ? 'var(--good)' : 'var(--accent)'}; opacity: ${b.hit ? 0.9 : 0.75}`));
  });
  goalLine(svg, y, goal);
  xLabels(svg, height, bars[0].label, bars[bars.length - 1].label);
  const pts = bars.map((b, i) => ({ ...b, i, py: y(b.y) }));
  interactive(svg, height, pts, (p) => cx(p.i), (p) => `${p.label} · ${fmt(p.y)}`);
  return h('div', { class: 'chart' }, svg);
}

// ---------- Sparkline ----------
export function sparkline(values, { width = 84, height = 30 } = {}) {
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'spark' });
  if (values.length < 2) return svg;
  const lo = Math.min(...values), hi = Math.max(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (width - 4) + 2},${height - 3 - ((v - lo) / (hi - lo || 1)) * (height - 6)}`);
  svg.append(el('polyline', { points: pts.join(' '), fill: 'none' }, 'stroke: var(--accent); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round'));
  return svg;
}
