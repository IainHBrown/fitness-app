// Default settings. These are only starting values: every number here
// is editable in Settings, and saved settings always win over defaults.

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

export function defaultSettings() {
  return {
    schemaVersion: 1,

    protein: { min: 100, max: 150 },                        // g/day, "goal hit" inside the range
    calories: { training: 2700, rest: 2400, runDaysCount: true },

    water: {
      goalMl: 2000,
      quickAdd: [
        { id: uid(), name: '', ml: 250 },
        { id: uid(), name: '', ml: 500 },
        { id: uid(), name: 'bottle', ml: 750 },
      ],
    },

    sleep: { goal: 80 },
    weight: { goal: 195 },                                   // lb

    supplements: [
      { id: uid(), name: 'Creatine 5g' },
      { id: uid(), name: 'Omega-3' },
      { id: uid(), name: 'Vitamin D3' },
      { id: uid(), name: 'Vitamin B12' },
    ],

    // Weekday numbers: 0 = Sun … 6 = Sat. Lifting days come from plan.days[].weekday.
    // moves: one-off reschedules, e.g. { type: 'lift', planDayId, from: '2026-11-07', to: '2026-11-08' }
    schedule: { runDays: [1, 3], moves: [] },

    // Progressive overload rules
    overload: { upperInc: 5, lowerInc: 10, missesBeforeDeload: 2, deloadPct: 10, roundTo: 5 },

    ...defaultTraining(),

    units: { distance: 'km' },

    lastBackupAt: null, // set when a backup is exported

    // Rough campus food values (calories, protein g) — fully editable
    foods: [
      { id: uid(), name: '6" Subway sub', cal: 420, protein: 25 },
      { id: uid(), name: 'Footlong Subway sub', cal: 840, protein: 50 },
      { id: uid(), name: 'Burger', cal: 600, protein: 30 },
      { id: uid(), name: 'Pizza slice', cal: 300, protein: 12 },
      { id: uid(), name: 'Fries', cal: 380, protein: 4 },
      { id: uid(), name: 'Chicken wrap', cal: 550, protein: 35 },
      { id: uid(), name: 'Salad', cal: 350, protein: 20 },
      { id: uid(), name: 'Protein shake', cal: 160, protein: 25 },
    ],
  };
}

// Exercise library + 3-day push/pull/legs plan.
// Exercises are never deleted, only taken out of the plan, so history is kept.
// Reps: repsMin === repsMax → fixed reps (add weight when every rep is hit);
//       repsMin < repsMax   → rep range (add reps until the top, then add weight).
// increment: per-exercise override of the upper/lower default (null = default).
// Dumbbell weights are per dumbbell.
function defaultTraining() {
  const ex = (name, region, increment = null) => ({ id: uid(), name, region, increment });
  const E = {
    bench: ex('Bench press', 'upper'),
    dbShoulder: ex('Seated DB shoulder press', 'upper'),
    inclineDb: ex('Incline DB press', 'upper'),
    lateral: ex('Cable lateral raise', 'upper'),
    pushdown: ex('Rope triceps pushdown', 'upper'),
    trapBar: ex('Trap bar deadlift', 'lower'),
    csRow: ex('Chest-supported DB row', 'upper'),
    pulldown: ex('Lat pulldown', 'upper'),
    facePull: ex('Face pull', 'upper'),
    curl: ex('Incline DB curl', 'upper'),
    squat: ex('Back squat', 'lower'),
    dbRdl: ex('DB Romanian deadlift', 'lower', 5),
    bulgarian: ex('Bulgarian split squat', 'lower', 5),
    legCurl: ex('Leg curl', 'lower', 5),
    calf: ex('Standing calf raise', 'lower'),
    // Alternatives for quick swaps
    dbBench: ex('DB bench press', 'upper'),
    chestPress: ex('Machine chest press', 'upper'),
    ohp: ex('Overhead press', 'upper'),
    cableRow: ex('Seated cable row', 'upper'),
    pullup: ex('Pull-up (added weight)', 'upper'),
    hammer: ex('Hammer curl', 'upper'),
    ohTriceps: ex('Overhead triceps extension', 'upper'),
    frontSquat: ex('Front squat', 'lower'),
    legPress: ex('Leg press', 'lower'),
    hackSquat: ex('Hack squat', 'lower'),
    rdl: ex('Romanian deadlift', 'lower'),
    legExt: ex('Leg extension', 'lower', 5),
    hipThrust: ex('Hip thrust', 'lower'),
  };
  const item = (e, sets, repsMin, repsMax = repsMin) => ({ id: uid(), exerciseId: e.id, sets, repsMin, repsMax });
  return {
    exercises: Object.values(E),
    plan: {
      days: [
        { id: uid(), name: 'Push', weekday: 2, items: [
          item(E.bench, 4, 5), item(E.dbShoulder, 3, 8), item(E.inclineDb, 3, 8, 10),
          item(E.lateral, 3, 12, 15), item(E.pushdown, 3, 10, 12)] },
        { id: uid(), name: 'Pull', weekday: 4, items: [
          item(E.trapBar, 3, 5), item(E.csRow, 3, 8), item(E.pulldown, 3, 8, 10),
          item(E.facePull, 3, 12, 15), item(E.curl, 3, 10, 12)] },
        { id: uid(), name: 'Legs', weekday: 6, items: [
          item(E.squat, 4, 5), item(E.dbRdl, 3, 8), item(E.bulgarian, 3, 8),
          item(E.legCurl, 3, 10, 12), item(E.calf, 3, 12, 15)] },
      ],
    },
  };
}

// Fill in any keys missing from saved settings (e.g. after an app update
// adds a new setting) without touching values already saved.
export function withDefaults(saved) {
  const base = defaultSettings();
  if (!saved) return base;
  const merge = (def, val) => {
    if (val === undefined) return def;
    if (Array.isArray(def) || def === null || typeof def !== 'object') return val;
    const out = { ...def };
    for (const k of Object.keys(val)) out[k] = merge(def[k], val[k]);
    return out;
  };
  return merge(base, saved);
}
