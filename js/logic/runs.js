// Running helpers. Distance is always stored in km and converted for display.
import { state } from '../store/state.js';
import { addDays, weekday, todayKey } from '../dates.js';

export const KM_PER_MI = 1.609344;

export const unit = () => state.settings.units.distance; // 'km' | 'mi'
export const toDisplay = (km) => (unit() === 'mi' ? km / KM_PER_MI : km);
export const fromDisplay = (d) => (unit() === 'mi' ? d * KM_PER_MI : d);

// Pace as "m:ss" per display unit.
export function pace(run) {
  const dist = toDisplay(run.distanceKm);
  if (!dist || !run.durationMin) return '–';
  const secs = Math.round((run.durationMin * 60) / dist);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

export const paceLabel = (run) => `${pace(run)} /${unit()}`;
export const distLabel = (km) => `${toDisplay(km).toFixed(2).replace(/\.?0+$/, '')} ${unit()}`;

export const allRuns = () => [...state.runs.values()].sort((a, b) => (a.date === b.date ? b.t - a.t : a.date < b.date ? 1 : -1));
export const runsOn = (key) => allRuns().filter((r) => r.date === key);

// Monday of the week containing `key`.
export const weekStart = (key) => addDays(key, -((weekday(key) + 6) % 7));

export function runStats() {
  const runs = allRuns();
  const ws = weekStart(todayKey());
  const thisWeek = runs.filter((r) => r.date >= ws).reduce((s, r) => s + r.distanceKm, 0);
  const longest = runs.reduce((best, r) => (!best || r.distanceKm > best.distanceKm ? r : best), null);
  const recent = runs.slice(0, 4);
  const recentKm = recent.reduce((s, r) => s + r.distanceKm, 0);
  const recentMin = recent.reduce((s, r) => s + r.durationMin, 0);
  return { thisWeek, longest, avgPace: recent.length ? pace({ distanceKm: recentKm, durationMin: recentMin }) : '–', count: runs.length };
}
