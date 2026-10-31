// Numbers behind the Progress tab. All judged against each day's own saved
// goals, so changing a goal never rewrites past results.
import { state, getDay } from '../store/state.js';
import { todayKey, addDays, daysBetween } from '../dates.js';
import { waterTotal } from './streaks.js';
import { foodTotals } from './food.js';
import { allRuns, weekStart } from './runs.js';
import { exerciseHistory, doneSets, e1rm } from './history.js';

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// Earliest date with any data.
export function firstDataKey() {
  const keys = [...state.days.keys(), ...[...state.sessions.values()].map((s) => s.date), ...[...state.runs.values()].map((r) => r.date)];
  return keys.length ? keys.reduce((a, b) => (a < b ? a : b)) : todayKey();
}

// range: '7' | '30' | 'all' → { start, end }
export function rangeBounds(range) {
  const end = todayKey();
  if (range === 'all') {
    const first = firstDataKey();
    return { start: daysBetween(first, end) < 6 ? addDays(end, -6) : first, end };
  }
  return { start: addDays(end, -(Number(range) - 1)), end };
}

export function daysIn(start, end) {
  const out = [];
  for (let k = start; k <= end; k = addDays(k, 1)) out.push(k);
  return out;
}

// Days that "count" for rates: logged days in range, and today only once its goal is met.
const countable = (start, end, hitToday) => daysIn(start, end).filter((k) =>
  state.days.has(k) && (k < todayKey() || hitToday(k)));

// ---------- Sleep ----------

export function sleepPoints(start, end) {
  return daysIn(start, end).filter((k) => state.days.get(k)?.sleep != null).map((k) => ({ x: k, y: state.days.get(k).sleep }));
}

export function sleepSummary() {
  const today = todayKey();
  const avgFor = (n) => avg(sleepPoints(addDays(today, -(n - 1)), today).map((p) => p.y));
  return { avg7: avgFor(7), avg30: avgFor(30), avgAll: avg(sleepPoints(firstDataKey(), today).map((p) => p.y)) };
}

// ---------- Body weight ----------

export function weightPoints(start, end) {
  return daysIn(start, end).filter((k) => state.days.get(k)?.weight != null).map((k) => ({ x: k, y: state.days.get(k).weight }));
}

// 7-day moving average at each weigh-in (uses weigh-ins from the 6 days before too).
export function movingAverage(start, end, window = 7) {
  const all = weightPoints(addDays(start, -(window - 1)), end);
  return all.filter((p) => p.x >= start).map((p) => {
    const from = addDays(p.x, -(window - 1));
    return { x: p.x, y: avg(all.filter((q) => q.x >= from && q.x <= p.x).map((q) => q.y)) };
  });
}

// Average weekly change: least-squares slope of weight vs. day, × 7.
export function weeklyRate(points) {
  if (points.length < 2 || daysBetween(points[0].x, points[points.length - 1].x) < 6) return null;
  const xs = points.map((p) => daysBetween(points[0].x, p.x)), ys = points.map((p) => p.y);
  const mx = avg(xs), my = avg(ys);
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return den ? (num / den) * 7 : null;
}

// ---------- Water ----------

export function waterBars(start, end) {
  return daysIn(start, end).map((k) => {
    const d = getDay(k);
    const total = state.days.has(k) ? waterTotal(d) : 0;
    return { key: k, y: total, hit: total >= d.goals.waterMl, goal: d.goals.waterMl };
  });
}

export function waterHitRate(start, end) {
  const days = countable(start, end, (k) => waterTotal(getDay(k)) >= getDay(k).goals.waterMl);
  const hits = days.filter((k) => waterTotal(getDay(k)) >= getDay(k).goals.waterMl).length;
  return { hits, days: days.length, pct: days.length ? Math.round((hits / days.length) * 100) : null };
}

// ---------- Food ----------
// Averages use only days with food logged (an unlogged day isn't a 0-calorie day).

export function nutrition(start, end) {
  const days = daysIn(start, end).filter((k) => state.days.get(k)?.food.length && k <= todayKey());
  const rows = days.map((k) => ({ key: k, ...foodTotals(getDay(k)), goals: getDay(k).goals }));
  const past = rows.filter((r) => r.key < todayKey());
  return {
    rows,
    days: rows.length,
    avgCal: avg(rows.map((r) => r.cal)),
    avgCalTarget: avg(rows.map((r) => r.goals.calories)),
    avgProtein: avg(rows.map((r) => r.protein)),
    proteinHitPct: past.length ? Math.round((past.filter((r) => r.protein >= r.goals.proteinMin && r.protein <= r.goals.proteinMax).length / past.length) * 100) : null,
  };
}

export function calorieBars(start, end) {
  return daysIn(start, end).map((k) => {
    const d = getDay(k);
    const t = state.days.has(k) ? foodTotals(d) : { cal: 0 };
    return { key: k, y: t.cal, hit: t.cal > 0 && Math.abs(t.cal - d.goals.calories) <= d.goals.calories * 0.1 };
  });
}

// ---------- Strength ----------

// Per session: top set weight and best e1RM.
export function strengthPoints(exerciseId, start = '0000-00-00', end = '9999-99-99') {
  return exerciseHistory(exerciseId).filter((x) => x.date >= start && x.date <= end).map(({ date, entry }) => {
    const sets = doneSets(entry);
    return { x: date, top: Math.max(...sets.map((s) => s.weight)), e1rm: Math.max(...sets.map((s) => e1rm(s.weight, s.reps))) };
  });
}

// Exercises in the plan (or with history), with e1RM change over the range.
export function strengthSummary(start, end) {
  const inPlan = state.settings.plan.days.flatMap((d) => d.items.map((it) => it.exerciseId));
  const ids = [...new Set([...inPlan, ...state.settings.exercises.map((e) => e.id)])];
  return ids.map((id) => {
    const ex = state.settings.exercises.find((e) => e.id === id);
    const pts = strengthPoints(id, start, end);
    if (!ex || !pts.length) return null;
    const first = pts[0].e1rm, last = pts[pts.length - 1].e1rm;
    return { ex, pts, current: last, change: last - first, pct: first ? ((last - first) / first) * 100 : 0 };
  }).filter(Boolean);
}

// ---------- Running ----------

export function weeklyRunBars(weeks = 8) {
  const thisWeek = weekStart(todayKey());
  const runs = allRuns();
  return Array.from({ length: weeks }, (_, i) => {
    const ws = addDays(thisWeek, -7 * (weeks - 1 - i));
    const we = addDays(ws, 6);
    const km = runs.filter((r) => r.date >= ws && r.date <= we).reduce((s, r) => s + r.distanceKm, 0);
    return { key: ws, y: km };
  });
}

export function pacePoints(start, end) {
  return allRuns().filter((r) => r.date >= start && r.date <= end && r.distanceKm > 0)
    .reverse().map((r) => ({ x: r.date, y: r.durationMin / r.distanceKm })); // min per km
}
