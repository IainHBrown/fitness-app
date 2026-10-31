// Today tab: sleep, body weight, water, food totals, supplements,
// today's workout/run, and streaks at a glance.
import { h, mount, fmt, tick } from './dom.js';
import { icon } from './icons.js';
import { ring, targetMeter, rangeMeter, streakTile, cardHead } from './components.js';
import { openKeypad, toast } from './sheet.js';
import { go } from './router.js';
import { state, getDay, updateDay } from '../store/state.js';
import { todayKey, formatLong, relativeDay } from '../dates.js';
import { foodTotals } from '../logic/food.js';
import { waterStreak, supplementStreak, workoutStreak, waterTotal } from '../logic/streaks.js';
import { trainingCard } from './training-card.js';
import { uid } from '../store/defaults.js';

export function renderToday(root) {
  const key = todayKey();
  const day = getDay(key);
  const g = day.goals;

  mount(root, 
    h('header', { class: 'page-head' },
      h('div', null,
        h('div', { class: 'eyebrow' }, formatLong(key)),
        h('h1', null, 'Today')),
      h('span', { class: 'chip' + (g.training ? '' : ' muted') }, g.training ? 'Training day' : 'Rest day')),
    streaksRow(),
    h('div', { class: 'grid-2', style: { marginBottom: 'var(--gap)' } }, sleepTile(key, day), weightTile(key, day)),
    waterCard(key, day),
    foodCard(day),
    supplementsCard(key, day),
    trainingCard(key)
  );
}

// ---------- Streaks ----------

function streaksRow() {
  return h('div', { class: 'streaks' },
    streakTile('Water', 'drop', waterStreak()),
    streakTile('Workouts', 'workouts', workoutStreak()),
    streakTile('Supplements', 'pill', supplementStreak()),
  );
}

// ---------- Sleep ----------

function sleepTile(key, day) {
  const has = day.sleep != null;
  const goal = day.goals.sleep;
  return h('button', {
    class: 'card tile',
    onClick: () => openKeypad({
      title: 'Sleep score',
      fields: [{ key: 'v', label: 'Score', value: day.sleep, max: 100 }],
      hint: `Goal: ${goal}+`,
      onSave: ({ v }) => updateDay(key, (d) => { d.sleep = v; }),
      onClear: has ? () => updateDay(key, (d) => { d.sleep = null; }) : null,
    }),
  },
    cardHead('Sleep', 'moon'),
    h('div', { class: 'big' + (has ? '' : ' empty') }, has ? day.sleep : '—'),
    h('div', { class: 'sub', style: has ? { color: day.sleep >= goal ? 'var(--good)' : 'var(--warn)' } : null },
      has ? (day.sleep >= goal ? 'Goal met' : `${goal - day.sleep} below goal`) : 'Tap to log'));
}

// ---------- Body weight ----------

function lastWeight(beforeOrOn) {
  let best = null;
  for (const d of state.days.values()) {
    if (d.weight != null && d.date <= beforeOrOn && (!best || d.date > best.date)) best = d;
  }
  return best;
}

function weightTile(key, day) {
  const has = day.weight != null;
  const last = lastWeight(key);
  const goal = state.settings.weight.goal;
  let sub = 'Tap to log';
  if (has) sub = `${fmt(Math.abs(day.weight - goal), 1)} lb ${day.weight > goal ? 'to goal' : 'under goal'}`;
  else if (last) sub = `Last ${fmt(last.weight, 1)} · ${relativeDay(last.date)}`;

  return h('button', {
    class: 'card tile',
    onClick: () => openKeypad({
      title: 'Body weight',
      fields: [{ key: 'v', label: 'Weight', value: day.weight ?? last?.weight ?? null, unit: 'lb', decimals: 1, max: 999 }],
      hint: `Goal: ${goal} lb`,
      onSave: ({ v }) => updateDay(key, (d) => { d.weight = v; }),
      onClear: has ? () => updateDay(key, (d) => { d.weight = null; }) : null,
    }),
  },
    cardHead('Weight', 'scale'),
    h('div', { class: 'big' + (has ? '' : ' empty') }, has ? fmt(day.weight, 1) : '—', has ? h('span', { class: 'unit' }, 'lb') : null),
    h('div', { class: 'sub' }, sub));
}

// ---------- Water ----------

export const waterLabel = (q) => (q.name ? `+1 ${q.name}` : `+${q.ml} ml`);

function addWater(key, ml) {
  tick();
  const id = uid();
  updateDay(key, (d) => { d.water.push({ id, t: Date.now(), ml }); });
  toast(`Added ${fmt(ml)} ml`, {
    action: 'Undo',
    onAction: () => updateDay(key, (d) => { d.water = d.water.filter((w) => w.id !== id); }),
  });
}

function waterCard(key, day) {
  const total = waterTotal(day);
  const goal = day.goals.waterMl;
  const left = goal - total;
  const last = day.water[day.water.length - 1];

  return h('section', { class: 'card' },
    cardHead('Water', 'drop', left <= 0 ? h('span', { class: 'chip good' }, 'Goal hit') : null),
    h('div', { class: 'water' },
      ring({ value: total, goal, label: total >= 1000 ? `${fmt(total / 1000, 2)} L` : `${fmt(total)} ml`, sub: `of ${fmt(goal / 1000, 2)} L`, animKey: 'water-ring' }),
      h('div', { class: 'water-actions' },
        state.settings.water.quickAdd.map((q) =>
          h('button', { class: 'btn soft block', onClick: () => addWater(key, q.ml) }, waterLabel(q))),
      )),
    h('div', { class: 'water-foot' },
      h('span', null, left > 0 ? `${fmt(left)} ml to go` : `${fmt(-left)} ml over goal`),
      h('span', null,
        h('button', { class: 'text-btn', onClick: () => openKeypad({
          title: 'Add water',
          fields: [{ key: 'ml', label: 'Amount', unit: 'ml', max: 5000 }],
          presets: [100, 330, 1000],
          onSave: ({ ml }) => ml > 0 && addWater(key, ml),
        }) }, 'Custom'),
        last ? h('button', { class: 'text-btn', style: { marginLeft: '14px' }, onClick: () => {
          updateDay(key, (d) => { d.water.pop(); });
          toast(`Removed ${fmt(last.ml)} ml`);
        } }, 'Remove last') : null)));
}

// ---------- Food ----------

function foodCard(day) {
  const t = foodTotals(day);
  const g = day.goals;
  return h('section', { class: 'card' },
    cardHead('Food', 'food', h('button', { class: 'card-link', onClick: () => go('food') }, 'Log food')),
    targetMeter({ name: 'Calories', value: t.cal, target: g.calories, unit: 'kcal', animKey: 'today-cal' }),
    rangeMeter({ name: 'Protein', value: t.protein, min: g.proteinMin, max: g.proteinMax, unit: 'g', animKey: 'today-protein' }));
}

// ---------- Supplements ----------

function supplementsCard(key, day) {
  const { list, checked } = day.supplements;
  const done = list.filter((s) => checked.includes(s.id)).length;
  const toggle = (id) => {
    tick();
    updateDay(key, (d) => {
      const c = d.supplements.checked;
      d.supplements.checked = c.includes(id) ? c.filter((x) => x !== id) : [...c, id];
    });
  };
  return h('section', { class: 'card' },
    cardHead('Supplements', 'pill',
      h('span', { class: 'chip' + (list.length && done === list.length ? ' good' : ' muted') }, `${done}/${list.length}`)),
    list.length
      ? h('div', null, list.map((s) =>
          h('button', { class: 'check-row' + (checked.includes(s.id) ? ' on' : ''), onClick: () => toggle(s.id) },
            h('span', { class: 'check' }, icon('check')),
            h('span', { class: 'lbl' }, s.name))))
      : h('p', { class: 'muted small' }, 'No supplements set up. ',
          h('button', { class: 'text-btn', onClick: () => go('settings') }, 'Add in Settings')));
}
