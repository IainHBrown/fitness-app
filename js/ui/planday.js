// Plan day editor: rename, pick weekday, add / remove / reorder / swap
// exercises and edit sets & reps. History is never touched.
import { h, mount } from './dom.js';
import { icon } from './icons.js';
import { openActions, openForm, openConfirm, toast } from './sheet.js';
import { go, backButton } from './router.js';
import { openExercisePicker } from './picker.js';
import { state, updateSettings } from '../store/state.js';
import { uid } from '../store/defaults.js';
import { WEEKDAYS_LETTER, WEEKDAYS_SHORT } from '../dates.js';
import { exerciseById, planDayById } from '../logic/training.js';
import { incrementFor } from '../logic/overload.js';

export const repsLabel = (it) => `${it.sets} × ${it.repsMin === it.repsMax ? it.repsMin : `${it.repsMin}–${it.repsMax}`}`;

export function renderPlanDay(root, { id }) {
  const day = planDayById(id);
  if (!day) return queueMicrotask(() => go('workouts'));
  const edit = (fn) => updateSettings(() => fn(planDayById(id)));

  mount(root,
    backButton('Workouts', 'workouts'),
    h('header', { class: 'page-head' },
      h('div', null, h('div', { class: 'eyebrow' }, 'Plan day'), h('h1', null, day.name)),
      h('button', { class: 'btn sm soft', onClick: () => openForm({
        title: 'Rename day',
        fields: [{ key: 'name', label: 'Name', type: 'text', value: day.name }],
        onSave: ({ name }) => edit((d) => { d.name = name; }),
      }) }, icon('edit'), 'Rename')),

    h('div', { class: 'section-label' }, 'Day of the week'),
    h('div', { class: 'list' }, h('div', { class: 'days' }, WEEKDAYS_LETTER.map((l, wd) =>
      h('button', { class: 'day-btn' + (day.weekday === wd ? ' on' : ''), 'aria-label': WEEKDAYS_SHORT[wd], onClick: () => setWeekday(day, wd) }, l)))),
    h('p', { class: 'list-note' }, 'Picking a day used by another session swaps them. To shift one week only, tap the day on the Workouts tab.'),

    h('div', { class: 'section-label' }, 'Exercises'),
    h('div', { class: 'list' },
      day.items.map((it, i) => {
        const ex = exerciseById(it.exerciseId);
        return h('div', { class: 'row' },
          h('button', { class: 'grow', style: { textAlign: 'left' }, onClick: () => itemMenu(day, it) },
            h('div', { class: 'title' }, ex.name),
            h('div', { class: 'meta' }, `${repsLabel(it)} · +${incrementFor(ex, state.settings.overload)} lb steps`)),
          i > 0 ? h('button', { class: 'icon-btn', 'aria-label': 'Move up', onClick: () => edit((d) => {
            [d.items[i - 1], d.items[i]] = [d.items[i], d.items[i - 1]];
          }) }, icon('up')) : null,
          h('button', { class: 'icon-btn', 'aria-label': `Options for ${ex.name}`, onClick: () => itemMenu(day, it) }, icon('more')));
      }),
      h('button', { class: 'row', style: { color: 'var(--accent)' }, onClick: () => addExercise(day) }, icon('plus'), 'Add exercise')),
    h('p', { class: 'list-note' }, 'Removing or swapping an exercise keeps its history. Add it back any time and its progression picks up where it left off.'),

    state.settings.plan.days.length > 1
      ? h('button', { class: 'btn danger block', style: { marginTop: '28px' }, onClick: () => openConfirm({
          title: `Delete ${day.name}?`,
          message: 'The day is removed from your plan. Past workouts and exercise history are kept.',
          confirmLabel: 'Delete', danger: true,
          onConfirm: () => { updateSettings((s) => { s.plan.days = s.plan.days.filter((d) => d.id !== id); }); go('workouts'); },
        }) }, 'Delete this day')
      : null);
}

function setWeekday(day, wd) {
  updateSettings((s) => {
    const me = s.plan.days.find((d) => d.id === day.id);
    const other = s.plan.days.find((d) => d.weekday === wd && d.id !== day.id);
    if (other) other.weekday = me.weekday;
    me.weekday = wd;
  });
}

function itemMenu(day, it) {
  const ex = exerciseById(it.exerciseId);
  const edit = (fn) => updateSettings(() => fn(planDayById(day.id).items.find((x) => x.id === it.id)));
  openActions({
    title: ex.name,
    actions: [
      { label: 'Edit sets & reps', icon: 'edit', onClick: () => editItem(day, it) },
      { label: 'Swap exercise', icon: 'swap', onClick: () => openExercisePicker({
          title: `Swap ${ex.name}`,
          exclude: planDayById(day.id).items.map((x) => x.exerciseId),
          onPick: (newId) => { edit((x) => { x.exerciseId = newId; }); toast(`Swapped in ${exerciseById(newId).name}`); },
        }) },
      { label: 'View history', icon: 'progress', onClick: () => go('exercise', { id: ex.id, back: { to: 'planday', params: { id: day.id } } }) },
      { label: 'Remove from plan', icon: 'trash', danger: true, onClick: () => {
          updateSettings(() => { const d = planDayById(day.id); d.items = d.items.filter((x) => x.id !== it.id); });
          toast(`Removed ${ex.name} (history kept)`);
        } },
    ],
  });
}

export function editItem(day, it, title = 'Sets & reps') {
  openForm({
    title,
    fields: [
      { key: 'sets', label: 'Sets', type: 'number', value: it.sets },
      { key: 'repsMin', label: 'Reps (bottom of range)', type: 'number', value: it.repsMin },
      { key: 'repsMax', label: 'Reps (top of range, same = fixed reps)', type: 'number', value: it.repsMax },
    ],
    onSave: ({ sets, repsMin, repsMax }) => updateSettings(() => {
      const x = planDayById(day.id).items.find((y) => y.id === it.id);
      x.sets = Math.max(1, Math.round(sets));
      x.repsMin = Math.max(1, Math.round(Math.min(repsMin, repsMax)));
      x.repsMax = Math.max(1, Math.round(Math.max(repsMin, repsMax)));
    }),
  });
}

function addExercise(day) {
  openExercisePicker({
    title: `Add to ${day.name}`,
    exclude: day.items.map((x) => x.exerciseId),
    onPick: (exId) => {
      const item = { id: uid(), exerciseId: exId, sets: 3, repsMin: 8, repsMax: 10 };
      updateSettings(() => { planDayById(day.id).items.push(item); });
      editItem(day, item, `${exerciseById(exId).name}: sets & reps`);
    },
  });
}
