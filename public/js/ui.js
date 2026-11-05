// Piccoli helper per costruire il DOM e legare i campi al documento.
//
// Ogni campo ha un attributo data-path (es. "personas.p_ab12.nome"). Quando
// arriva un aggiornamento remoto, refreshBindings() aggiorna i valori di tutti i
// campi tranne quello in cui l'utente sta scrivendo.

import * as store from './store.js';
import { filled } from './model.js';

/** Crea un elemento: h('div', { class: 'x', onclick: fn }, 'testo', figlio, ...). */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Le textarea crescono con il contenuto. */
export function autoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 2 + 'px';
}

const pathStr = (p) => (Array.isArray(p) ? p.join('.') : p);

/**
 * Campo di testo legato al documento.
 * opts: label, ph, multiline (default true), mono, rows, hint, type, cls
 */
export function field(path, opts = {}) {
  const p = pathStr(path);
  const multiline = opts.multiline !== false && opts.type !== 'number';
  const value = store.get(p);
  let input;
  if (multiline) {
    input = h('textarea', { rows: opts.rows || 2, placeholder: opts.ph || '', class: opts.mono ? 'mono' : null, dataset: { path: p } });
    input.value = value ?? '';
    input.addEventListener('input', () => { autoGrow(input); store.set(p, input.value); });
    requestAnimationFrame(() => autoGrow(input));
  } else {
    input = h('input', { type: opts.type || 'text', placeholder: opts.ph || '', dataset: { path: p, kind: opts.type || 'text' } });
    if (opts.type === 'number') Object.assign(input, { min: opts.min ?? 0, max: opts.max ?? 999, step: opts.step ?? 1 });
    input.value = value ?? '';
    input.addEventListener('input', () => store.set(p, opts.type === 'number' ? (input.value === '' ? '' : Number(input.value)) : input.value));
  }
  if (opts.label === undefined) return input;
  return wrap(p, opts, input);
}

/** Menu a tendina; options è un oggetto {valore: etichetta} o una funzione che lo restituisce. */
export function select(path, options, opts = {}) {
  const p = pathStr(path);
  const sel = h('select', { dataset: { path: p } });
  sel._opts = typeof options === 'function' ? options : () => options;
  sel._empty = opts.empty ?? '— scegli —';
  fillOptions(sel);
  sel.value = store.get(p) ?? '';
  sel.addEventListener('change', () => { store.set(p, sel.value); opts.onchange?.(sel.value); });
  if (opts.label === undefined) return sel;
  return wrap(p, opts, sel);
}

function fillOptions(sel) {
  const entries = Object.entries(sel._opts());
  const sig = JSON.stringify(entries);
  if (sel._sig === sig) return;
  sel._sig = sig;
  const cur = sel.value;
  sel.replaceChildren(
    ...(sel._empty !== null ? [h('option', { value: '' }, sel._empty)] : []),
    ...entries.map(([v, l]) => h('option', { value: v }, l)),
  );
  sel.value = cur;
}

/** Casella di spunta (o "chip" con cls='chip-toggle'). */
export function checkbox(path, label, opts = {}) {
  const p = pathStr(path);
  const cb = h('input', { type: 'checkbox', dataset: { path: p } });
  cb.checked = Boolean(store.get(p));
  cb.addEventListener('change', () => { store.set(p, cb.checked); opts.onchange?.(cb.checked); });
  return h('label', { class: opts.cls || 'check' }, cb, h('span', {}, label));
}

/** Etichetta + spunta verde quando il campo è compilato. */
function wrap(p, opts, input) {
  const done = filled(store.get(p));
  return h('div', { class: `field ${opts.cls || ''} ${done ? 'done' : ''}`, dataset: { fieldFor: p } },
    h('label', {}, h('span', { class: 'tick', 'aria-hidden': 'true' }, '✓'), opts.label,
      opts.hint ? h('small', {}, ' · ' + opts.hint) : null),
    input);
}

/** Aggiorna valori, spunte e opzioni dei menu dopo una modifica. */
export function refreshBindings(root = document) {
  const active = document.activeElement;
  root.querySelectorAll('[data-path]').forEach((el) => {
    if (el.tagName === 'SELECT') fillOptions(el);
    if (el === active) return;
    const v = store.get(el.dataset.path);
    if (el.type === 'checkbox') el.checked = Boolean(v);
    else if (String(el.value) !== String(v ?? '')) {
      el.value = v ?? '';
      if (el.tagName === 'TEXTAREA') autoGrow(el);
    }
  });
  root.querySelectorAll('[data-field-for]').forEach((w) => w.classList.toggle('done', filled(store.get(w.dataset.fieldFor))));
}

// ---- Blocchi "vivi": avvisi, contatori, verifiche ricalcolati a ogni modifica
let liveBlocks = [];
/** Valore che una funzione di live() può restituire per lasciare il blocco com'è. */
export const KEEP = Symbol('keep');
export function live(fn, cls = '') {
  const el = h('div', { class: 'live ' + cls });
  const update = () => {
    const out = fn();
    if (out !== KEEP) el.replaceChildren(...[out].flat().filter(Boolean));
  };
  liveBlocks.push(update);
  update();
  return el;
}
export function resetLive() { liveBlocks = []; }
export function refreshLive() { liveBlocks.forEach((u) => u()); }

/** Avvisi (rossi) o messaggio "tutto a posto". */
export function warnings(list, okText) {
  if (!list.length) return okText ? h('div', { class: 'notice ok' }, '✓ ', okText) : null;
  return h('div', { class: 'notice warn' }, h('ul', {}, list.map((w) => h('li', {}, w))));
}

export function progressBar(pct) {
  return h('div', { class: 'bar' + (pct === 100 ? ' full' : ''), role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 },
    h('span', { style: `width:${pct}%` }));
}

/** Messaggio temporaneo in basso. */
export function toast(msg, kind = '') {
  document.querySelectorAll('.toast').forEach((x) => x.remove()); // un messaggio alla volta
  const t = h('div', { class: 'toast ' + kind, role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}

/** Finestra modale con un modulo; risolve con i valori o null. */
export function dialog({ title, body, fields = [], ok = 'Conferma', cancel = 'Annulla' }) {
  return new Promise((resolve) => {
    const inputs = fields.map((f) => {
      const el = f.options
        ? h('select', {}, h('option', { value: '' }, '— scegli —'), Object.entries(f.options).map(([v, l]) => h('option', { value: v }, l)))
        : f.multiline ? h('textarea', { rows: 3, placeholder: f.ph || '' }) : h('input', { type: f.type || 'text', placeholder: f.ph || '', autocomplete: 'off' });
      el.value = f.value || '';
      return [f.key, el, f];
    });
    const close = (val) => { dlg.close(); dlg.remove(); resolve(val); };
    const form = h('form', { method: 'dialog', onsubmit: (e) => {
      e.preventDefault();
      const val = Object.fromEntries(inputs.map(([k, el]) => [k, el.value]));
      if (inputs.some(([, el, f]) => f.required && !el.value.trim())) return;
      close(val);
    } },
    h('h2', {}, title),
    body ? h('p', {}, body) : null,
    inputs.map(([, el, f]) => h('label', { class: 'dlg-field' }, f.label, el)),
    h('div', { class: 'dlg-actions' },
      cancel ? h('button', { type: 'button', class: 'btn ghost', onclick: () => close(null) }, cancel) : null,
      h('button', { type: 'submit', class: 'btn primary' }, ok)));
    const dlg = h('dialog', { class: 'dlg', oncancel: (e) => { e.preventDefault(); if (cancel) close(null); } }, form);
    document.body.append(dlg);
    dlg.showModal();
    inputs[0]?.[1].focus();
  });
}
