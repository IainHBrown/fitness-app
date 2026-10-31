// Reusable visual pieces: progress ring, meters, streak tiles, list rows.
import { h, fmt, animateProp } from './dom.js';
import { icon } from './icons.js';

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

// Circular progress ring (water).
export function ring({ value, goal, label, sub, animKey }) {
  const r = 50, c = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(value / goal, 1) : 0;
  const bar = svg('circle', { class: 'bar', cx: 60, cy: 60, r, fill: 'none', 'stroke-width': 11, 'stroke-linecap': 'round', 'stroke-dasharray': c });
  animateProp(bar, 'strokeDashoffset', animKey, String(c * (1 - pct)));
  const s = svg('svg', { viewBox: '0 0 120 120' });
  s.append(svg('circle', { class: 'track', cx: 60, cy: 60, r, fill: 'none', 'stroke-width': 11 }), bar);
  return h('div', { class: 'ring' + (pct >= 1 ? ' full' : '') }, s,
    h('div', { class: 'center' }, h('div', { class: 'v' }, label), h('div', { class: 'g' }, sub)));
}

// Horizontal meter toward a single target (calories).
export function targetMeter({ name, value, target, unit, animKey }) {
  const pct = target > 0 ? value / target : 0;
  const state = pct > 1.1 ? 'over' : pct >= 0.9 ? 'good' : '';
  const fill = h('div', { class: 'bar-fill ' + state });
  animateProp(fill, 'width', animKey, `${Math.min(pct, 1) * 100}%`);
  const diff = Math.round(target - value);
  const note = diff > 0 ? `${fmt(diff)} ${unit} left` : diff === 0 ? 'Right on target' : `${fmt(-diff)} ${unit} over`;
  return h('div', { class: 'meter' },
    h('div', { class: 'meter-top' },
      h('span', { class: 'name' }, name),
      h('span', { class: 'val' }, fmt(value), h('span', { class: 'of' }, ` / ${fmt(target)} ${unit}`))),
    h('div', { class: 'bar-track' }, fill),
    h('div', { class: 'meter-note' + (state === 'good' ? ' good' : '') }, note));
}

// Meter toward a range (protein): goal is hit anywhere inside [min, max].
export function rangeMeter({ name, value, min, max, unit, animKey }) {
  const scale = max * 1.15 || 1;
  const inRange = value >= min && value <= max;
  const fill = h('div', { class: 'bar-fill' + (value >= min ? ' good' : '') });
  animateProp(fill, 'width', animKey, `${Math.min(value / scale, 1) * 100}%`);
  const band = h('div', { class: 'bar-range', style: { left: `${(min / scale) * 100}%`, width: `${((max - min) / scale) * 100}%` } });
  const note = inRange ? 'Goal hit ✓' : value < min ? `${fmt(min - value)} ${unit} to go` : 'Above range';
  return h('div', { class: 'meter' },
    h('div', { class: 'meter-top' },
      h('span', { class: 'name' }, name),
      h('span', { class: 'val' }, fmt(value), h('span', { class: 'of' }, ` / ${fmt(min)}–${fmt(max)} ${unit}`))),
    h('div', { class: 'bar-track' }, band, fill),
    h('div', { class: 'meter-note' + (inRange ? ' good' : '') }, note));
}

// Small streak tile.
export function streakTile(label, iconName, s) {
  return h('div', { class: 'streak' + (s.atRisk ? ' risk' : '') + (s.todayDone ? ' done' : '') },
    h('div', { class: 'label' }, icon(iconName), label),
    h('div', { class: 'count' }, s.count, h('small', null, s.count === 1 ? 'day' : 'days')),
    s.atRisk
      ? h('div', { class: 'risk-note' }, '⚠ Streak at risk')
      : h('div', { class: 'best' }, `Best ${s.best}`));
}

// Settings-style row: label on the left, value + chevron on the right.
export function valueRow(label, value, onClick) {
  return h('button', { class: 'row', onClick },
    h('span', { class: 'grow title' }, label),
    h('span', { class: 'val' }, value),
    icon('chev'));
}

export function cardHead(title, iconName, right) {
  return h('div', { class: 'card-head' },
    h('div', { class: 'card-title' }, iconName ? icon(iconName) : null, title),
    right || null);
}
