// Minimal DOM builder: h('div', { class: 'card', onClick: fn }, child, ...)
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  appendAll(el, children);
  return el;
}

// Append children to an existing element, skipping null/false (like h()).
export function mount(el, ...children) {
  appendAll(el, children);
}

function appendAll(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const fmt = (n, digits = 0) =>
  Number(n).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });

// Light haptic tick where supported (no-op on iOS Safari, harmless).
export function tick() {
  if (navigator.vibrate) navigator.vibrate(8);
}

// Animate a CSS property from its previous rendered value to a new one.
// Views re-render from scratch, so we remember the last value per key.
const lastValues = new Map();
export function animateProp(el, prop, key, value) {
  const from = lastValues.get(key);
  lastValues.set(key, value);
  if (from === undefined || from === value) {
    el.style[prop] = value;
    return;
  }
  el.style[prop] = from;
  requestAnimationFrame(() => requestAnimationFrame(() => { el.style[prop] = value; }));
}
