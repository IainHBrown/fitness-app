// Workouts tab: this week's schedule, today's training, the lifting plan,
// running stats and per-exercise history.
import { h, mount, fmt } from './dom.js';
import { icon } from './icons.js';
import { cardHead } from './components.js';
import { openActions, toast } from './sheet.js';
import { go } from './router.js';
import { trainingCard, startFlow } from './training-card.js';
import { openRunSheet } from './run-sheet.js';
import { state, updateSettings } from '../store/state.js';
import { uid } from '../store/defaults.js';
import { todayKey, addDays, parseKey, WEEKDAYS_SHORT, formatLong } from '../dates.js';
import { dayPlan } from '../logic/schedule.js';
import { exerciseById, liftDoneOn, moveSession, clearMove } from '../logic/training.js';
import { exerciseHistory, formatSets } from '../logic/history.js';
import { runsOn, runStats, allRuns, weekStart, distLabel, paceLabel, toDisplay, unit } from '../logic/runs.js';

export function renderWorkouts(root) {
  const today = todayKey();
  mount(root,
    h('header', { class: 'page-head' },
      h('div', null, h('div', { class: 'eyebrow' }, 'This week'), h('h1', null, 'Workouts'))),
    weekStrip(today),
    trainingCard(today),
    planSection(),
    runningSection(),
    exercisesSection());
}

// ---------- Week strip ----------

function weekStrip(today) {
  const start = weekStart(today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return h('div', { class: 'week' }, days.map((k) => {
    const p = dayPlan(k, state.settings);
    const liftDone = liftDoneOn(k), runDone = runsOn(k).length > 0;
    const tags = [];
    if (p.lift) tags.push(h('span', { class: 'wk-tag lift' + (liftDone ? ' done' : '') }, liftDone ? '✓' : p.lift.name.slice(0, 4)));
    if (p.run) tags.push(h('span', { class: 'wk-tag run' + (runDone ? ' done' : '') }, runDone ? '✓' : 'Run'));
    if (!p.lift && liftDone) tags.push(h('span', { class: 'wk-tag lift done' }, '✓'));
    return h('button', { class: 'wk-day' + (k === today ? ' today' : '') + (k < today ? ' past' : ''), onClick: () => daySheet(k) },
      h('span', { class: 'wk-name' }, WEEKDAYS_SHORT[parseKey(k).getDay()].slice(0, 1)),
      h('span', { class: 'wk-date' }, parseKey(k).getDate()),
      h('span', { class: 'wk-tags' }, tags.length ? tags : h('span', { class: 'wk-tag rest' }, '–')));
  }));
}

// Tap a day: move its session, start it, or log a run.
function daySheet(k) {
  const p = dayPlan(k, state.settings);
  const today = todayKey();
  const moves = state.settings.schedule.moves.filter((m) => m.from === k || m.to === k);
  const actions = [];
  if (p.lift && !liftDoneOn(k)) {
    if (k === today) actions.push({ label: `Start ${p.lift.name}`, icon: 'workouts', onClick: () => startFlow(p.lift) });
    actions.push({ label: `Move ${p.lift.name} to another day`, icon: 'calendar', onClick: () => pickMoveTarget('lift', k, p.lift) });
  }
  if (p.run && !runsOn(k).length) {
    actions.push({ label: 'Move run to another day', icon: 'calendar', onClick: () => pickMoveTarget('run', k) });
  }
  if (k <= today) actions.push({ label: 'Log a run', icon: 'run', onClick: () => openRunSheet({ date: k }) });
  for (const m of moves) {
    actions.push({ label: `Undo move (${m.type === 'lift' ? 'lift' : 'run'})`, icon: 'undo', onClick: () => clearMove(m.type, k) });
  }
  if (!actions.length) actions.push({ label: 'Nothing scheduled', disabled: true, onClick: () => {} });
  openActions({ title: formatLong(k), actions });
}

function pickMoveTarget(type, from, planDay = null) {
  const options = [-3, -2, -1, 1, 2, 3].map((n) => addDays(from, n)).filter((k) => k >= todayKey());
  openActions({
    title: `Move ${planDay ? planDay.name : 'run'} to…`,
    note: 'Just this week. Your weekly pattern stays the same.',
    actions: options.map((k) => {
      const p = dayPlan(k, state.settings);
      const busy = type === 'lift' ? p.lift?.name : p.run ? 'run' : null;
      return { label: formatLong(k), sub: busy ? `Already has ${busy}` : 'Free', icon: 'calendar',
        onClick: () => { moveSession(type, from, k, planDay?.id); toast('Moved'); } };
    }),
  });
}

// ---------- Lifting plan ----------

function planSection() {
  const days = [...state.settings.plan.days].sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7));
  return [
    h('div', { class: 'section-label' }, 'Lifting plan'),
    h('div', { class: 'list' },
      days.map((d) => h('button', { class: 'row', onClick: () => go('planday', { id: d.id }) },
        h('span', { class: 'grow' },
          h('div', { class: 'title' }, `${d.name}`, h('span', { class: 'faint' }, ` · ${d.weekday == null ? 'No day' : WEEKDAYS_SHORT[d.weekday]}`)),
          h('div', { class: 'meta ellipsis' }, d.items.map((it) => exerciseById(it.exerciseId)?.name).join(', ') || 'No exercises')),
        icon('chev'))),
      h('button', { class: 'row', style: { color: 'var(--accent)' }, onClick: addPlanDay }, icon('plus'), 'Add a day')),
  ];
}

function addPlanDay() {
  const id = uid();
  updateSettings((s) => {
    const used = new Set(s.plan.days.map((d) => d.weekday));
    const free = [1, 2, 3, 4, 5, 6, 0].find((wd) => !used.has(wd));
    s.plan.days.push({ id, name: `Day ${s.plan.days.length + 1}`, weekday: free ?? null, items: [] });
  });
  go('planday', { id });
}

// ---------- Running ----------

function runningSection() {
  const st = runStats();
  const recent = allRuns().slice(0, 5);
  return [
    h('div', { class: 'section-label' }, 'Running'),
    h('section', { class: 'card' },
      h('div', { class: 'stat-row' },
        stat('This week', `${fmt(toDisplay(st.thisWeek), 1)}`, unit()),
        stat('Longest', st.longest ? fmt(toDisplay(st.longest.distanceKm), 1) : '–', st.longest ? unit() : ''),
        stat('Avg pace', st.avgPace, st.count ? `/${unit()}` : '')),
      h('button', { class: 'btn soft block', style: { marginTop: '14px' }, onClick: () => openRunSheet() }, icon('plus'), 'Log a run'),
      recent.length ? h('div', { style: { marginTop: '8px' } }, recent.map((r) =>
        h('button', { class: 'row', style: { padding: '10px 2px' }, onClick: () => openRunSheet({ run: r }) },
          h('span', { class: 'grow' },
            h('div', { class: 'title' }, `${distLabel(r.distanceKm)} · ${fmt(r.durationMin, 0)} min`),
            h('div', { class: 'meta' }, `${formatLong(r.date)} · ${paceLabel(r)} · effort ${r.effort}`)),
          icon('chev')))) : null),
  ];
}

const stat = (label, value, unitText) => h('div', { class: 'stat' },
  h('div', { class: 'stat-l' }, label),
  h('div', { class: 'stat-v' }, value, unitText ? h('span', { class: 'u' }, ` ${unitText}`) : null));

// ---------- Exercise history ----------

function exercisesSection() {
  const inPlan = new Set(state.settings.plan.days.flatMap((d) => d.items.map((it) => it.exerciseId)));
  const rows = state.settings.exercises
    .map((e) => ({ e, hist: exerciseHistory(e.id) }))
    .filter(({ e, hist }) => inPlan.has(e.id) || hist.length)
    .sort((a, b) => a.e.name.localeCompare(b.e.name));
  return [
    h('div', { class: 'section-label' }, 'Exercise history'),
    h('div', { class: 'list' }, rows.map(({ e, hist }) => {
      const last = hist[hist.length - 1];
      return h('button', { class: 'row', onClick: () => go('exercise', { id: e.id }) },
        h('span', { class: 'grow' },
          h('div', { class: 'title' }, e.name),
          h('div', { class: 'meta' }, last ? `Last: ${formatSets(last.entry)} lb` : 'No history yet', inPlan.has(e.id) ? '' : ' · not in plan')),
        icon('chev'));
    })),
  ];
}
