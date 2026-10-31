// Tab navigation. Each view is a function that fills the #view element.
// Sub-views (workout logger, plan editor, exercise history) aren't tabs:
// they highlight their parent tab and receive params.
import { h } from './dom.js';
import { icon } from './icons.js';

const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'workouts', label: 'Workouts' },
  { id: 'food', label: 'Food' },
  { id: 'progress', label: 'Progress' },
  { id: 'settings', label: 'Settings' },
];

const views = {}; // id -> { render, tab }
let current = 'today';
let params = {};

export function registerView(id, render, tab = id) {
  views[id] = { render, tab };
}

export function go(id, p = {}) {
  if (!views[id]) return;
  current = id;
  params = p;
  render(true);
}

export function render(enter = false) {
  const root = document.getElementById('view');
  const y = window.scrollY;
  root.replaceChildren();
  views[current].render(root, params);
  if (enter) {
    root.classList.remove('enter');
    void root.offsetWidth; // restart the animation
    root.classList.add('enter');
    window.scrollTo(0, 0);
  } else {
    window.scrollTo(0, y);
  }
  paintTabbar();
}

// Back button for sub-views.
export function backButton(label, to, p) {
  return h('button', { class: 'back-btn', onClick: () => go(to, p) }, icon('back'), label);
}

function paintTabbar() {
  // A sub-view opened from another tab (e.g. exercise from Progress) keeps that tab lit
  const active = (params.back && views[params.back.to]?.tab) || views[current].tab;
  const bar = document.getElementById('tabbar');
  bar.replaceChildren(...TABS.map((t) =>
    h('button', {
      class: 'tab' + (t.id === active ? ' active' : ''),
      'aria-current': t.id === active ? 'page' : null,
      onClick: () => (t.id === current ? window.scrollTo({ top: 0, behavior: 'smooth' }) : go(t.id)),
    }, icon(t.id), t.label)
  ));
}
