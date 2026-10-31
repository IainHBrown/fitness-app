// Backup: export all data as one JSON file, and restore from one.
// On iPhone the export opens the share sheet → "Save to Files".
import { state, replaceAllData, updateSettings } from './state.js';
import { todayKey } from '../dates.js';

const FORMAT = 1;

export function buildBackup() {
  return {
    app: 'fitness',
    format: FORMAT,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    days: [...state.days.values()],
    sessions: [...state.sessions.values()],
    runs: [...state.runs.values()],
  };
}

// Returns true if the file was handed off (shared or downloaded).
export async function exportBackup() {
  const json = JSON.stringify(buildBackup());
  const name = `fitness-backup-${todayKey()}.json`;
  const file = new File([json], name, { type: 'application/json' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Fitness backup' });
    } catch (e) {
      if (e.name === 'AbortError') return false; // share sheet dismissed
      throw e;
    }
  } else {
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  await updateSettings((s) => { s.lastBackupAt = Date.now(); });
  return true;
}

// Parse and sanity-check a backup file. Throws with a readable message.
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('That file isn’t valid JSON.'); }
  if (!data || data.app !== 'fitness' || typeof data.settings !== 'object') throw new Error('That file isn’t a Fitness backup.');
  if (data.format > FORMAT) throw new Error('This backup is from a newer version of the app.');
  for (const k of ['days', 'sessions', 'runs']) {
    if (!Array.isArray(data[k])) throw new Error(`Backup is missing its ${k}.`);
  }
  if (data.days.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d?.date))) throw new Error('Backup has a day with a bad date.');
  if ([...data.sessions, ...data.runs].some((x) => !x?.id || !x?.date)) throw new Error('Backup has a workout or run without an id or date.');
  return data;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const summarize = (data) =>
  `${plural(data.days.length, 'day')}, ${plural(data.sessions.length, 'workout')} and ${plural(data.runs.length, 'run')}, exported ${new Date(data.exportedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

export const restoreBackup = (data) => replaceAllData(data);
export const eraseAll = () => replaceAllData(null);
