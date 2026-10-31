// What is planned for a given date: the weekly pattern (plan day weekdays +
// run days) adjusted by one-off moves (e.g. Saturday's lift done on Sunday).
import { weekday, addDays } from '../dates.js';

export function dayPlan(key, settings) {
  const wd = weekday(key);
  let lift = settings.plan.days.find((d) => d.weekday === wd) || null;
  let run = settings.schedule.runDays.includes(wd);
  let movedIn = false;

  for (const m of settings.schedule.moves) {
    if (m.from === key) {
      if (m.type === 'lift') lift = null;
      else run = false;
    }
    if (m.to === key) {
      movedIn = true;
      if (m.type === 'lift') lift = settings.plan.days.find((d) => d.id === m.planDayId) || lift;
      else run = true;
    }
  }
  return { lift, run, movedIn };
}

// Training days get the higher calorie target.
export function isTrainingDay(key, settings) {
  const p = dayPlan(key, settings);
  return !!p.lift || (p.run && settings.calories.runDaysCount);
}

// A plan day is "leg day" when most of its exercises are lower body.
export function isLegDay(planDay, settings) {
  if (!planDay || !planDay.items.length) return false;
  const lower = planDay.items.filter((it) => settings.exercises.find((e) => e.id === it.exerciseId)?.region === 'lower').length;
  return lower > planDay.items.length / 2;
}

// Hard runs right before leg day are best avoided.
export const legDayTomorrow = (key, settings) => isLegDay(dayPlan(addDays(key, 1), settings).lift, settings);

// Weekdays (0–6) whose run would land the day before a leg day in the weekly pattern.
export function runDaysBeforeLegDay(settings) {
  return settings.schedule.runDays.filter((wd) =>
    settings.plan.days.some((d) => d.weekday === (wd + 1) % 7 && isLegDay(d, settings)));
}
