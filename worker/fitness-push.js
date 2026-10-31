// fitness-push: Cloudflare Worker that sends the Fitness app's lock-screen reminders.
//
// Paste this whole file into the Cloudflare dashboard editor. It needs:
//   - a KV namespace bound as PUSH_KV
//   - a secret named APP_SECRET (the same key shown in the app's Settings)
//   - a cron trigger: */15 * * * *
//
// The app sends a small daily summary (water, supplements, workout, streaks,
// your check times). Every 15 minutes this Worker checks whether one of your
// check times has arrived and, only if something is behind, sends a push.
// VAPID keys are generated automatically on first use and kept in KV.

const SUBJECT = 'https://iainhbrown.github.io/fitness-app/'; // identifies the sender to Apple
const CHECK_WINDOW_MIN = 45; // a check time counts as "due" for this long (cron can run late)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-App-Secret',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      return await route(request, env);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runChecks(env));
  },
};

// ---------- HTTP API ----------

async function route(request, env) {
  const { pathname } = new URL(request.url);

  if (request.method === 'GET' && pathname === '/') {
    // Health check: open the Worker URL in a browser to see this
    return json({ ok: true, app: 'fitness-push', kvBound: !!env.PUSH_KV, secretSet: !!env.APP_SECRET });
  }
  if (!env.PUSH_KV) return json({ error: 'KV namespace not bound. Add a KV binding named PUSH_KV.' }, 500);

  if (request.method === 'GET' && pathname === '/vapid-public-key') {
    return json({ key: (await getVapid(env)).publicKey });
  }

  if (request.method !== 'POST') return json({ error: 'Not found' }, 404);
  if (!env.APP_SECRET) return json({ error: 'Secret not set. Add a secret named APP_SECRET.' }, 500);
  if (!safeEqual(request.headers.get('X-App-Secret') || '', env.APP_SECRET)) return json({ error: 'Wrong secret key' }, 401);

  const body = await request.json().catch(() => ({}));
  const state = await getState(env);

  switch (pathname) {
    case '/subscribe':
      if (!body.subscription?.endpoint || !body.subscription?.keys) return json({ error: 'Missing subscription' }, 400);
      state.subscription = body.subscription;
      if (body.summary) state.summary = body.summary;
      await putState(env, state);
      return json({ ok: true });

    case '/unsubscribe':
      state.subscription = null;
      await putState(env, state);
      return json({ ok: true });

    case '/summary':
      state.summary = body;
      await putState(env, state);
      return json({ ok: true });

    case '/test': {
      if (!state.subscription) return json({ error: 'No device subscribed yet' }, 400);
      const times = (state.summary?.prefs?.times || []).map(formatTime).join(', ');
      const res = await sendPush(env, state.subscription, {
        title: '✅ Notifications are working',
        body: times ? `Check-ins at ${times}. You’ll only hear from me if something’s behind.` : 'All set.',
        tag: 'test',
      });
      if (res.status === 404 || res.status === 410) {
        state.subscription = null;
        await putState(env, state);
      }
      return json({ ok: res.ok, status: res.status, detail: res.ok ? undefined : await res.text() }, res.ok ? 200 : 502);
    }
  }
  return json({ error: 'Not found' }, 404);
}

// ---------- Scheduled checks ----------

async function runChecks(env) {
  const state = await getState(env);
  const s = state.summary;
  if (!state.subscription || !s?.prefs?.enabled) return;

  const { date, minutes } = localNow(s.tz || 'UTC');
  const sentToday = state.sent?.[date] || [];
  const due = (s.prefs.times || []).filter((t) => {
    const m = toMinutes(t);
    return minutes >= m && minutes < m + CHECK_WINDOW_MIN && !sentToday.includes(t);
  });
  if (!due.length) return;

  state.sent = { [date]: [...sentToday, ...due] }; // only today's record is kept
  await putState(env, state);

  const message = buildMessage(s, date);
  if (!message) return; // nothing behind: stay quiet
  const res = await sendPush(env, state.subscription, message);
  if (res.status === 404 || res.status === 410) { // subscription expired
    state.subscription = null;
    await putState(env, state);
  }
}

// What's still left today, judged from the latest summary. If the app
// hasn't been opened today, today's progress is treated as zero.
function buildMessage(s, date) {
  const fresh = s.date === date;
  const day = (s.days || []).find((d) => d.date === date) || {};
  const types = s.prefs.types || {};
  const items = [];

  if (types.water && s.water) {
    const goal = fresh ? s.water.goal : day.waterGoal ?? s.water.goal;
    const left = goal - (fresh ? s.water.total : 0);
    if (left > 0) items.push({ icon: '💧', text: `${formatMl(left)} water left`, streak: s.streaks?.water });
  }
  if (types.supplements && s.supplements) {
    const missing = fresh ? s.supplements.missing : s.supplements.all;
    if (missing?.length) {
      items.push({ icon: '💊', text: missing.length <= 2 ? `${missing.join(' & ')} not taken` : `${missing.length} supplements not taken`, streak: s.streaks?.supplements });
    }
  }
  if (types.workout) {
    if (day.lift && !(fresh && s.today?.liftDone)) items.push({ icon: '🏋️', text: `${day.lift} workout not logged`, streak: s.streaks?.workout });
    if (day.run && !(fresh && s.today?.runDone)) items.push({ icon: '🏃', text: 'Run not logged', streak: s.streaks?.workout });
  }
  if (!items.length) return null;

  const stake = (it) => (it.streak?.count > 0 ? `${it.streak.count}-day streak at stake` : null);
  if (items.length === 1) {
    const it = items[0];
    return { title: `${it.icon} ${it.text}`, body: stake(it) || 'Still time today.', tag: 'checkin' };
  }
  return {
    title: `${items.length} things left today`,
    body: items.map((it) => `${it.icon} ${it.text}${stake(it) ? ` (${stake(it)})` : ''}`).join('\n'),
    tag: 'checkin',
  };
}

// ---------- Web Push (RFC 8291 encryption + RFC 8292 VAPID) ----------

const te = new TextEncoder();

const b64u = {
  enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (str) => {
    const s = str.replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
  },
};

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}

async function getVapid(env) {
  let vapid = await env.PUSH_KV.get('vapid', 'json');
  if (!vapid) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    vapid = {
      jwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
      publicKey: b64u.enc(await crypto.subtle.exportKey('raw', pair.publicKey)),
    };
    await env.PUSH_KV.put('vapid', JSON.stringify(vapid));
  }
  return vapid;
}

async function vapidAuth(endpoint, vapid) {
  const header = b64u.enc(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u.enc(te.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: SUBJECT,
  })));
  const key = await crypto.subtle.importKey('jwk', vapid.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64u.enc(sig)}, k=${vapid.publicKey}`;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

// aes128gcm content encoding. `fixed` (salt + sender key pair) is only for tests.
async function encryptPayload(subscription, plaintext, fixed = null) {
  const uaPublic = b64u.dec(subscription.keys.p256dh);
  const authSecret = b64u.dec(subscription.keys.auth);
  const salt = fixed?.salt || crypto.getRandomValues(new Uint8Array(16));
  const asKeys = fixed?.asKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));

  const ikm = await hkdf(authSecret, ecdhSecret, concat(te.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const record = concat(te.encode(plaintext), new Uint8Array([2])); // 0x02 = last record, no padding
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, record));

  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096); // record size
  header[20] = asPublic.length;
  return concat(header, asPublic, ciphertext);
}

async function sendPush(env, subscription, message) {
  const vapid = await getVapid(env);
  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '3600',
      Urgency: 'normal',
      Authorization: await vapidAuth(subscription.endpoint, vapid),
    },
    body: await encryptPayload(subscription, JSON.stringify(message)),
  });
}

// ---------- Helpers ----------

const getState = async (env) => (await env.PUSH_KV.get('state', 'json')) || { subscription: null, summary: null, sent: {} };
const putState = (env, state) => env.PUSH_KV.put('state', JSON.stringify(state));

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Local date (YYYY-MM-DD) and minutes since midnight in the user's time zone.
function localNow(timeZone, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const toMinutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const formatMl = (ml) => (ml >= 1000 ? `${(ml / 1000).toFixed(2).replace(/\.?0+$/, '')} L` : `${Math.round(ml)} ml`);
function formatTime(t) {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
