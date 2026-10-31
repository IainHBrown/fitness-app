// In-memory app state, backed by IndexedDB.
// All day records are loaded at startup (a few hundred small objects per year),
// so views can read synchronously. Writes update memory first (instant UI),
// then persist.
import { db } from '../db.js';
import { todayKey } from '../dates.js';
import { withDefaults } from './defaults.js';
import { isTrainingDay } from '../logic/schedule.js';

export const state = {
  settings: null,
  days: new Map(),     // 'YYYY-MM-DD' -> day record
  sessions: new Map(), // id -> lifting session
  runs: new Map(),     // id -> run
};

const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  listeners.forEach((fn) => fn());
}

export async function loadState() {
  const saved = await db.get('kv', 'settings');
  state.settings = withDefaults(saved);
  // Save right away so newly added defaults (and their ids) stay stable.
  await db.put('kv', state.settings, 'settings');
  const [days, sessions, runs] = await Promise.all([db.getAll('days'), db.getAll('sessions'), db.getAll('runs')]);
  state.days = new Map(days.map((d) => [d.date, d]));
  state.sessions = new Map(sessions.map((x) => [x.id, x]));
  state.runs = new Map(runs.map((x) => [x.id, x]));
}

// Replace everything (backup restore / erase). Pass null to reset to defaults.
export async function replaceAllData(data) {
  await db.replaceAll('days', data?.days || []);
  await db.replaceAll('sessions', data?.sessions || []);
  await db.replaceAll('runs', data?.runs || []);
  if (data?.settings) await db.put('kv', data.settings, 'settings');
  else await db.delete('kv', 'settings');
  await loadState(); // merges in defaults for anything missing
  emit();
}

// ---------- Settings ----------

export async function updateSettings(mutate) {
  mutate(state.settings);
  emit();
  await db.put('kv', state.settings, 'settings');
  // Settings apply from today onward: refresh today's saved snapshot only.
  const today = state.days.get(todayKey());
  if (today) {
    syncWithSettings(today);
    await db.put('days', today);
  }
}

// ---------- Days ----------

// Targets in force on a date. Saved into each day record so that changing a
// goal later never rewrites how past days are judged.
function currentGoals(key) {
  const s = state.settings;
  const training = isTrainingDay(key, s);
  return {
    waterMl: s.water.goalMl,
    sleep: s.sleep.goal,
    proteinMin: s.protein.min,
    proteinMax: s.protein.max,
    calories: training ? s.calories.training : s.calories.rest,
    training,
  };
}

function blankDay(key) {
  return {
    date: key,
    sleep: null,      // 0–100
    weight: null,     // lb
    water: [],        // [{ id, t, ml }]
    food: [],         // [{ id, t, name, cal, protein, foodId? }]
    supplements: {    // snapshot of the list that day + what was ticked
      list: state.settings.supplements.map(({ id, name }) => ({ id, name })),
      checked: [],
    },
    goals: currentGoals(key),
  };
}

// Today's record always follows the current settings (goals + supplement list).
function syncWithSettings(rec) {
  rec.goals = currentGoals(rec.date);
  const list = state.settings.supplements.map(({ id, name }) => ({ id, name }));
  const ids = new Set(list.map((x) => x.id));
  rec.supplements = { list, checked: rec.supplements.checked.filter((id) => ids.has(id)) };
}

// Read a day. Days with nothing logged return a blank (unsaved) record.
export function getDay(key) {
  const rec = state.days.get(key);
  if (!rec) return blankDay(key);
  if (key !== todayKey()) return rec;
  const copy = structuredClone(rec);
  syncWithSettings(copy);
  return copy;
}

export const hasDay = (key) => state.days.has(key);

export async function updateDay(key, mutate) {
  const rec = structuredClone(state.days.get(key) || blankDay(key));
  if (key === todayKey()) syncWithSettings(rec);
  mutate(rec);
  state.days.set(key, rec);
  emit();
  await db.put('days', rec);
}

// Earliest date with anything logged (streaks start counting from here).
export function firstDayKey() {
  let min = null;
  for (const k of state.days.keys()) if (!min || k < min) min = k;
  return min;
}

// ---------- Lifting sessions & runs ----------
// Sessions: { id, date, planDayId, name, status: 'active'|'done', startedAt, finishedAt, entries: [...] }
// Runs:     { id, date, t, durationMin, distanceKm, effort }

export async function saveSession(session) {
  state.sessions.set(session.id, session);
  emit();
  await db.put('sessions', session);
}

export async function deleteSession(id) {
  state.sessions.delete(id);
  emit();
  await db.delete('sessions', id);
}

export async function saveRun(run) {
  state.runs.set(run.id, run);
  emit();
  await db.put('runs', run);
}

export async function deleteRun(id) {
  state.runs.delete(id);
  emit();
  await db.delete('runs', id);
}
