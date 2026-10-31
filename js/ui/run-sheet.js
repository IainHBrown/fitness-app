// Log or edit a run: duration, distance, effort. Pace is calculated.
import { openKeypad, toast } from './sheet.js';
import { state, saveRun, deleteRun } from '../store/state.js';
import { uid } from '../store/defaults.js';
import { todayKey } from '../dates.js';
import { unit, toDisplay, fromDisplay, paceLabel } from '../logic/runs.js';
import { legDayTomorrow } from '../logic/schedule.js';

export function openRunSheet({ date = todayKey(), run = null } = {}) {
  const mins = run ? Math.floor(run.durationMin) : null;
  const secs = run ? Math.round((run.durationMin - mins) * 60) : null;
  const hint = legDayTomorrow(date, state.settings) ? 'Leg day tomorrow: keep this one easy.' : 'Pace is worked out for you.';

  openKeypad({
    title: run ? 'Edit run' : 'Log run',
    hint,
    fields: [
      { key: 'min', label: 'Minutes', value: mins, max: 600 },
      { key: 'sec', label: 'Seconds', value: secs || null, max: 59, optional: true },
      { key: 'dist', label: 'Distance', value: run ? +toDisplay(run.distanceKm).toFixed(2) : null, unit: unit(), decimals: 2, max: 200 },
      { key: 'effort', label: 'Effort (1–10)', value: run?.effort ?? null, max: 10 },
    ],
    onSave: ({ min, sec, dist, effort }) => {
      if (!dist || (!min && !sec)) return toast('Enter time and distance');
      const saved = {
        id: run?.id || uid(),
        date: run?.date || date,
        t: run?.t || Date.now(),
        durationMin: min + (sec || 0) / 60,
        distanceKm: fromDisplay(dist),
        effort: Math.max(1, Math.min(10, effort || 1)),
      };
      saveRun(saved);
      toast(`Run saved · ${paceLabel(saved)}`);
    },
    onClear: run ? () => { deleteRun(run.id); toast('Run deleted'); } : null,
  });
}
