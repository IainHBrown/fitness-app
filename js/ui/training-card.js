// "Today's training" card, shared by the Today and Workouts tabs:
// start / continue / review a lift, log a run.
import { h, fmt } from './dom.js';
import { icon } from './icons.js';
import { cardHead } from './components.js';
import { openActions } from './sheet.js';
import { go } from './router.js';
import { openRunSheet } from './run-sheet.js';
import { state } from '../store/state.js';
import { dayPlan, legDayTomorrow } from '../logic/schedule.js';
import { activeSession, sessionsOn, startWorkout, suggestedPlanDay, exerciseById } from '../logic/training.js';
import { runsOn, distLabel, paceLabel } from '../logic/runs.js';
import { doneSets } from '../logic/history.js';

const setCount = (session) => session.entries.reduce((n, e) => n + doneSets(e).length, 0);
const plannedSets = (session) => session.entries.reduce((n, e) => n + e.sets.length, 0);

// Start (or continue) a workout. With no plan day given, ask which one.
export function startFlow(planDay = null) {
  const active = activeSession();
  if (active) return go('session', { id: active.id });
  if (planDay) return startWorkout(planDay).then((s) => go('session', { id: s.id }));
  const suggested = suggestedPlanDay();
  const days = [...state.settings.plan.days].sort((a, b) => (a === suggested ? -1 : b === suggested ? 1 : 0));
  openActions({
    title: 'Which workout?',
    note: 'Doing a session on a different day moves it here, so your streak counts it.',
    actions: days.map((d) => ({
      label: d.name,
      sub: (d === suggested ? 'Next in rotation · ' : '') + `${d.items.length} exercises`,
      icon: 'workouts',
      onClick: () => startFlow(d),
    })),
  });
}

export function trainingCard(key) {
  const plan = dayPlan(key, state.settings);
  const active = activeSession();
  const done = sessionsOn(key).filter((s) => s.status === 'done');
  const runs = runsOn(key);
  const parts = [];

  // Lifting
  if (active) {
    parts.push(row('workouts', `${active.name} in progress`, `${setCount(active)} of ${plannedSets(active)} sets logged`,
      h('button', { class: 'btn primary sm', onClick: () => go('session', { id: active.id }) }, 'Continue')));
  } else if (done.length) {
    for (const s of done) {
      const mins = Math.round((s.finishedAt - s.startedAt) / 60000);
      parts.push(row('check', `${s.name} done`, `${setCount(s)} sets · ${mins} min`,
        h('button', { class: 'btn soft sm', onClick: () => go('session', { id: s.id }) }, 'View'), true));
    }
  } else if (plan.lift) {
    const names = plan.lift.items.map((it) => exerciseById(it.exerciseId)?.name).filter(Boolean);
    parts.push(row('workouts', `${plan.lift.name} day${plan.movedIn ? ' (moved)' : ''}`, names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : ''),
      h('button', { class: 'btn primary sm', onClick: () => startFlow(plan.lift) }, 'Start')));
  }

  // Running
  for (const r of runs) {
    parts.push(row('check', `Run · ${distLabel(r.distanceKm)}`, `${fmt(r.durationMin, 0)} min · ${paceLabel(r)} · effort ${r.effort}`,
      h('button', { class: 'btn soft sm', onClick: () => openRunSheet({ run: r }) }, 'Edit'), true));
  }
  if (plan.run && !runs.length) {
    const easy = legDayTomorrow(key, state.settings);
    parts.push(row('run', 'Run · ~30 min', easy ? 'Keep it easy, leg day tomorrow' : 'Log it when you’re back',
      h('button', { class: 'btn primary sm', onClick: () => openRunSheet({ date: key }) }, 'Log run')));
  }

  if (!parts.length) {
    parts.push(row('rest', 'Rest day', 'Recover, hit your water and protein.', null));
  }

  const extra = [];
  if (!active && !plan.lift && !done.length) extra.push(h('button', { class: 'text-btn', onClick: () => startFlow() }, 'Start a workout'));
  if (!plan.run && !runs.length) extra.push(h('button', { class: 'text-btn', onClick: () => openRunSheet({ date: key }) }, 'Log a run'));

  return h('section', { class: 'card' },
    cardHead("Today's training", 'workouts'),
    h('div', { class: 'stack', style: { gap: '14px' } }, parts),
    extra.length ? h('div', { class: 'card-extra' }, extra) : null);
}

function row(iconName, title, sub, action, done = false) {
  return h('div', { class: 'plan-preview' },
    h('span', { class: 'badge' + (done ? ' done' : '') }, icon(iconName)),
    h('span', { style: { flex: 1, minWidth: 0 } }, h('div', { class: 't' }, title), h('div', { class: 's' }, sub)),
    action);
}
