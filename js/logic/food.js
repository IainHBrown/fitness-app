// Food helpers: daily totals and "eat again" suggestions.
import { state } from '../store/state.js';

export function foodTotals(day) {
  return day.food.reduce(
    (t, f) => ({ cal: t.cal + (f.cal || 0), protein: t.protein + (f.protein || 0) }),
    { cal: 0, protein: 0 }
  );
}

// Meals eaten before that aren't on the quick-add list, most recent first.
export function recentMeals(limit = 8) {
  const quick = new Set(state.settings.foods.map((f) => f.id));
  const seen = new Map();
  for (const day of state.days.values()) {
    for (const f of day.food) {
      if (f.foodId && quick.has(f.foodId)) continue;
      const key = `${f.name}|${f.cal}|${f.protein}`;
      const prev = seen.get(key);
      if (!prev || prev.t < f.t) seen.set(key, f);
    }
  }
  return [...seen.values()].sort((a, b) => b.t - a.t).slice(0, limit);
}
