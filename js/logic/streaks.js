// Streak rules (same for every streak type):
//   hit the goal on a day       → streak +1
//   miss one day                → streak kept, shown as "at risk"
//   hit the next day            → streak saved, continues
//   miss two days in a row      → streak resets to 0
// Only "eligible" days count (e.g. workout streak skips rest days).
// Streaks are recomputed from history every time, never stored, so editing
// a past day can't leave them out of sync. Today only counts once it is hit;
// an unfinished today is never a miss.
import { addDays, todayKey } from '../dates.js';
import { state, getDay, firstDayKey } from '../store/state.js';
import { dayPlan } from './schedule.js';
import { liftDoneOn } from './training.js';
import { runsOn } from './runs.js';

export function computeStreak({ start, today, isEligible = () => true, isHit }) {
  let count = 0, best = 0, misses = 0;
  if (start) {
    for (let k = start; k < today; k = addDays(k, 1)) {
      if (!isEligible(k)) continue;
      if (isHit(k)) {
        count++;
        misses = 0;
        best = Math.max(best, count);
      } else if (++misses >= 2) {
        count = 0;
      }
    }
  }
  const todayEligible = isEligible(today);
  const todayDone = todayEligible && isHit(today);
  if (todayDone) {
    count++;
    misses = 0;
    best = Math.max(best, count);
  }
  return { count, best, todayDone, todayEligible, atRisk: !todayDone && misses === 1 && count > 0 };
}

// ---------- Streak types ----------

const waterTotal = (day) => day.water.reduce((sum, w) => sum + w.ml, 0);

export function waterStreak() {
  return computeStreak({
    start: firstDayKey(),
    today: todayKey(),
    isHit: (k) => state.days.has(k) && waterTotal(getDay(k)) >= getDay(k).goals.waterMl,
  });
}

export function supplementStreak() {
  return computeStreak({
    start: firstDayKey(),
    today: todayKey(),
    // A day with no supplements configured can't be missed
    isEligible: (k) => getDay(k).supplements.list.length > 0,
    isHit: (k) => {
      const { list, checked } = getDay(k).supplements;
      return list.every((s) => checked.includes(s.id));
    },
  });
}

// Only scheduled lifting/running days count; rest days never break it.
// A day is hit when everything scheduled that day (lift and/or run) is done.
export function workoutStreak() {
  const firsts = [firstDayKey(), ...[...state.sessions.values(), ...state.runs.values()].map((x) => x.date)].filter(Boolean);
  return computeStreak({
    start: firsts.length ? firsts.reduce((a, b) => (a < b ? a : b)) : null,
    today: todayKey(),
    isEligible: (k) => { const p = dayPlan(k, state.settings); return !!p.lift || p.run; },
    isHit: (k) => {
      const p = dayPlan(k, state.settings);
      return (!p.lift || liftDoneOn(k)) && (!p.run || runsOn(k).length > 0);
    },
  });
}

export { waterTotal };
