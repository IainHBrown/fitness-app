// Service worker: makes the app work fully offline.
// Strategy: stale-while-revalidate. Serve from cache instantly, refresh the
// cache in the background, so updates appear on the next launch.
// Bump VERSION whenever you want to force every cached file to be replaced.
const VERSION = 'v4';
const CACHE = `fitness-${VERSION}`;

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/theme.css',
  'css/app.css',
  'js/app.js',
  'js/db.js',
  'js/dates.js',
  'js/store/defaults.js',
  'js/store/state.js',
  'js/store/backup.js',
  'js/logic/schedule.js',
  'js/logic/streaks.js',
  'js/logic/food.js',
  'js/logic/history.js',
  'js/logic/overload.js',
  'js/logic/runs.js',
  'js/logic/training.js',
  'js/logic/stats.js',
  'js/ui/dom.js',
  'js/ui/icons.js',
  'js/ui/sheet.js',
  'js/ui/router.js',
  'js/ui/components.js',
  'js/ui/today.js',
  'js/ui/food.js',
  'js/ui/workouts.js',
  'js/ui/progress.js',
  'js/ui/settings.js',
  'js/ui/session.js',
  'js/ui/planday.js',
  'js/ui/exercise.js',
  'js/ui/picker.js',
  'js/ui/run-sheet.js',
  'js/ui/training-card.js',
  'js/ui/chart.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// Future stage: 'push' and 'notificationclick' handlers go here.
