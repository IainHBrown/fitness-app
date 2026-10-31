// Settings tab. Every target is editable; changes save instantly and apply
// from today onward (past days keep the targets they were logged with).
import { h, mount, fmt } from './dom.js';
import { icon } from './icons.js';
import { valueRow } from './components.js';
import { openKeypad, openForm, openConfirm, toast } from './sheet.js';
import { go } from './router.js';
import { state, updateSettings } from '../store/state.js';
import { WEEKDAYS_LETTER, WEEKDAYS_SHORT } from '../dates.js';
import { runDaysBeforeLegDay } from '../logic/schedule.js';
import { uid } from '../store/defaults.js';
import { waterLabel } from './today.js';
import { editFood } from './food.js';
import { exportBackup, parseBackup, summarize, restoreBackup, eraseAll } from '../store/backup.js';
import { relativeDay, dateKey } from '../dates.js';

export function renderSettings(root) {
  const s = state.settings;

  // Opens the keypad for one numeric setting at path, e.g. ['protein', 'min']
  const numberRow = (label, path, unit, opts = {}) => {
    const value = path.reduce((o, k) => o[k], s);
    return valueRow(label, `${fmt(value, 1)} ${unit}`, () => openKeypad({
      title: label,
      fields: [{ key: 'v', label, value, unit, decimals: opts.decimals || 0, max: opts.max }],
      hint: opts.hint,
      onSave: ({ v }) => {
        if (opts.validate) { const err = opts.validate(v); if (err) return toast(err); }
        updateSettings((st) => { path.slice(0, -1).reduce((o, k) => o[k], st)[path[path.length - 1]] = v; });
      },
    }));
  };

  mount(root, [
    h('header', { class: 'page-head' }, h('div', null, h('div', { class: 'eyebrow' }, 'Saved automatically'), h('h1', null, 'Settings'))),

    section('Nutrition',
      numberRow('Protein minimum', ['protein', 'min'], 'g', { max: 500, validate: (v) => v > s.protein.max && 'Minimum can’t be above maximum' }),
      numberRow('Protein maximum', ['protein', 'max'], 'g', { max: 500, validate: (v) => v < s.protein.min && 'Maximum can’t be below minimum' }),
      numberRow('Calories, training day', ['calories', 'training'], 'kcal', { max: 9999 }),
      numberRow('Calories, rest day', ['calories', 'rest'], 'kcal', { max: 9999 }),
      toggleRow('Run days count as training days', s.calories.runDaysCount, (on) => updateSettings((st) => { st.calories.runDaysCount = on; }))),

    section('Quick-add foods',
      s.foods.map((f) => valueRow(f.name, `${fmt(f.cal)} kcal · ${fmt(f.protein)} g`, () => editFood(f))),
      h('button', { class: 'row', style: { color: 'var(--accent)' }, onClick: () => editFood(null) }, icon('plus'), 'Add food')),
    note('Rough values are fine. Editing a food doesn’t change meals you already logged.'),

    section('Water',
      numberRow('Daily goal', ['water', 'goalMl'], 'ml', { max: 10000 }),
      s.water.quickAdd.map((q, i) => valueRow(`Button ${i + 1}`, waterLabel(q), () => editWaterButton(q)))),
    note('Give a button a name (e.g. “bottle”) to show “+1 bottle” instead of the amount.'),

    section('Goals',
      numberRow('Sleep score goal', ['sleep', 'goal'], '', { max: 100 }),
      numberRow('Goal body weight', ['weight', 'goal'], 'lb', { decimals: 1, max: 999 })),

    section('Supplements',
      s.supplements.map((sup, i) => h('div', { class: 'row' },
        h('button', { class: 'grow title', style: { textAlign: 'left', minHeight: '30px' }, onClick: () => editSupplement(sup) }, sup.name),
        i > 0 ? h('button', { class: 'icon-btn', 'aria-label': 'Move up', onClick: () => moveSupplement(i, -1) }, icon('up')) : null,
        h('button', { class: 'icon-btn', 'aria-label': `Edit ${sup.name}`, onClick: () => editSupplement(sup) }, icon('edit')))),
      h('button', { class: 'row', style: { color: 'var(--accent)' }, onClick: () => editSupplement(null) }, icon('plus'), 'Add supplement')),
    note('Changes apply from today. Past days keep the list they had, so streaks aren’t affected.'),

    section('Training',
      valueRow('Lifting plan', s.plan.days.map((d) => d.name).join(' · '), () => go('workouts')),
      h('div', { class: 'row', style: { paddingBottom: 0 } }, h('span', { class: 'grow' }, 'Running days')),
      weekdayPicker(s.schedule.runDays, 'on-alt', (days) => updateSettings((st) => { st.schedule.runDays = days; }))),
    runDaysBeforeLegDay(s).length
      ? h('p', { class: 'list-note', style: { color: 'var(--warn)' } }, `⚠ A run on ${runDaysBeforeLegDay(s).map((d) => WEEKDAYS_SHORT[d]).join(' and ')} lands the day before leg day. Consider another day, or keep it easy.`)
      : note('Lifting days are set per plan day (tap Lifting plan).'),

    section('Progressive overload',
      numberRow('Upper body increase', ['overload', 'upperInc'], 'lb', { decimals: 1, max: 100 }),
      numberRow('Lower body increase', ['overload', 'lowerInc'], 'lb', { decimals: 1, max: 100 }),
      numberRow('Misses before deload', ['overload', 'missesBeforeDeload'], 'sessions', { max: 10, validate: (v) => v < 1 && 'Must be at least 1' }),
      numberRow('Deload amount', ['overload', 'deloadPct'], '%', { max: 50 }),
      numberRow('Round weights to', ['overload', 'roundTo'], 'lb', { decimals: 1, max: 50, validate: (v) => v <= 0 && 'Must be above 0' })),
    note('Hit every rep → weight goes up. Miss → same target. Miss the same weight too many times in a row → deload and build back up. Individual exercises can override the increase (Workouts → exercise → Edit).'),

    section('Units',
      h('button', { class: 'row', onClick: () => updateSettings((st) => { st.units.distance = st.units.distance === 'km' ? 'mi' : 'km'; }) },
        h('span', { class: 'grow' }, 'Run distance'),
        h('span', { class: 'val' }, s.units.distance === 'km' ? 'Kilometres' : 'Miles'))),
    note('Weights are always in lb.'),

    dataSection(s),
    h('p', { class: 'list-note', style: { textAlign: 'center', marginTop: '24px' } }, 'All data is stored only on this iPhone.'),
  ]);
}

// ---------- Building blocks ----------

const section = (title, ...rows) => [h('div', { class: 'section-label' }, title), h('div', { class: 'list' }, rows)];
const note = (text) => h('p', { class: 'list-note' }, text);

function toggleRow(label, on, onChange) {
  return h('button', { class: 'row', role: 'switch', 'aria-checked': String(on), onClick: () => onChange(!on) },
    h('span', { class: 'grow' }, label),
    h('span', { class: 'switch' + (on ? ' on' : '') }));
}

function weekdayPicker(selected, onClass, onChange) {
  return h('div', { class: 'days' }, WEEKDAYS_LETTER.map((letter, wd) => {
    const on = selected.includes(wd);
    return h('button', {
      class: 'day-btn' + (on ? ' ' + onClass : ''),
      'aria-pressed': String(on),
      onClick: () => onChange(on ? selected.filter((d) => d !== wd) : [...selected, wd].sort()),
    }, letter);
  }));
}

// ---------- Editors ----------

function editWaterButton(q) {
  openForm({
    title: 'Water button',
    fields: [
      { key: 'ml', label: 'Amount (ml)', type: 'number', value: q.ml },
      { key: 'name', label: 'Name (optional)', type: 'text', value: q.name, placeholder: 'e.g. bottle', optional: true },
    ],
    onSave: ({ ml, name }) => updateSettings((st) => {
      Object.assign(st.water.quickAdd.find((x) => x.id === q.id), { ml: Math.round(ml), name: name || '' });
    }),
  });
}

function editSupplement(sup) {
  openForm({
    title: sup ? 'Edit supplement' : 'Add supplement',
    fields: [{ key: 'name', label: 'Name', type: 'text', value: sup?.name, placeholder: 'e.g. Magnesium 200mg' }],
    onSave: ({ name }) => updateSettings((st) => {
      if (sup) st.supplements.find((x) => x.id === sup.id).name = name;
      else st.supplements.push({ id: uid(), name });
    }),
    onDelete: sup ? () => updateSettings((st) => { st.supplements = st.supplements.filter((x) => x.id !== sup.id); }) : null,
  });
}

function moveSupplement(i, dir) {
  updateSettings((st) => {
    const list = st.supplements;
    [list[i], list[i + dir]] = [list[i + dir], list[i]];
  });
}

// ---------- Backup & data ----------

function dataSection(s) {
  const last = s.lastBackupAt;
  const hasData = state.days.size + state.sessions.size + state.runs.size > 0;
  const stale = hasData && (!last || Date.now() - last > 14 * 86400000);
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' }, onChange: (e) => importFile(e.target) });

  return [
    section('Backup',
      h('button', { class: 'row', onClick: async () => {
        try { if (await exportBackup()) toast('Backup exported'); }
        catch (e) { toast('Export failed: ' + e.message); }
      } },
        icon('export'),
        h('span', { class: 'grow' }, h('div', null, 'Export backup'),
          h('div', { class: 'meta' }, last ? `Last backup ${relativeDay(dateKey(new Date(last)))}` : 'Never backed up')),
        icon('chev')),
      h('button', { class: 'row', onClick: () => fileInput.click() },
        icon('import'),
        h('span', { class: 'grow' }, h('div', null, 'Import backup'), h('div', { class: 'meta' }, 'Replaces everything on this phone')),
        icon('chev')),
      fileInput),
    stale
      ? h('p', { class: 'list-note', style: { color: 'var(--warn)' } }, '⚠ Back up every couple of weeks. Your data lives only on this phone, and removing the app from your home screen deletes it.')
      : note('Export saves one .json file. On iPhone choose “Save to Files” in the share sheet.'),

    section('Danger zone',
      h('button', { class: 'row danger-row', onClick: () => openConfirm({
        title: 'Delete all data?',
        message: 'Every day, workout, run and setting on this phone will be erased and the app reset to defaults. Export a backup first if you might want it back.',
        confirmLabel: 'Delete everything', danger: true,
        onConfirm: async () => { await eraseAll(); toast('All data deleted'); go('today'); },
      }) }, icon('trash'), h('span', { class: 'grow' }, 'Delete all data'))),
  ];
}

async function importFile(input) {
  const file = input.files?.[0];
  input.value = ''; // allow picking the same file again
  if (!file) return;
  let data;
  try { data = parseBackup(await file.text()); }
  catch (e) { return toast(e.message, { duration: 5000 }); }
  openConfirm({
    title: 'Restore this backup?',
    message: `${summarize(data)}. This replaces everything currently on this phone.`,
    confirmLabel: 'Restore',
    onConfirm: async () => { await restoreBackup(data); toast('Backup restored'); go('today'); },
  });
}
