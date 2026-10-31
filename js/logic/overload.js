// Progressive overload engine. Uses ONLY your own logged history.
//
//   No history yet           → no target; you enter a comfortable weight.
//   Fixed reps (e.g. 4×5):
//     hit every rep          → + increment (default +5 upper / +10 lower)
//     missed reps            → repeat the same target
//   Rep range (e.g. 3×8–10):
//     all sets at top reps   → + increment, back to bottom of range
//     all sets in range      → same weight, aim for one more rep
//     a set below range      → miss: repeat the same target
//   Missed the same weight N sessions in a row (default 2) → deload ~10% and rebuild.
//   Weights round to plate increments (default 5 lb).
import { doneSets } from './history.js';

const roundTo = (w, step) => Math.round(w / step) * step;
const floorTo = (w, step) => Math.floor(w / step) * step;

export const incrementFor = (exercise, rules) =>
  exercise.increment ?? (exercise.region === 'lower' ? rules.lowerInc : rules.upperInc);

// How one past performance went, judged against the target set that day.
export function evaluate(entry) {
  const sets = doneSets(entry).slice(0, entry.setsTarget); // extra sets don't count
  if (!sets.length) return null;
  const weight = Math.min(...sets.map((s) => s.weight));   // weight held across all sets
  const minReps = Math.min(...sets.map((s) => s.reps));
  const targetW = entry.target?.weight ?? null;
  // A miss: fewer sets than planned, a set below the rep target (bottom of the
  // range), or a lighter weight than the target.
  const failed = sets.length < entry.setsTarget
    || minReps < entry.repsMin
    || (targetW != null && weight < targetW);
  return { weight, minReps, sets: sets.length, failed, targetW };
}

// history: [{ entry }] oldest first (see exerciseHistory). item: current plan item.
export function nextTarget(exercise, item, history, rules) {
  const fixed = item.repsMin === item.repsMax;
  const evals = history.map((h) => ({ entry: h.entry, r: evaluate(h.entry) })).filter((x) => x.r);

  if (!evals.length) {
    return { weight: null, reps: item.repsMin, first: true, reason: 'First time: enter a weight that feels comfortable.' };
  }

  const { entry: last, r } = evals[evals.length - 1];
  const inc = incrementFor(exercise, rules);
  const step = rules.roundTo || 5;

  if (r.failed) {
    const base = r.targetW ?? r.weight;
    // Count consecutive failed sessions at this same weight
    let misses = 0;
    for (let i = evals.length - 1; i >= 0; i--) {
      const x = evals[i];
      if (x.r.failed && (x.r.targetW ?? x.r.weight) === base) misses++;
      else break;
    }
    if (misses >= rules.missesBeforeDeload) {
      const w = Math.max(step, floorTo(base * (1 - rules.deloadPct / 100), step));
      return { weight: w, reps: item.repsMin, deload: true,
        reason: `Missed ${base} lb ${misses} sessions in a row → deload ${rules.deloadPct}% to ${w} lb and build back up.` };
    }
    const reps = Math.min(Math.max(last.target?.reps ?? item.repsMin, item.repsMin), item.repsMax);
    const why = r.sets < last.setsTarget ? `Did ${r.sets} of ${last.setsTarget} sets`
      : r.targetW != null && r.weight < r.targetW ? `Went lighter than ${base} lb`
      : `Missed some reps at ${base} lb`;
    return { weight: base, reps, reason: `${why} last time → same target again.` };
  }

  const w = r.weight;
  if (fixed) {
    const next = roundTo(w + inc, step);
    return { weight: next, reps: item.repsMin,
      reason: `Hit ${r.sets}×${r.minReps} @ ${w} lb last time → +${next - w} lb.` };
  }
  if (r.minReps >= item.repsMax) {
    const next = roundTo(w + inc, step);
    return { weight: next, reps: item.repsMin,
      reason: `Hit ${r.sets}×${item.repsMax} @ ${w} lb (top of range) → +${next - w} lb, back to ${item.repsMin} reps.` };
  }
  const reps = Math.min(Math.max(r.minReps + 1, item.repsMin), item.repsMax);
  return { weight: roundTo(w, step), reps,
    reason: `${r.sets}×${r.minReps} @ ${w} lb last time → same weight, aim for ${reps} reps.` };
}
