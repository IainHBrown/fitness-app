// Workout logger. Each exercise shows its target (with the reason), what you
// did last time, and quick set rows: weight and reps steppers + a check.
// Every tap saves immediately, so closing the app mid-workout loses nothing.
import { h, mount, tick } from './dom.js';
import { icon } from './icons.js';
import { openActions, openConfirm, openKeypad, toast } from './sheet.js';
import { go, backButton } from './router.js';
import { openExercisePicker } from './picker.js';
import { state, saveSession, deleteSession, updateSettings } from '../store/state.js';
import { uid } from '../store/defaults.js';
import { formatLong, formatTime, relativeDay } from '../dates.js';
import { exerciseById, makeEntry, finishWorkout, planDayById } from '../logic/training.js';
import { exerciseHistory, formatSets, doneSets } from '../logic/history.js';

export function renderSession(root, { id }) {
  const session = state.sessions.get(id);
  if (!session) return queueMicrotask(() => go('workouts')); // e.g. it was deleted
  const active = session.status === 'active';
  const total = session.entries.reduce((n, e) => n + e.sets.length, 0);
  const done = session.entries.reduce((n, e) => n + doneSets(e).length, 0);

  mount(root,
    backButton('Workouts', 'workouts'),
    h('header', { class: 'page-head' },
      h('div', null,
        h('div', { class: 'eyebrow' }, active ? `Started ${formatTime(session.startedAt)}` : formatLong(session.date)),
        h('h1', null, session.name)),
      h('span', { class: 'chip' + (active ? '' : ' good') }, active ? `${done}/${total} sets` : 'Completed')),

    session.entries.map((entry, i) => entryCard(session, entry, i)),

    h('button', { class: 'btn soft block', onClick: () => addExercise(session) }, icon('plus'), 'Add exercise'),

    active
      ? h('div', { class: 'stack', style: { marginTop: '20px' } },
          h('button', { class: 'btn primary block', onClick: () => finish(session) }, 'Finish workout'),
          h('button', { class: 'text-btn', style: { alignSelf: 'center', color: 'var(--bad)' }, onClick: () => openConfirm({
            title: 'Discard workout?', message: 'Nothing from this session will be saved.', confirmLabel: 'Discard', danger: true,
            onConfirm: () => { deleteSession(session.id); go('workouts'); },
          }) }, 'Discard workout'))
      : h('div', { class: 'stack', style: { marginTop: '20px' } },
          h('p', { class: 'list-note', style: { textAlign: 'center' } }, 'Edits to a finished workout save automatically.'),
          h('button', { class: 'text-btn', style: { alignSelf: 'center', color: 'var(--bad)' }, onClick: () => openConfirm({
            title: 'Delete workout?', message: 'This removes it from your history and progression.', confirmLabel: 'Delete', danger: true,
            onConfirm: () => { deleteSession(session.id); go('workouts'); },
          }) }, 'Delete workout')));
}

const save = (session) => saveSession(session);

// ---------- One exercise ----------

function entryCard(session, entry, index) {
  const ex = exerciseById(entry.exerciseId);
  const t = entry.target;
  const range = entry.repsMin === entry.repsMax ? `${entry.repsMin}` : `${entry.repsMin}–${entry.repsMax}`;
  const last = exerciseHistory(entry.exerciseId, session.id).filter((x) => x.date <= session.date).pop();
  const step = state.settings.overload.roundTo || 5;
  const allDone = entry.sets.length > 0 && entry.sets.every((s) => s.done);

  return h('section', { class: 'card entry' + (allDone ? ' complete' : '') },
    h('div', { class: 'entry-head' },
      h('button', { class: 'entry-name', onClick: () => go('exercise', { id: ex.id, back: { to: 'session', params: { id: session.id } } }) }, ex.name),
      h('button', { class: 'icon-btn', 'aria-label': `Options for ${ex.name}`, onClick: () => entryMenu(session, entry, index) }, icon('more'))),

    h('div', { class: 'target' + (t.deload ? ' deload' : '') },
      t.weight == null
        ? h('span', null, h('b', null, 'Your choice'), ` × ${t.reps} × ${entry.setsTarget}`)
        : h('span', null, h('b', null, `${t.weight} lb`), ` × ${t.reps} × ${entry.setsTarget}`),
      range !== String(t.reps) ? h('span', { class: 'faint' }, ` (range ${range})`) : null),
    h('p', { class: 'reason' }, t.reason),
    last ? h('p', { class: 'last' }, `Last (${relativeDay(last.date)}): ${formatSets(last.entry)} lb`) : null,

    h('div', { class: 'set-head' }, h('span', null, 'Set'), h('span', null, 'Weight (lb)'), h('span', null, 'Reps'), h('span')),
    entry.sets.map((s, i) => setRow(session, entry, s, i, step)),

    h('div', { class: 'entry-foot' },
      h('button', { class: 'text-btn', onClick: () => {
        const prev = entry.sets[entry.sets.length - 1];
        entry.sets.push({ weight: prev?.weight ?? null, reps: prev?.reps ?? entry.repsMin, done: false });
        save(session);
      } }, '+ Add set'),
      entry.sets.length > 1 ? h('button', { class: 'text-btn', style: { color: 'var(--text-3)' }, onClick: () => {
        entry.sets.pop();
        save(session);
      } }, 'Remove set') : null));
}

function setRow(session, entry, s, i, step) {
  // Changing a set's weight/reps also updates the unchecked sets after it.
  const setValue = (key, v) => {
    const old = s[key];
    s[key] = v;
    for (const later of entry.sets.slice(i + 1)) if (!later.done && later[key] === old) later[key] = v;
    save(session);
  };
  const askWeight = (then) => openKeypad({
    title: `Set ${i + 1} weight`,
    fields: [{ key: 'w', label: 'Weight', value: s.weight, unit: 'lb', decimals: 1, max: 2000 }],
    hint: entry.target.first ? 'First time: choose a weight that feels comfortable.' : null,
    onSave: ({ w }) => { setValue('weight', w); then?.(); },
  });

  return h('div', { class: 'set-row' + (s.done ? ' done' : '') },
    h('span', { class: 'set-n' }, i + 1),
    stepper(s.weight, step, (v) => setValue('weight', Math.max(0, v)), () => askWeight()),
    stepper(s.reps, 1, (v) => setValue('reps', Math.max(0, v)), () => openKeypad({
      title: `Set ${i + 1} reps`,
      fields: [{ key: 'r', label: 'Reps', value: s.reps, max: 100 }],
      onSave: ({ r }) => setValue('reps', r),
    })),
    h('button', {
      class: 'set-check', 'aria-label': s.done ? 'Mark set not done' : 'Mark set done',
      onClick: () => {
        const toggle = () => { tick(); s.done = !s.done; save(session); };
        if (!s.done && s.weight == null) askWeight(toggle); // need a weight first
        else toggle();
      },
    }, icon('check')));
}

function stepper(value, step, onChange, onTap) {
  return h('div', { class: 'stepper' },
    h('button', { 'aria-label': 'Decrease', onClick: () => value != null && onChange(value - step) }, icon('minus')),
    h('button', { class: 'val' + (value == null ? ' empty' : ''), onClick: onTap }, value == null ? '—' : String(value)),
    h('button', { 'aria-label': 'Increase', onClick: () => (value == null ? onTap() : onChange(value + step)) }, icon('plus')));
}

// ---------- Editing mid-workout ----------

function entryMenu(session, entry, index) {
  const ex = exerciseById(entry.exerciseId);
  const actions = [
    { label: 'Swap exercise', sub: 'e.g. if the machine is taken', icon: 'swap', onClick: () => swapExercise(session, entry, index) },
    index > 0 ? { label: 'Move up', icon: 'up', onClick: () => {
      [session.entries[index - 1], session.entries[index]] = [session.entries[index], session.entries[index - 1]];
      save(session);
    } } : null,
    { label: 'View history', icon: 'progress', onClick: () => go('exercise', { id: ex.id, back: { to: 'session', params: { id: session.id } } }) },
    { label: 'Remove from this workout', icon: 'trash', danger: true, onClick: () => {
      session.entries.splice(index, 1);
      save(session);
      toast(`Removed ${ex.name}`);
    } },
  ].filter(Boolean);
  openActions({ title: ex.name, actions });
}

function swapExercise(session, entry, index) {
  openExercisePicker({
    title: `Swap ${exerciseById(entry.exerciseId).name}`,
    exclude: session.entries.map((e) => e.exerciseId),
    toggle: { label: 'Also change my plan', default: false },
    onPick: (newId, updatePlan) => {
      const item = { id: entry.itemId, exerciseId: newId, sets: entry.setsTarget, repsMin: entry.repsMin, repsMax: entry.repsMax };
      session.entries[index] = makeEntry(item, session.id);
      save(session);
      if (updatePlan && entry.itemId) {
        updateSettings(() => {
          const it = planDayById(session.planDayId)?.items.find((x) => x.id === entry.itemId);
          if (it) it.exerciseId = newId;
        });
      }
      toast(`Swapped in ${exerciseById(newId).name}${updatePlan ? ' (plan updated)' : ''}`);
    },
  });
}

function addExercise(session) {
  openExercisePicker({
    title: 'Add exercise',
    exclude: session.entries.map((e) => e.exerciseId),
    toggle: { label: 'Also add to my plan', default: false },
    onPick: (exId, addToPlan) => {
      const item = { id: addToPlan ? uid() : null, exerciseId: exId, sets: 3, repsMin: 8, repsMax: 10 };
      session.entries.push(makeEntry(item, session.id));
      save(session);
      if (addToPlan) updateSettings(() => { planDayById(session.planDayId)?.items.push({ ...item }); });
    },
  });
}

async function finish(session) {
  const unchecked = session.entries.reduce((n, e) => n + e.sets.filter((s) => !s.done).length, 0);
  const doIt = async () => {
    const sets = await finishWorkout(session);
    toast(`Workout saved · ${sets} sets`);
    go('workouts');
  };
  if (unchecked) {
    openConfirm({
      title: 'Finish workout?',
      message: `${unchecked} set${unchecked === 1 ? ' isn’t' : 's aren’t'} checked off. Unchecked sets don’t count toward progression.`,
      confirmLabel: 'Finish', onConfirm: doIt,
    });
  } else doIt();
}
