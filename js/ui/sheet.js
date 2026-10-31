// Bottom sheets (iOS-style modals), the number keypad, simple forms, and toasts.
import { h, tick } from './dom.js';
import { icon } from './icons.js';

const root = () => document.getElementById('overlay-root');

// ---------- Generic sheet ----------

export function openSheet(title, content, { headRight } = {}) {
  document.querySelectorAll('.toast').forEach((t) => t.remove()); // don't cover the sheet
  const backdrop = h('div', { class: 'backdrop' });
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-label': title },
    h('div', { class: 'grabber' }),
    h('div', { class: 'sheet-head' }, h('h2', null, title), headRight || null),
    content
  );

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    // Ignore taps while animating out (prevents a double-tap saving twice)
    sheet.style.pointerEvents = backdrop.style.pointerEvents = 'none';
    unfit();
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    setTimeout(() => { sheet.remove(); backdrop.remove(); }, 320);
  };
  backdrop.addEventListener('click', close);
  enableSwipeDown(sheet, close);
  const unfit = keepAboveKeyboard(sheet);

  root().append(backdrop, sheet);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    backdrop.classList.add('open');
    sheet.classList.add('open');
  }));
  return close;
}

// iOS keyboards cover fixed elements: lift the sheet by the keyboard's height.
function keepAboveKeyboard(sheet) {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  const fit = () => {
    const keyboard = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    sheet.style.bottom = `${keyboard}px`;
    sheet.style.maxHeight = `${vv.height - 12}px`;
  };
  vv.addEventListener('resize', fit);
  vv.addEventListener('scroll', fit);
  return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); };
}

// Drag the sheet down from its top area to dismiss.
function enableSwipeDown(sheet, close) {
  let startY = null, dy = 0;
  sheet.addEventListener('touchstart', (e) => {
    if (sheet.scrollTop > 0 || e.touches[0].clientY - sheet.getBoundingClientRect().top > 70) return;
    startY = e.touches[0].clientY;
    sheet.style.transition = 'none';
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', () => {
    if (startY == null) return;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy > 90) close();
    startY = null; dy = 0;
  });
}

// ---------- Number keypad sheet ----------
// fields: [{ key, label, value, unit, decimals (0|1), max }]
// onSave(values) receives numbers keyed by field key. onClear removes an entry.
export function openKeypad({ title, fields, hint, onSave, onClear, presets }) {
  const strs = fields.map((f) => (f.value == null ? '' : String(f.value)));
  const fresh = fields.map(() => true); // first keypress replaces a prefilled value
  let active = 0;

  const fieldEls = fields.map((f, i) =>
    h('button', { class: 'kp-field', onClick: () => { active = i; paint(); } },
      h('span', { class: 'l' }, f.label),
      h('span', { class: 'v' })
    )
  );
  const hintEl = h('div', { class: 'kp-hint' }, hint || '');

  function paint() {
    fieldEls.forEach((el, i) => {
      el.classList.toggle('active', i === active);
      const v = el.querySelector('.v');
      v.className = 'v' + (strs[i] ? '' : ' ph');
      v.replaceChildren(strs[i] || '0', fields[i].unit ? h('span', { class: 'u' }, fields[i].unit) : '');
    });
  }

  function press(k) {
    tick();
    const f = fields[active];
    let s = fresh[active] ? '' : strs[active];
    fresh[active] = false;
    if (k === 'del') s = s.slice(0, -1);
    else if (k === '.') { if (f.decimals && !s.includes('.')) s = (s || '0') + '.'; }
    else {
      const next = s === '0' ? k : s + k;
      const [, dec] = next.split('.');
      if (dec && dec.length > (f.decimals || 0)) return;
      if (f.max != null && Number(next) > f.max) return;
      if (next.replace('.', '').length > 6) return;
      s = next;
    }
    strs[active] = s;
    paint();
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9',
    fields.some((f) => f.decimals) ? '.' : '', '0', 'del'];
  const keypad = h('div', { class: 'keypad' },
    keys.map((k) => k
      ? h('button', { class: 'key', onClick: () => press(k), 'aria-label': k === 'del' ? 'Delete' : k },
          k === 'del' ? icon('backspace') : k)
      : h('span', { class: 'key blank' }))
  );

  const presetRow = presets
    ? h('div', { class: 'chips' }, presets.map((p) =>
        h('button', { class: 'btn sm soft', onClick: () => {
          strs[active] = String(p); fresh[active] = false; paint();
        } }, p)))
    : null;

  let saved = false;
  const save = () => {
    if (saved) return;
    const out = {};
    for (let i = 0; i < fields.length; i++) {
      if (strs[i] === '' && !fields[i].optional) { active = i; paint(); hintEl.textContent = `Enter ${fields[i].label.toLowerCase()}`; return; }
      out[fields[i].key] = strs[i] === '' ? null : Number(strs[i]);
    }
    saved = true;
    onSave(out);
    close();
  };

  const content = h('div', null,
    h('div', { class: 'kp-fields' }, fieldEls),
    hintEl,
    presetRow,
    keypad,
    h('div', { class: 'actions' },
      onClear ? h('button', { class: 'btn danger', onClick: () => { onClear(); close(); } }, 'Clear') : null,
      h('button', { class: 'btn primary', onClick: save }, 'Save')
    )
  );
  const close = openSheet(title, content);
  paint();
  return close;
}

// ---------- Simple form sheet (for names + numbers) ----------
// fields: [{ key, label, type: 'text'|'number', value, placeholder, decimals }]
export function openForm({ title, fields, onSave, onDelete, saveLabel = 'Save', extra }) {
  const inputs = fields.map((f) =>
    h('input', {
      type: f.type === 'time' ? 'time' : 'text',
      inputmode: f.type === 'number' ? (f.decimals ? 'decimal' : 'numeric') : 'text',
      value: f.value ?? '',
      placeholder: f.placeholder || '',
      autocomplete: 'off',
      autocapitalize: f.type === 'number' ? 'off' : 'sentences',
    })
  );
  const errEl = h('div', { class: 'kp-hint' });

  let saved = false;
  const save = () => {
    if (saved) return;
    const out = {};
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const raw = inputs[i].value.trim();
      if (f.type === 'number') {
        const n = Number(raw.replace(',', '.'));
        if (raw === '' && f.optional) { out[f.key] = null; continue; }
        if (raw === '' || !Number.isFinite(n) || n < 0) { errEl.textContent = `Enter a number for ${f.label.toLowerCase()}`; inputs[i].focus(); return; }
        out[f.key] = n;
      } else {
        if (!raw && !f.optional) { errEl.textContent = `Enter ${f.label.toLowerCase()}`; inputs[i].focus(); return; }
        out[f.key] = raw;
      }
    }
    saved = true;
    onSave(out);
    close();
  };

  const content = h('form', { onSubmit: (e) => { e.preventDefault(); save(); } },
    fields.map((f, i) => h('div', { class: 'field' }, h('label', null, f.label), inputs[i])),
    extra || null,
    errEl,
    h('div', { class: 'actions' },
      onDelete ? h('button', { type: 'button', class: 'btn danger', onClick: () => { onDelete(); close(); } }, 'Delete') : null,
      h('button', { type: 'submit', class: 'btn primary' }, saveLabel)
    )
  );
  const close = openSheet(title, content);
  if (!fields[0].value) inputs[0].focus({ preventScroll: true }); // new entries: bring up the keyboard right away
  return close;
}

// ---------- Toast ----------

let toastTimer;
export function toast(message, { action, onAction, duration = 3200 } = {}) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  clearTimeout(toastTimer);
  const el = h('div', { class: 'toast', role: 'status' },
    h('span', null, message),
    action ? h('button', { onClick: () => { onAction(); hide(); } }, action) : null
  );
  const hide = () => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  };
  root().append(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  toastTimer = setTimeout(hide, duration);
}

// ---------- Action list & confirm ----------
// actions: [{ label, sub, icon, danger, onClick }]
export function openActions({ title, actions, note }) {
  let close;
  const content = h('div', null,
    note ? h('p', { class: 'small muted', style: { margin: '-6px 4px 12px' } }, note) : null,
    h('div', { class: 'list' }, actions.map((a) =>
      h('button', { class: 'row' + (a.danger ? ' danger-row' : ''), disabled: a.disabled || null, onClick: () => { close(); a.onClick(); } },
        a.icon ? icon(a.icon) : null,
        h('span', { class: 'grow' }, h('div', null, a.label), a.sub ? h('div', { class: 'meta' }, a.sub) : null)))));
  close = openSheet(title, content);
  return close;
}

export function openConfirm({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm }) {
  let close;
  const content = h('div', null,
    h('p', { class: 'muted', style: { margin: '0 4px' } }, message),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onClick: () => close() }, 'Cancel'),
      h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onClick: () => { close(); onConfirm(); } }, confirmLabel)));
  close = openSheet(title, content);
  return close;
}
