// Progress tab: streaks, body weight, sleep, water, nutrition, strength and
// running trends over 7 days / 30 days / all time.
import { h, mount, fmt } from './dom.js';
import { icon } from './icons.js';
import { cardHead, streakTile } from './components.js';
import { lineChart, barChart, sparkline, shortDate } from './chart.js';
import { go } from './router.js';
import { state, getDay } from '../store/state.js';
import { todayKey } from '../dates.js';
import { waterStreak, workoutStreak, supplementStreak } from '../logic/streaks.js';
import * as S from '../logic/stats.js';
import { allRuns, toDisplay, unit, KM_PER_MI } from '../logic/runs.js';

const RANGES = [['7', '7 days'], ['30', '30 days'], ['all', 'All time']];
let range = (() => { try { return localStorage.getItem('progress-range') || '30'; } catch { return '30'; } })();

export function renderProgress(root) {
  const { start, end } = S.rangeBounds(range);
  mount(root,
    h('header', { class: 'page-head' }, h('div', null, h('div', { class: 'eyebrow' }, 'Trends'), h('h1', null, 'Progress'))),
    h('div', { class: 'segmented sticky-seg' }, RANGES.map(([id, label]) =>
      h('button', { class: range === id ? 'on' : '', onClick: () => setRange(root, id) }, label))),
    h('div', { class: 'streaks', style: { marginTop: 'var(--gap)' } },
      streakTile('Water', 'drop', waterStreak()),
      streakTile('Workouts', 'workouts', workoutStreak()),
      streakTile('Supplements', 'pill', supplementStreak())),
    weightCard(start, end),
    sleepCard(start, end),
    waterCard(start, end),
    nutritionCard(start, end),
    strengthCard(start, end),
    runningCard(start, end));
}

function setRange(root, id) {
  range = id;
  try { localStorage.setItem('progress-range', id); } catch { /* private mode */ }
  root.replaceChildren();
  renderProgress(root);
}

const bigStat = (value, unitText, sub) => h('div', { class: 'big-stat' },
  h('div', { class: 'v' }, value, unitText ? h('span', { class: 'u' }, unitText) : null),
  sub ? h('div', { class: 'sub' }, sub) : null);

const miniStats = (items) => h('div', { class: 'mini-stats' }, items.map(([l, v]) =>
  h('div', null, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v))));

const legend = (items) => h('div', { class: 'legend' }, items.map(([color, label, dashed]) =>
  h('span', null, h('i', { style: { background: dashed ? 'none' : color, borderTop: dashed ? `2px dashed ${color}` : null, height: dashed ? '0' : null } }), label)));

const shortDay = (key) => shortDate(key);

// ---------- Body weight ----------

function weightCard(start, end) {
  const goal = state.settings.weight.goal;
  const pts = S.weightPoints(start, end);
  const ma = S.movingAverage(start, end);
  const rate = S.weeklyRate(ma.length >= 2 ? ma : pts);
  const current = ma.length ? ma[ma.length - 1].y : null;
  const toGoal = current != null ? current - goal : null;

  let sub = 'Log your weight a few mornings a week';
  if (current != null) {
    sub = toGoal > 0.05 ? `${fmt(toGoal, 1)} lb to goal (${goal})` : `At or below goal (${goal})`;
  }
  return h('section', { class: 'card' },
    cardHead('Body weight', 'scale'),
    bigStat(current != null ? fmt(current, 1) : '–', current != null ? ' lb' : '', sub),
    miniStats([
      ['7-day avg', current != null ? `${fmt(current, 1)} lb` : '–'],
      ['Per week', rate != null ? `${rate > 0 ? '+' : ''}${fmt(rate, 2)} lb` : '–'],
      ['Weigh-ins', String(pts.length)],
    ]),
    lineChart({
      start, end, goal, fmt: (v) => fmt(v, 1),
      series: [
        { points: ma, color: 'var(--accent)', width: 2.5 },
        { points: pts, color: 'var(--text-3)', dots: true, width: 0 },
      ],
      emptyText: 'Log at least two weigh-ins to see a trend',
    }),
    legend([['var(--accent)', '7-day average'], ['var(--text-3)', 'Weigh-ins'], ['var(--good)', 'Goal', true]]));
}

// ---------- Sleep ----------

function sleepCard(start, end) {
  const pts = S.sleepPoints(start, end);
  const sum = S.sleepSummary();
  const rangeAvg = pts.length ? pts.reduce((s, p) => s + p.y, 0) / pts.length : null;
  const goal = state.settings.sleep.goal;
  const atGoal = pts.filter((p) => p.y >= (getDay(p.x).goals.sleep ?? goal)).length;
  return h('section', { class: 'card' },
    cardHead('Sleep score', 'moon'),
    bigStat(rangeAvg != null ? fmt(rangeAvg) : '–', '', rangeAvg != null ? `Average · goal met ${atGoal} of ${pts.length} nights` : 'Log your sleep score each morning'),
    miniStats([
      ['7-day avg', sum.avg7 != null ? fmt(sum.avg7) : '–'],
      ['30-day avg', sum.avg30 != null ? fmt(sum.avg30) : '–'],
      ['All-time', sum.avgAll != null ? fmt(sum.avgAll) : '–'],
    ]),
    lineChart({ start, end, goal, series: [{ points: pts, color: 'var(--accent)', dots: true }], emptyText: 'Log at least two nights to see a trend' }));
}

// ---------- Water ----------

function waterCard(start, end) {
  const rate = S.waterHitRate(start, end);
  const bars = S.waterBars(start, end);
  return h('section', { class: 'card' },
    cardHead('Water', 'drop'),
    bigStat(rate.pct != null ? `${rate.pct}` : '–', rate.pct != null ? '%' : '', rate.days ? `Goal hit ${rate.hits} of ${rate.days} days` : 'No full days logged yet'),
    barChart({
      bars: bars.map((b) => ({ label: shortDay(b.key), y: b.y / 1000, hit: b.hit })),
      goal: getDay(todayKey()).goals.waterMl / 1000,
      fmt: (v) => `${fmt(v, 1)} L`,
      axisFmt: (v) => `${fmt(v, 1)}L`,
    }));
}

// ---------- Nutrition ----------

function nutritionCard(start, end) {
  const n = S.nutrition(start, end);
  const bars = S.calorieBars(start, end);
  const t = getDay(todayKey()).goals;
  return h('section', { class: 'card' },
    cardHead('Food', 'food'),
    miniStats([
      ['Avg calories', n.avgCal != null ? fmt(n.avgCal) : '–'],
      ['Avg target', n.avgCalTarget != null ? fmt(n.avgCalTarget) : '–'],
      ['Avg protein', n.avgProtein != null ? `${fmt(n.avgProtein)} g` : '–'],
    ]),
    h('p', { class: 'small muted', style: { margin: '10px 2px 2px' } },
      n.days ? `Protein in range (${t.proteinMin}–${t.proteinMax} g) on ${n.proteinHitPct ?? '–'}% of completed days · averages use the ${n.days} day${n.days === 1 ? '' : 's'} with food logged.`
        : 'Log food to see averages.'),
    barChart({
      bars: bars.map((b) => ({ label: shortDay(b.key), y: b.y, hit: b.hit })),
      goal: t.calories,
      fmt: (v) => `${fmt(v)} kcal`,
      axisFmt: (v) => (v >= 1000 ? `${fmt(v / 1000, 1)}k` : fmt(v)),
      emptyText: 'No food logged in this range',
    }),
    legend([['var(--good)', 'Within 10% of target'], ['var(--accent)', 'Other days'], ['var(--good)', "Today's target", true]]));
}

// ---------- Strength ----------

function strengthCard(start, end) {
  const rows = S.strengthSummary(start, end);
  return h('section', { class: 'card' },
    cardHead('Strength', 'workouts', h('span', { class: 'faint small' }, 'est. 1RM')),
    rows.length
      ? h('div', null, rows.map((r) => h('button', { class: 'row strength-row', onClick: () => go('exercise', { id: r.ex.id, back: { to: 'progress' } }) },
          h('span', { class: 'grow' },
            h('div', { class: 'title' }, r.ex.name),
            h('div', { class: 'meta' }, r.pts.length > 1
              ? h('span', { style: { color: r.change >= 0 ? 'var(--good)' : 'var(--warn)' } }, `${r.change >= 0 ? '+' : ''}${fmt(r.change)} lb (${r.pct >= 0 ? '+' : ''}${fmt(r.pct, 1)}%)`)
              : `${r.pts.length} session`)),
          sparkline(r.pts.map((p) => p.e1rm)),
          h('span', { class: 'strength-val' }, fmt(r.current)))))
      : h('p', { class: 'small muted' }, 'Finish a workout to start tracking strength.'));
}

// ---------- Running ----------

function runningCard(start, end) {
  const runs = allRuns().filter((r) => r.date >= start && r.date <= end);
  const total = runs.reduce((s, r) => s + r.distanceKm, 0);
  const longest = runs.reduce((b, r) => (!b || r.distanceKm > b.distanceKm ? r : b), null);
  const perUnit = unit() === 'mi' ? KM_PER_MI : 1; // min/km → min/display unit
  const pace = S.pacePoints(start, end).map((p) => ({ x: p.x, y: p.y * perUnit }));
  const mmss = (v) => { const t = Math.round(v * 60); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  const avgPace = runs.length ? (runs.reduce((s, r) => s + r.durationMin, 0) / runs.reduce((s, r) => s + r.distanceKm, 0)) * perUnit : null;

  return h('section', { class: 'card' },
    cardHead('Running', 'run'),
    miniStats([
      ['Total', `${fmt(toDisplay(total), 1)} ${unit()}`],
      ['Longest', longest ? `${fmt(toDisplay(longest.distanceKm), 1)} ${unit()}` : '–'],
      ['Avg pace', avgPace ? `${mmss(avgPace)} /${unit()}` : '–'],
    ]),
    h('div', { class: 'chart-title' }, 'Weekly distance (8 weeks)'),
    barChart({
      bars: S.weeklyRunBars(8).map((b) => ({ label: `wk of ${shortDay(b.key)}`, y: toDisplay(b.y) })),
      fmt: (v) => `${fmt(v, 1)} ${unit()}`,
      axisFmt: (v) => fmt(v, 1),
      height: 130,
      emptyText: 'No runs in the last 8 weeks',
    }),
    h('div', { class: 'chart-title' }, `Pace (min/${unit()}, lower is faster)`),
    lineChart({ start, end, series: [{ points: pace, color: 'var(--good)', dots: true }], fmt: mmss, height: 130, emptyText: 'Log two runs to see your pace trend' }));
}
