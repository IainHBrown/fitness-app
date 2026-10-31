// App entry: load data, wire up tabs, re-render on changes,
// and roll over to a fresh day at local midnight.
import { requestPersistence } from './db.js';
import { loadState, subscribe } from './store/state.js';
import { todayKey } from './dates.js';
import { registerView, render, go } from './ui/router.js';
import { renderToday } from './ui/today.js';
import { renderWorkouts } from './ui/workouts.js';
import { renderFood } from './ui/food.js';
import { renderProgress } from './ui/progress.js';
import { renderSettings } from './ui/settings.js';
import { renderSession } from './ui/session.js';
import { renderPlanDay } from './ui/planday.js';
import { renderExercise } from './ui/exercise.js';
import { toast } from './ui/sheet.js';
import { startSync } from './notify/push.js';

registerView('today', renderToday);
registerView('workouts', renderWorkouts);
registerView('food', renderFood);
registerView('progress', renderProgress);
registerView('settings', renderSettings);
// Sub-views (highlight the Workouts tab)
registerView('session', renderSession, 'workouts');
registerView('planday', renderPlanDay, 'workouts');
registerView('exercise', renderExercise, 'workouts');

async function start() {
  requestPersistence();
  await loadState();
  subscribe(() => render());
  go('today');
  watchMidnight();
  startSync(); // keeps the notification Worker's summary current (if set up)

  if ('serviceWorker' in navigator) {
    // A new version took over (not the very first install): offer a reload.
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) toast('App updated', { action: 'Reload', onAction: () => location.reload(), duration: 10000 });
    });
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e));
  }
}

// Daily reset: each date has its own record, so a new day simply means
// re-rendering against the new date. Checked on a timer and when the app
// comes back to the foreground (iOS suspends timers in the background).
function watchMidnight() {
  let current = todayKey();
  const check = () => {
    if (todayKey() !== current) {
      current = todayKey();
      render();
    }
  };
  setInterval(check, 30000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
}

start();
