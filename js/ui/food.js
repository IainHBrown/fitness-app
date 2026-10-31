// Food tab: rough tracking. Quick-add list (editable), custom entry,
// one-tap re-log of past meals, and today's log.
import { h, mount, fmt, tick } from './dom.js';
import { icon } from './icons.js';
import { targetMeter, rangeMeter, cardHead } from './components.js';
import { openForm, toast } from './sheet.js';
import { state, getDay, updateDay, updateSettings } from '../store/state.js';
import { todayKey, formatTime } from '../dates.js';
import { foodTotals, recentMeals } from '../logic/food.js';
import { uid } from '../store/defaults.js';

let editing = false; // quick-add list edit mode

export function renderFood(root) {
  const key = todayKey();
  const day = getDay(key);
  const t = foodTotals(day);
  const g = day.goals;
  const recent = recentMeals();

  mount(root, 
    h('header', { class: 'page-head' },
      h('div', null, h('div', { class: 'eyebrow' }, g.training ? 'Training day' : 'Rest day'), h('h1', null, 'Food')),
      h('button', { class: 'btn sm soft', onClick: () => customEntry(key) }, icon('plus'), 'Custom')),

    h('section', { class: 'card' },
      targetMeter({ name: 'Calories', value: t.cal, target: g.calories, unit: 'kcal', animKey: 'food-cal' }),
      rangeMeter({ name: 'Protein', value: t.protein, min: g.proteinMin, max: g.proteinMax, unit: 'g', animKey: 'food-protein' })),

    h('section', { class: 'card' },
      cardHead('Quick add', null,
        h('button', { class: 'card-link', onClick: () => { editing = !editing; rerender(root); } }, editing ? 'Done' : 'Edit')),
      editing ? h('p', { class: 'small faint', style: { margin: '-4px 0 10px' } }, 'Tap a food to edit or delete it.') : null,
      h('div', { class: 'food-grid' },
        state.settings.foods.map((f) => foodTile(key, f)),
        editing ? h('button', { class: 'food-tile add', onClick: () => editFood(null) }, icon('plus'), 'New food') : null)),

    recent.length ? h('section', { class: 'card' },
      cardHead('Eat again'),
      h('div', { class: 'list', style: { border: 0, background: 'none' } },
        recent.map((f) => h('button', { class: 'row', style: { padding: '10px 2px' }, onClick: () => logFood(key, f) },
          h('span', { class: 'grow' }, h('div', { class: 'title' }, f.name), h('div', { class: 'meta' }, macro(f))),
          h('span', { class: 'btn sm soft' }, icon('plus')))))) : null,

    h('section', { class: 'card' },
      cardHead("Today's log", null, h('span', { class: 'chip muted' }, `${day.food.length} item${day.food.length === 1 ? '' : 's'}`)),
      day.food.length
        ? h('div', null, [...day.food].reverse().map((f) =>
            h('div', { class: 'row', style: { padding: '8px 2px' } },
              h('span', { class: 'grow' }, h('div', { class: 'title' }, f.name), h('div', { class: 'meta' }, `${formatTime(f.t)} · ${macro(f)}`)),
              h('button', { class: 'icon-btn', 'aria-label': `Remove ${f.name}`, onClick: () => removeEntry(key, f) }, icon('x')))))
        : h('p', { class: 'muted small' }, 'Nothing logged yet. Tap a food above.'))
  );
}

const macro = (f) => `${fmt(f.cal)} kcal · ${fmt(f.protein)} g protein`;

function rerender(root) {
  root.replaceChildren();
  renderFood(root);
}

function foodTile(key, f) {
  const el = h('button', {
    class: 'food-tile' + (editing ? ' editing' : ''),
    onClick: () => {
      if (editing) return editFood(f);
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
      logFood(key, { name: f.name, cal: f.cal, protein: f.protein, foodId: f.id });
    },
  },
    h('span', { class: 'n' }, f.name),
    h('span', { class: 'm' }, `${fmt(f.cal)} kcal · ${fmt(f.protein)} g`));
  return el;
}

function logFood(key, { name, cal, protein, foodId }) {
  tick();
  const id = uid();
  updateDay(key, (d) => { d.food.push({ id, t: Date.now(), name, cal, protein, foodId: foodId || null }); });
  toast(`Logged ${name}`, {
    action: 'Undo',
    onAction: () => updateDay(key, (d) => { d.food = d.food.filter((x) => x.id !== id); }),
  });
}

function removeEntry(key, f) {
  updateDay(key, (d) => { d.food = d.food.filter((x) => x.id !== f.id); });
  toast(`Removed ${f.name}`, {
    action: 'Undo',
    onAction: () => updateDay(key, (d) => { d.food.push(f); d.food.sort((a, b) => a.t - b.t); }),
  });
}

function customEntry(key) {
  let saveToList = false;
  const sw = h('span', { class: 'switch' });
  const extra = h('button', { type: 'button', class: 'row', style: { padding: '6px 4px', marginBottom: '4px' },
    onClick: () => { saveToList = !saveToList; sw.classList.toggle('on', saveToList); } },
    h('span', { class: 'grow' }, 'Also add to quick-add list'), sw);

  openForm({
    title: 'Custom entry',
    saveLabel: 'Log it',
    extra,
    fields: [
      { key: 'name', label: 'Name (optional)', type: 'text', placeholder: 'e.g. Dining hall plate', optional: true },
      { key: 'cal', label: 'Calories (rough)', type: 'number', placeholder: 'kcal' },
      { key: 'protein', label: 'Protein (rough)', type: 'number', placeholder: 'g' },
    ],
    onSave: ({ name, cal, protein }) => {
      const entry = { name: name || 'Custom meal', cal: Math.round(cal), protein: Math.round(protein) };
      if (saveToList) {
        const id = uid();
        updateSettings((s) => { s.foods.push({ id, ...entry }); });
        entry.foodId = id;
      }
      logFood(key, entry);
    },
  });
}

export function editFood(f) {
  openForm({
    title: f ? 'Edit food' : 'New food',
    fields: [
      { key: 'name', label: 'Name', type: 'text', value: f?.name, placeholder: 'e.g. Burrito bowl' },
      { key: 'cal', label: 'Calories (rough)', type: 'number', value: f?.cal, placeholder: 'kcal' },
      { key: 'protein', label: 'Protein (rough)', type: 'number', value: f?.protein, placeholder: 'g' },
    ],
    onSave: (v) => updateSettings((s) => {
      const vals = { name: v.name, cal: Math.round(v.cal), protein: Math.round(v.protein) };
      if (f) Object.assign(s.foods.find((x) => x.id === f.id), vals);
      else s.foods.push({ id: uid(), ...vals });
    }),
    onDelete: f ? () => updateSettings((s) => { s.foods = s.foods.filter((x) => x.id !== f.id); }) : null,
  });
}
