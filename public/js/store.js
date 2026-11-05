// Stato dell'applicazione e salvataggio automatico.
//
// Ogni modifica locale diventa una piccola JSON merge patch (solo i campi toccati),
// accumulata in `pending` e inviata dopo 800 ms di pausa. Quando arriva un
// aggiornamento dal server (risposta o evento SSE), il documento locale diventa
//   server ⊕ inflight ⊕ pending
// così le modifiche non ancora confermate non vengono perse.

import { api } from './api.js';
import { mergePatch, patchFromPath, clone } from './merge.js';

const DEBOUNCE_MS = 800;
const K_GROUP = 'cantiere.gruppo';

export const state = {
  config: { ai: false, settori: [], badges: [], docente: false },
  groups: new Map(), // id → gruppo (copia del server)
  board: new Map(), // group_id → { punti, badges }
  activeId: (() => { try { return localStorage.getItem(K_GROUP) || ''; } catch { return ''; } })(),
  doc: null, // documento del gruppo attivo, con le modifiche locali
  status: 'saved', // saved | pending | error
};

let pending = {};
let inflight = null;
let timer = null;
const listeners = new Set();

/** Registra un ascoltatore: fn({ source: 'local' | 'remote' | 'status' | 'groups' | 'board' }). */
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(source) { for (const fn of listeners) fn({ source }); }

const isEmpty = (o) => !o || Object.keys(o).length === 0;
function setStatus(s) { if (state.status !== s) { state.status = s; emit('status'); } }

export const activeGroup = () => state.groups.get(state.activeId) || null;

export function setActive(id) {
  if (id === state.activeId && state.doc) return;
  flushNow();
  pending = {}; inflight = null;
  state.activeId = id || '';
  try { id ? localStorage.setItem(K_GROUP, id) : localStorage.removeItem(K_GROUP); } catch { /* ignore */ }
  const g = activeGroup();
  state.doc = g ? clone(g.data) : null;
  emit('remote');
}

/** Legge un valore dal documento attivo; path è un array o una stringa con punti. */
export function get(path) {
  const parts = Array.isArray(path) ? path : path.split('.');
  return parts.reduce((o, k) => (o == null ? undefined : o[k]), state.doc);
}

/** Imposta un valore nel documento attivo e programma il salvataggio. */
export function set(path, value) {
  if (!state.doc) return;
  const parts = Array.isArray(path) ? path : path.split('.');
  const patch = patchFromPath(parts, value);
  state.doc = mergePatch(state.doc, patch);
  pending = mergePatch(pending, patch);
  schedule();
  emit('local');
}

/** Applica più modifiche insieme (es. riordino: due `ord` scambiati). */
export function setMany(entries) {
  if (!state.doc) return;
  for (const [path, value] of entries) {
    const patch = patchFromPath(Array.isArray(path) ? path : path.split('.'), value);
    state.doc = mergePatch(state.doc, patch);
    pending = mergePatch(pending, patch);
  }
  schedule();
  emit('local');
}

function schedule() {
  setStatus('pending');
  clearTimeout(timer);
  timer = setTimeout(flush, DEBOUNCE_MS);
}

async function flush() {
  clearTimeout(timer);
  if (inflight) return; // si riprova al termine dell'invio in corso
  if (isEmpty(pending) || !state.activeId) { if (!inflight) setStatus('saved'); return; }
  const id = state.activeId;
  inflight = pending;
  pending = {};
  try {
    const g = await api.patchGroup(id, { data: inflight });
    inflight = null;
    receiveGroup(g);
    if (isEmpty(pending)) setStatus('saved'); else schedule();
  } catch (e) {
    console.warn('Salvataggio non riuscito:', e.message);
    if (id === state.activeId) pending = mergePatch(inflight, pending);
    inflight = null;
    setStatus('error');
    timer = setTimeout(flush, 3000); // nuovo tentativo
  }
}

/** Invio immediato (cambio gruppo, chiusura della pagina). */
export function flushNow() {
  if (isEmpty(pending) || !state.activeId) return;
  const body = { data: mergePatch(inflight || {}, pending) };
  api.patchGroup(state.activeId, body, { keepalive: true }).catch(() => {});
  pending = {};
}

/** Un gruppo aggiornato arriva dal server (risposta a una PATCH o evento SSE). */
export function receiveGroup(g) {
  state.groups.set(g.id, g);
  if (g.id === state.activeId) {
    const before = JSON.stringify(state.doc);
    state.doc = mergePatch(mergePatch(clone(g.data), inflight || {}), pending);
    if (JSON.stringify(state.doc) !== before) emit('remote');
  }
  emit('groups');
}

export function removeGroup(id) {
  state.groups.delete(id);
  if (id === state.activeId) setActive('');
  emit('groups');
}

export function receiveBoard(b) { state.board.set(b.group_id, b); emit('board'); }

export async function loadAll() {
  const [config, groups, board] = await Promise.all([api.config(), api.groups(), api.board()]);
  state.config = config;
  state.groups = new Map(groups.map((g) => [g.id, g]));
  state.board = new Map(board.map((b) => [b.group_id, b]));
  if (!state.groups.has(state.activeId)) state.activeId = '';
  const g = activeGroup();
  state.doc = g ? mergePatch(clone(g.data), pending) : null;
  emit('remote');
  emit('groups');
}

window.addEventListener('pagehide', flushNow);
