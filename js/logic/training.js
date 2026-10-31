// Lifting sessions: starting a workout (targets come from the overload
// engine), editing it mid-workout, and rescheduling sessions between days.
import { state, saveSession, updateSettings } from '../store/state.js';
import { uid } from '../store/defaults.js';
import { todayKey, addDays } from '../dates.js';
import { dayPlan } from './schedule.js';
import { exerciseHistory, doneSets } from './history.js';
import { nextTarget } from './overload.js';

export const exerciseById = (id) => state.settings.exercises.find((e) => e.id === id);
export const planDayById = (id) => state.settings.plan.days.find((d) => d.id === id);

export const activeSession = () => [...state.sessions.values()].find((s) => s.status === 'active') || null;
export const sessionsOn = (key) => [...state.sessions.values()].filter((s) => s.date === key);
export const liftDoneOn = (key) => sessionsOn(key).some((s) => s.status === 'done');

// Build one exercise entry for a session, with its target from history.
export function makeEntry(item, sessionId = null) {
  const ex = exerciseById(item.exerciseId);
  const history = exerciseHistory(ex.id, sessionId);
  const target = nextTarget(ex, item, history, state.settings.overload);
  // First time: prefill with nothing, so you choose the weight.
  const weight = target.weight;
  return {
    id: uid(),
    exerciseId: ex.id,
    itemId: item.id || null,
    setsTarget: item.sets,
    repsMin: item.repsMin,
    repsMax: item.repsMax,
    target,
    sets: Array.from({ length: item.sets }, () => ({ weight, reps: target.reps, done: false })),
  };
}

export async function startWorkout(planDay, date = todayKey()) {
  const id = uid();
  const session = {
    id, date, planDayId: planDay.id, name: planDay.name,
    status: 'active', startedAt: Date.now(), finishedAt: null,
    entries: planDay.items.map((it) => makeEntry(it, id)),
  };
  // Doing a plan day on a day it isn't scheduled? Record it as moved from the
  // nearest unfinished scheduled date, so the workout streak stays fair.
  if (dayPlan(date, state.settings).lift?.id !== planDay.id) {
    const from = nearestScheduled(planDay.id, date);
    if (from) await moveSession('lift', from, date, planDay.id);
  }
  await saveSession(session);
  return session;
}

// Closest date within ±6 days where this plan day is scheduled and not yet done.
function nearestScheduled(planDayId, date) {
  for (let n = 1; n <= 6; n++) {
    for (const k of [addDays(date, -n), addDays(date, n)]) {
      if (dayPlan(k, state.settings).lift?.id === planDayId && !liftDoneOn(k)) return k;
    }
  }
  return null;
}

export async function finishWorkout(session) {
  session.status = 'done';
  session.finishedAt = Date.now();
  await saveSession(session);
  return session.entries.reduce((n, e) => n + doneSets(e).length, 0);
}

// Next plan day in rotation after the last finished workout.
export function suggestedPlanDay() {
  const days = state.settings.plan.days;
  if (!days.length) return null;
  const done = [...state.sessions.values()].filter((s) => s.status === 'done').sort((a, b) => b.startedAt - a.startedAt);
  const lastIdx = done.length ? days.findIndex((d) => d.id === done[0].planDayId) : -1;
  return days[(lastIdx + 1) % days.length];
}

// ---------- Rescheduling ----------

export function moveSession(type, from, to, planDayId = null) {
  return updateSettings((s) => {
    s.schedule.moves = s.schedule.moves.filter((m) => !(m.type === type && (m.from === from || m.to === to)));
    if (from !== to) s.schedule.moves.push({ type, planDayId, from, to });
    // Forget moves older than ~2 months
    const cutoff = addDays(todayKey(), -60);
    s.schedule.moves = s.schedule.moves.filter((m) => m.to >= cutoff || m.from >= cutoff);
  });
}

export function clearMove(type, key) {
  return updateSettings((s) => {
    s.schedule.moves = s.schedule.moves.filter((m) => !(m.type === type && (m.from === key || m.to === key)));
  });
}
