// Exercise picker sheet: search the library, or create a new exercise.
import { h } from './dom.js';
import { icon } from './icons.js';
import { openSheet, openForm } from './sheet.js';
import { state, updateSettings } from '../store/state.js';
import { uid } from '../store/defaults.js';

// onPick(exerciseId, toggleOn). `toggle` adds an optional switch row,
// e.g. "Also update my plan" when swapping mid-workout.
export function openExercisePicker({ title, exclude = [], toggle, onPick }) {
  let toggleOn = toggle?.default ?? false;
  let query = '';
  const listEl = h('div', { class: 'list picker-list' });

  const paintList = () => {
    const q = query.trim().toLowerCase();
    const matches = state.settings.exercises
      .filter((e) => !exclude.includes(e.id) && (!q || e.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
    listEl.replaceChildren(
      h('button', { class: 'row', style: { color: 'var(--accent)' }, onClick: () => createExercise(query, (id) => { close(); onPick(id, toggleOn); }) },
        icon('plus'), h('span', { class: 'grow' }, query ? `Create “${query.trim()}”` : 'New exercise')),
      ...matches.map((e) => h('button', { class: 'row', onClick: () => { close(); onPick(e.id, toggleOn); } },
        h('span', { class: 'grow' }, h('div', { class: 'title' }, e.name), h('div', { class: 'meta' }, e.region === 'lower' ? 'Lower body' : 'Upper body'))))
    );
  };

  const search = h('input', { type: 'text', placeholder: 'Search exercises', autocomplete: 'off', onInput: (e) => { query = e.target.value; paintList(); } });
  const sw = h('span', { class: 'switch' + (toggleOn ? ' on' : '') });
  const content = h('div', null,
    h('div', { class: 'field' }, search),
    toggle ? h('button', { class: 'row', style: { padding: '4px 4px 12px' }, onClick: () => { toggleOn = !toggleOn; sw.classList.toggle('on', toggleOn); } },
      h('span', { class: 'grow' }, toggle.label), sw) : null,
    listEl);
  paintList();
  const close = openSheet(title, content);
  return close;
}

// Name + upper/lower body. Calls done(newId).
export function createExercise(name, done) {
  let region = 'upper';
  const seg = h('div', { class: 'segmented' });
  const paintSeg = () => seg.replaceChildren(...['upper', 'lower'].map((r) =>
    h('button', { type: 'button', class: region === r ? 'on' : '', onClick: () => { region = r; paintSeg(); } }, r === 'upper' ? 'Upper body' : 'Lower body')));
  paintSeg();
  openForm({
    title: 'New exercise',
    fields: [{ key: 'name', label: 'Name', type: 'text', value: name?.trim() || '', placeholder: 'e.g. Cable fly' }],
    extra: h('div', { class: 'field' }, h('label', null, 'Weight increase uses'), seg),
    saveLabel: 'Create',
    onSave: ({ name }) => {
      const id = uid();
      updateSettings((s) => { s.exercises.push({ id, name, region, increment: null }); });
      done(id);
    },
  });
}
