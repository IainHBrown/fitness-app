// Lifting history lookups: past performances per exercise, e1RM and PRs.
import { state } from '../store/state.js';

// Estimated 1-rep max (Epley).
export const e1rm = (weight, reps) => (reps <= 0 ? 0 : reps === 1 ? weight : weight * (1 + reps / 30));

export const doneSets = (entry) => entry.sets.filter((s) => s.done && s.reps > 0 && s.weight != null);

// Completed performances of one exercise, oldest first:
// [{ date, session, entry }]. Only finished sessions count, and any session
// passed as `exclude` (the one in progress) is skipped.
export function exerciseHistory(exerciseId, exclude = null) {
  const out = [];
  for (const session of state.sessions.values()) {
    if (session.status !== 'done' || session.id === exclude) continue;
    for (const entry of session.entries) {
      if (entry.exerciseId === exerciseId && doneSets(entry).length) out.push({ date: session.date, session, entry });
    }
  }
  return out.sort((a, b) => (a.date === b.date ? a.session.startedAt - b.session.startedAt : a.date < b.date ? -1 : 1));
}

export const formatSets = (entry) => {
  const sets = doneSets(entry);
  const sameWeight = sets.every((s) => s.weight === sets[0].weight);
  return sameWeight
    ? `${sets[0].weight} × ${sets.map((s) => s.reps).join(', ')}`
    : sets.map((s) => `${s.weight}×${s.reps}`).join(', ');
};

// Personal records for an exercise.
export function personalRecords(exerciseId) {
  let heaviest = null, bestE1rm = null, mostVolume = null;
  for (const { date, entry } of exerciseHistory(exerciseId)) {
    let volume = 0;
    for (const s of doneSets(entry)) {
      volume += s.weight * s.reps;
      if (!heaviest || s.weight > heaviest.weight || (s.weight === heaviest.weight && s.reps > heaviest.reps)) heaviest = { ...s, date };
      const est = e1rm(s.weight, s.reps);
      if (!bestE1rm || est > bestE1rm.value) bestE1rm = { value: est, weight: s.weight, reps: s.reps, date };
    }
    if (!mostVolume || volume > mostVolume.value) mostVolume = { value: volume, date };
  }
  return { heaviest, bestE1rm, mostVolume };
}
