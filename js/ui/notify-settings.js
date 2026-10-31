// Settings → Notifications: connect to your Cloudflare Worker, turn reminders
// on, choose what to be reminded about and when, and send a test.
import { h } from './dom.js';
import { icon } from './icons.js';
import { valueRow } from './components.js';
import { openForm, openActions, openConfirm, toast } from './sheet.js';
import { state, updateSettings } from '../store/state.js';
import * as push from '../notify/push.js';

const TYPES = [['water', 'Water goal'], ['supplements', 'Supplements'], ['workout', 'Workouts & runs']];

export function formatTime(t) {
  const [hh, mm] = t.split(':').map(Number);
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
}

const label = (title) => h('div', { class: 'section-label' }, title);
const list = (...rows) => h('div', { class: 'list' }, rows);
const note = (text, warn) => h('p', { class: 'list-note', style: warn ? { color: 'var(--warn)' } : null }, text);

function toggle(text, on, onChange, disabled = false) {
  return h('button', { class: 'row', role: 'switch', 'aria-checked': String(on), disabled: disabled || null, onClick: () => onChange(!on) },
    h('span', { class: 'grow' }, text), h('span', { class: 'switch' + (on ? ' on' : '') }));
}

// Settings changes that affect reminders are pushed to the Worker right away.
const changePrefs = (fn) => updateSettings((s) => fn(s.notifications)).then(() => push.scheduleSync(300));

export function notificationsSection() {
  const n = state.settings.notifications;
  const supported = push.isSupported();
  const installed = push.isInstalled();
  const configured = push.isConfigured();

  let status = null;
  if (!installed) status = note('Open the app from your Home Screen to turn on notifications (needs iOS 16.4 or later).', true);
  else if (!supported) status = note('This device doesn’t support web notifications. Update to iOS 16.4 or later.', true);
  else if (!configured) status = note('Set up your free Cloudflare Worker first (see the README), then add its URL and secret key here.');

  return [
    label('Notifications'),
    list(
      valueRow('Server URL', n.workerUrl ? new URL(n.workerUrl).host.split('.')[0] : 'Not set', editUrl),
      valueRow('Secret key', n.secret ? `••••${n.secret.slice(-4)}` : 'Not set', secretMenu),
      toggle('Lock-screen reminders', n.enabled, async (on) => {
        try {
          if (on) { await push.enable(); toast('Reminders on'); }
          else { await push.disable(); toast('Reminders off'); }
        } catch (e) { toast(e.message, { duration: 6000 }); }
      }, !configured || !supported)),
    status,

    label('Remind me about'),
    list(...TYPES.map(([key, text]) => toggle(text, n.types[key], (on) => changePrefs((x) => { x.types[key] = on; })))),
    note('You only get a notification if something is still behind at a check time.'),

    label('Check times'),
    list(
      ...[...n.times].sort().map((t) => valueRow(formatTime(t), '', () => editTime(t))),
      h('button', { class: 'row', style: { color: 'var(--accent)' }, onClick: () => editTime(null) }, icon('plus'), 'Add a time')),

    list(
      h('button', { class: 'row', disabled: !n.enabled || null, onClick: async () => {
        try { await push.syncNow(); await push.sendTest(); toast('Test sent. Check your lock screen.'); }
        catch (e) { toast(e.message, { duration: 6000 }); }
      } }, icon('flame'), h('span', { class: 'grow' }, 'Send test notification')),
      h('button', { class: 'row', disabled: !configured || null, onClick: async () => {
        try {
          const r = await push.checkServer();
          toast(r.kvBound && r.secretSet ? 'Server is set up correctly ✓' : `Server found, but ${!r.kvBound ? 'KV isn’t bound' : 'APP_SECRET isn’t set'}`, { duration: 5000 });
        } catch { toast('Can’t reach the server. Check the URL.', { duration: 5000 }); }
      } }, icon('check'), h('span', { class: 'grow' }, 'Check server connection'))),
    push.lastSyncAt ? note(`Last synced ${new Date(push.lastSyncAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.`) : null,
  ];
}

function editUrl() {
  openForm({
    title: 'Server URL',
    fields: [{ key: 'url', label: 'Your Worker URL', type: 'text', value: state.settings.notifications.workerUrl, placeholder: 'https://fitness-push.you.workers.dev' }],
    onSave: ({ url }) => {
      let clean = url.trim();
      if (!/^https?:\/\//.test(clean)) clean = 'https://' + clean;
      try { new URL(clean); } catch { return toast('That doesn’t look like a URL'); }
      updateSettings((s) => { s.notifications.workerUrl = clean.replace(/\/+$/, ''); });
    },
  });
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Secret key copied'); }
  catch { openForm({ title: 'Secret key', fields: [{ key: 'k', label: 'Select and copy', type: 'text', value: text }], saveLabel: 'Done', onSave: () => {} }); }
}

function secretMenu() {
  const n = state.settings.notifications;
  const generate = () => {
    const secret = push.generateSecret();
    updateSettings((s) => { s.notifications.secret = secret; });
    copy(secret);
  };
  openActions({
    title: 'Secret key',
    note: 'The same key goes into Cloudflare as a secret named APP_SECRET. It stops anyone else using your server.',
    actions: [
      n.secret ? { label: 'Copy key', icon: 'check', onClick: () => copy(n.secret) } : null,
      { label: n.secret ? 'Generate a new key' : 'Generate key', sub: 'Creates a random key and copies it', icon: 'plus',
        onClick: () => (n.secret
          ? openConfirm({ title: 'Replace the key?', message: 'You’ll need to paste the new key into Cloudflare too.', confirmLabel: 'Replace', onConfirm: generate })
          : generate()) },
      { label: 'Enter a key', icon: 'edit', onClick: () => openForm({
          title: 'Secret key',
          fields: [{ key: 'k', label: 'Key', type: 'text', value: n.secret }],
          onSave: ({ k }) => updateSettings((s) => { s.notifications.secret = k.trim(); }),
        }) },
    ].filter(Boolean),
  });
}

function editTime(t) {
  openForm({
    title: t ? 'Check time' : 'Add check time',
    fields: [{ key: 'time', label: 'Time', type: 'time', value: t || '20:00' }],
    onSave: ({ time }) => {
      if (!/^\d{2}:\d{2}$/.test(time)) return toast('Pick a time');
      changePrefs((x) => { x.times = [...new Set([...x.times.filter((v) => v !== t), time])].sort(); });
    },
    onDelete: t ? () => changePrefs((x) => { x.times = x.times.filter((v) => v !== t); }) : null,
  });
}
