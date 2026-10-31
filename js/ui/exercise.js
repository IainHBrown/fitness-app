// Per-exercise history: personal records, strength chart (top weight and
// estimated 1RM), next target and every past session.
import { h, mount, fmt } from './dom.js';
import { icon } from './icons.js';
import { openForm } from './sheet.js';
import { go, backButton } from './router.js';
import { state, updateSettings } from '../store/state.js';
import { formatLong } from '../dates.js';
import { exerciseById } from '../logic/training.js';
import { exerciseHistory, personalRecords, formatSets, doneSets, e1rm } from '../logic/history.js';
import { nextTarget, incrementFor } from '../logic/overload.js';
import { repsLabel } from './planday.js';
import { lineChart } from './chart.js';
import { strengthPoints } from '../logic/stats.js';

export function renderExercise(root, { id, back }) {
  const ex = exerciseById(id);
  if (!ex) return queueMicrotask(() => go('workouts'));
  const hist = exerciseHistory(id);
  const pr = personalRecords(id);
  const planItem = state.settings.plan.days.flatMap((d) => d.items).find((it) => it.exerciseId === id);
  const next = planItem ? nextTarget(ex, planItem, hist, state.settings.overload) : null;

  mount(root,
    back ? backButton('Back', back.to, back.params) : backButton('Workouts', 'workouts'),
    h('header', { class: 'page-head' },
      h('div', null,
        h('div', { class: 'eyebrow' }, `${ex.region === 'lower' ? 'Lower' : 'Upper'} body · +${incrementFor(ex, state.settings.overload)} lb steps`),
        h('h1', { style: { fontSize: '28px' } }, ex.name)),
      h('button', { class: 'btn sm soft', onClick: () => editExercise(ex) }, icon('edit'), 'Edit')),

    h('div', { class: 'grid-2', style: { marginBottom: 'var(--gap)' } },
      prTile('Heaviest set', pr.heaviest ? `${pr.heaviest.weight}` : '–', pr.heaviest ? `lb × ${pr.heaviest.reps}` : '', pr.heaviest?.date),
      prTile('Best est. 1RM', pr.bestE1rm ? fmt(pr.bestE1rm.value) : '–', pr.bestE1rm ? 'lb' : '', pr.bestE1rm && `${pr.bestE1rm.weight} × ${pr.bestE1rm.reps}`)),

    strengthChart(id),

    next ? h('section', { class: 'card' },
      h('div', { class: 'card-title', style: { marginBottom: '6px' } }, 'Next target'),
      h('div', { class: 'target-big' }, next.weight == null ? 'Your choice' : `${next.weight} lb`, h('span', { class: 'faint' }, ` × ${next.reps} · ${repsLabel(planItem)}`)),
      h('p', { class: 'reason' }, next.reason)) : h('p', { class: 'list-note' }, 'Not in your plan right now. Its history is kept, and adding it back continues from here.'),

    h('div', { class: 'section-label' }, `History · ${hist.length} session${hist.length === 1 ? '' : 's'}`),
    hist.length
      ? h('div', { class: 'list' }, [...hist].reverse().map(({ date, entry, session }) => {
          const best = Math.max(...doneSets(entry).map((s) => e1rm(s.weight, s.reps)));
          return h('button', { class: 'row', onClick: () => go('session', { id: session.id }) },
            h('span', { class: 'grow' },
              h('div', { class: 'title' }, `${formatSets(entry)} lb`),
              h('div', { class: 'meta' }, `${formatLong(date)} · e1RM ${fmt(best)} lb`)),
            entry.target?.deload ? h('span', { class: 'chip warn' }, 'Deload') : null,
            icon('chev'));
        }))
      : h('p', { class: 'list-note' }, 'No sessions logged yet.'));
}

function strengthChart(id) {
  const pts = strengthPoints(id);
  if (pts.length < 2) return null;
  return h('section', { class: 'card' },
    h('div', { class: 'card-title', style: { marginBottom: '8px' } }, 'Progress'),
    lineChart({
      start: pts[0].x, end: pts[pts.length - 1].x, fmt: (v) => `${fmt(v)} lb`, axisFmt: (v) => fmt(v),
      series: [
        { points: pts.map((p) => ({ x: p.x, y: p.e1rm })), color: 'var(--accent)', dots: true, width: 2.5 },
        { points: pts.map((p) => ({ x: p.x, y: p.top })), color: 'var(--good)', dots: true, width: 2 },
      ],
    }),
    h('div', { class: 'legend' },
      h('span', null, h('i', { style: { background: 'var(--accent)' } }), 'Est. 1RM'),
      h('span', null, h('i', { style: { background: 'var(--good)' } }), 'Top set weight')));
}

const prTile = (label, value, unitText, sub) => h('div', { class: 'card tile' },
  h('div', { class: 'card-title' }, icon('trophy'), label),
  h('div', { class: 'big' }, value, unitText ? h('span', { class: 'unit' }, unitText) : null),
  h('div', { class: 'sub' }, sub ? (sub.length === 10 && sub[4] === '-' ? formatLong(sub) : sub) : 'No data yet'));

function editExercise(ex) {
  openForm({
    title: 'Edit exercise',
    fields: [
      { key: 'name', label: 'Name', type: 'text', value: ex.name },
      { key: 'increment', label: `Weight step in lb (blank = ${ex.region} body default)`, type: 'number', value: ex.increment, optional: true, decimals: true },
    ],
    onSave: ({ name, increment }) => updateSettings((s) => {
      const e = s.exercises.find((x) => x.id === ex.id);
      e.name = name;
      e.increment = increment || null;
    }),
  });
}
