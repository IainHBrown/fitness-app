// The small daily summary sent to the notification Worker. It holds only
// what the reminders need: progress today, the next few days' plan,
// streaks and notification preferences. No food, weight or sleep data.
import { state, getDay } from '../store/state.js';
import { todayKey, addDays } from '../dates.js';
import { dayPlan } from '../logic/schedule.js';
import { waterTotal, waterStreak, supplementStreak, workoutStreak } from '../logic/streaks.js';
import { liftDoneOn } from '../logic/training.js';
import { runsOn } from '../logic/runs.js';

export function buildSummary() {
  const s = state.settings;
  const today = todayKey();
  const day = getDay(today);
  const { list, checked } = day.supplements;
  const streak = (x) => ({ count: x.count, atRisk: x.atRisk });

  return {
    date: today,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    water: { total: waterTotal(day), goal: day.goals.waterMl },
    supplements: {
      missing: list.filter((x) => !checked.includes(x.id)).map((x) => x.name),
      all: s.supplements.map((x) => x.name), // for a day the app hasn't been opened yet
    },
    today: { liftDone: liftDoneOn(today), runDone: runsOn(today).length > 0 },
    // Today plus the next two days, in case the app isn't opened for a while
    days: [0, 1, 2].map((n) => {
      const k = addDays(today, n);
      const p = dayPlan(k, s);
      return { date: k, lift: p.lift?.name || null, run: p.run, waterGoal: s.water.goalMl };
    }),
    streaks: { water: streak(waterStreak()), supplements: streak(supplementStreak()), workout: streak(workoutStreak()) },
    prefs: { enabled: s.notifications.enabled, times: s.notifications.times, types: s.notifications.types },
  };
}
