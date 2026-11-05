// Punto di ingresso: login, barra in alto, menu del percorso, router e sincronizzazione.

import * as store from './store.js';
import { api, codes, connectEvents, setUnauthorizedHandler } from './api.js';
import { h, progressBar, refreshBindings, refreshLive, resetLive, dialog, toast } from './ui.js';
import { RENDERERS, setRerender, structureSignature } from './sections.js';
import * as pages from './pages.js';
import * as socratico from './socratico.js';
import { SECTIONS, completion } from './model.js';

const $ = (sel) => document.querySelector(sel);
const main = $('#main');
const nav = $('#nav');

// ---------------------------------------------------------------------------
// Router (hash): #/taskforce, #/s/<sezione>, #/verifica, #/lavagna, #/registro, #/esporta
// ---------------------------------------------------------------------------

function route() {
  const [, kind, arg] = location.hash.replace(/^#/, '').split('/');
  return { kind: kind || '', arg: arg || '' };
}

let lastSig = '';

/** Disegna la vista corrente; mantiene il focus e la posizione del cursore. */
function render() {
  const r = route();
  const needsGroup = r.kind === 's' || r.kind === 'verifica';
  if (!r.kind || (needsGroup && !store.state.doc) || (r.kind === 's' && !RENDERERS[r.arg])) {
    location.replace(store.state.doc ? '#/s/scenario' : '#/taskforce');
    return;
  }
  const active = document.activeElement;
  const focusPath = active?.dataset?.path;
  const sel = focusPath && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;

  resetLive();
  let view;
  if (r.kind === 's') view = RENDERERS[r.arg]();
  else if (r.kind === 'taskforce') view = pages.taskforce();
  else if (r.kind === 'verifica') view = pages.verifica();
  else if (r.kind === 'lavagna') view = pages.lavagna(render);
  else if (r.kind === 'registro') view = pages.registro();
  else if (r.kind === 'esporta') view = pages.esporta(render);
  else { location.replace('#/taskforce'); return; }
  main.replaceChildren(view);
  lastSig = structureSignature(store.state.doc);

  if (focusPath) {
    const el = main.querySelector(`[data-path="${CSS.escape(focusPath)}"]`);
    if (el) { el.focus({ preventScroll: true }); if (sel) try { el.setSelectionRange(...sel); } catch { /* non testuale */ } }
  }
  renderNav();
  renderTop();
  socratico.update();
  document.body.classList.remove('nav-open');
}
setRerender(render);

// ---------------------------------------------------------------------------
// Barra in alto e menu a sinistra
// ---------------------------------------------------------------------------

function renderTop() {
  const g = store.activeGroup();
  const chip = $('#tf-chip');
  chip.textContent = g ? g.name : 'Scegli Task Force';
  chip.classList.toggle('empty', !g);
  const r = route();
  for (const a of document.querySelectorAll('.top-actions a')) a.classList.toggle('on', a.getAttribute('href') === `#/${r.kind}`);
  renderStatus();
}

const STATUS = { saved: 'Salvato', pending: 'Salvataggio…', error: 'Errore di salvataggio: riprovo' };
function renderStatus() {
  const s = $('#save-status');
  s.className = 'save-status ' + store.state.status;
  s.title = STATUS[store.state.status];
  s.querySelector('.label').textContent = STATUS[store.state.status];
}

function renderNav() {
  const doc = store.state.doc;
  if (!doc) {
    nav.replaceChildren(h('div', { class: 'nav-empty' }, h('p', {}, 'Scegliete o create una Task Force per iniziare la vostra parte del libro.'), h('a', { class: 'btn primary', href: '#/taskforce' }, 'Task Force →')));
    return;
  }
  const c = completion(doc);
  const r = route();
  const item = (s) => {
    const pct = c.sections[s.key].pct;
    return h('a', { class: `nav-item day-${s.giorno}${r.kind === 's' && r.arg === s.key ? ' on' : ''}${pct === 100 ? ' done' : ''}`, href: `#/s/${s.key}` },
      h('span', { class: 'nav-num mono' }, String(s.n)),
      h('span', { class: 'nav-title' }, s.titolo),
      h('span', { class: 'nav-pct mono' }, `${pct}%`),
      progressBar(pct));
  };
  nav.replaceChildren(
    h('div', { class: 'nav-summary' },
      h('div', { class: 'nav-total' }, h('span', { class: 'mono big' }, `${c.total}%`), h('span', {}, 'della vostra parte')),
      progressBar(c.total),
      h('div', { class: 'small' }, h('span', { class: 'mono' }, String(c.puntiPotenziali)), ` punti di tappa potenziali · ${c.complete}/${SECTIONS.length} capitoli completi`)),
    h('div', { class: 'nav-block venerdi' }, h('h2', {}, 'Venerdì · progettare'), SECTIONS.filter((s) => s.giorno === 'venerdi').map(item)),
    h('div', { class: 'nav-block sabato' }, h('h2', {}, 'Sabato · costruire e valutare'), SECTIONS.filter((s) => s.giorno === 'sabato').map(item)),
    h('a', { class: 'nav-item verify' + (r.kind === 'verifica' ? ' on' : ''), href: '#/verifica' }, h('span', { class: 'nav-num' }, '✓'), h('span', { class: 'nav-title' }, 'Verifica finale')));
}

// ---------------------------------------------------------------------------
// Reazione ai cambiamenti dello store
// ---------------------------------------------------------------------------

let navTimer;
store.subscribe(({ source }) => {
  if (source === 'status') return renderStatus();
  if (!main.firstChild) return;
  const r = route();
  if (source === 'remote' || source === 'local') {
    // Cambio di struttura da un altro client → ridisegna; altrimenti aggiorna solo i valori
    if (source === 'remote' && structureSignature(store.state.doc) !== lastSig) return render();
    refreshBindings(main); // valori remoti, spunte delle etichette, opzioni dei menu
    refreshLive();
    clearTimeout(navTimer);
    navTimer = setTimeout(renderNav, 150);
    return;
  }
  if (source === 'groups') {
    renderTop();
    if (!store.state.doc && (r.kind === 's' || r.kind === 'verifica')) return render();
    refreshLive(); // es. "riusato da…" sugli agenti quando un altro gruppo ne copia uno
  }
  if (source === 'board' && r.kind === 'lavagna') refreshLive();
});

// ---------------------------------------------------------------------------
// Avvio: codice del corso, dati, eventi in tempo reale
// ---------------------------------------------------------------------------

async function askCourseCode(message) {
  for (;;) {
    const res = await dialog({ title: 'AIM-PRO Lab', body: message || 'Inserite il codice del corso che trovate alla lavagna.',
      fields: [{ key: 'codice', label: 'Codice del corso', type: 'password', required: true }], ok: 'Entra', cancel: null });
    try {
      const { ruolo } = await api.login(res.codice.trim());
      codes.corso = res.codice.trim();
      if (ruolo === 'docente') codes.docente = res.codice.trim();
      return;
    } catch {
      message = 'Codice non valido. Riprovate.';
    }
  }
}

let events;
function startEvents() {
  events?.close();
  events = connectEvents({
    group: ({ group }) => store.receiveGroup(group),
    'group-deleted': ({ id }) => store.removeGroup(id),
    board: (b) => store.receiveBoard(b),
    open: () => document.body.classList.remove('offline'),
    error: () => document.body.classList.add('offline'),
  });
  // Alla riconnessione ricarichiamo tutto, nel caso ci siamo persi eventi
  let first = true;
  events.addEventListener('open', () => { if (!first) store.loadAll().catch(() => {}); first = false; });
}

let reauthing = false;
setUnauthorizedHandler(async () => {
  if (reauthing) return;
  reauthing = true;
  codes.corso = '';
  await askCourseCode('Il codice del corso è cambiato o non è più valido.');
  reauthing = false;
  await boot();
});

async function boot() {
  if (!codes.corso) await askCourseCode();
  try {
    await store.loadAll();
  } catch (e) {
    if (e.status === 401) return; // gestito da setUnauthorizedHandler
    toast('Server non raggiungibile: ' + e.message, 'error');
    return;
  }
  startEvents();
  socratico.mount();
  render();
}

// Interazioni fisse della barra in alto
$('#tf-chip').addEventListener('click', () => { location.hash = '#/taskforce'; });
$('#nav-toggle').addEventListener('click', () => document.body.classList.toggle('nav-open'));
$('#nav-scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
window.addEventListener('beforeunload', (e) => { if (store.state.status === 'pending') { store.flushNow(); e.preventDefault(); } });

boot();
