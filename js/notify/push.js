// Web Push client: subscribe this device with the Cloudflare Worker and keep
// the Worker's copy of today's summary up to date.
// iOS: works only in the installed Home Screen app, on iOS 16.4 or later.
import { state, subscribe as onStateChange, updateSettings } from '../store/state.js';
import { buildSummary } from './summary.js';

const cfg = () => state.settings.notifications;

export const isSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isConfigured = () => !!(cfg().workerUrl && cfg().secret);

// Random secret shared with the Worker (paste it into Cloudflare as APP_SECRET).
export function generateSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function api(path, body) {
  const base = cfg().workerUrl.replace(/\/+$/, '');
  const res = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-App-Secret': cfg().secret },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.detail || `Server error ${res.status}`);
  return data;
}

const toBytes = (b64u) => {
  const s = b64u.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
};
const sameKey = (buf, bytes) => buf && new Uint8Array(buf).every((b, i) => b === bytes[i]) && buf.byteLength === bytes.length;

// Ask permission, subscribe, register with the Worker. Must run from a tap.
export async function enable() {
  if (!isSupported()) throw new Error('Notifications aren’t supported here. Open the app from your Home Screen (iOS 16.4+).');
  if (!isConfigured()) throw new Error('Add the server URL and secret key first.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them in iPhone Settings → Notifications → Fitness.');

  const { key } = await api('/vapid-public-key');
  const serverKey = toBytes(key);
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options.applicationServerKey, serverKey)) { await sub.unsubscribe(); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey });

  await updateSettings((s) => { s.notifications.enabled = true; });
  await api('/subscribe', { subscription: sub.toJSON(), summary: buildSummary() });
  remember(buildSummary());
}

export async function disable() {
  await updateSettings((s) => { s.notifications.enabled = false; });
  try {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    await sub?.unsubscribe();
    if (isConfigured()) await api('/unsubscribe', {});
  } catch { /* offline: the Worker also stops once prefs.enabled is false */ }
}

export const sendTest = () => api('/test', {});
export const checkServer = () => api('/');

// ---------- Summary sync ----------

let lastSent = null;
let timer = null;
export let lastSyncAt = null;

function remember(summary) {
  lastSent = JSON.stringify(summary);
  lastSyncAt = Date.now();
}

// Send the summary if it changed (debounced, so a burst of taps is one request).
export function scheduleSync(delay = 4000) {
  if (!isConfigured() || (!cfg().enabled && lastSent === null)) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, delay);
}

export async function syncNow() {
  if (!isConfigured() || !navigator.onLine) return;
  const summary = buildSummary();
  const body = JSON.stringify(summary);
  if (body === lastSent) return;
  try {
    await api('/summary', summary);
    remember(summary);
  } catch (e) {
    console.warn('Summary sync failed', e.message);
  }
}

// Called once at startup.
export function startSync() {
  onStateChange(() => scheduleSync());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && scheduleSync(500));
  window.addEventListener('online', () => scheduleSync(500));
  scheduleSync(1500);
}
