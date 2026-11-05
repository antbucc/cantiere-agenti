// Guida socratica: pannello in basso a destra che accompagna la Task Force
// capitolo per capitolo e campo per campo.
//
// - PERCORSO GUIDATO: in cima al pannello c'è sempre il "prossimo passo" del
//   capitolo (da guida.js): un'azione da fare con un pulsante della pagina o un
//   campo da compilare, con la sua scheda (a cosa serve, quando è buono).
//   «Mostrami» porta al punto giusto, «Ragioniamoci insieme» apre il dialogo,
//   «Salta» passa oltre. Quando il campo viene compilato, la guida lo nota e
//   propone un parere critico prima di andare avanti.
// - DOMANDE: i gruppi chiedono quello che non sanno; il server risponde con un
//   LLM open ancorato al glossario del corso e alla scheda del campo.
// - La guida non scrive mai il contenuto dei campi. Solo le frasi SCRITTE DAL
//   GRUPPO si possono inserire nel campo con «↳».
// - Una conversazione per Task Force e per capitolo, in sessionStorage.

import * as store from './store.js';
import { authHeaders } from './api.js';
import { h, toast } from './ui.js';
import { SECTIONS, filled, completion } from './model.js';
import { guideSteps, fieldGuide, offlineReply, isPressure } from './guida.js';

const K_CHATS = 'cantiere.socratico';

/** Domanda d'avvio "spiegateci un concetto", una per capitolo. */
const CONCEPT = {
  scenario: 'Cosa rende misurabile un obiettivo?',
  personas: 'Cosa vuol dire «toccata ma non utente»?',
  stories: "Cos'è un buon criterio di accettazione?",
  mockup: "Dove dovrebbe fare domande l'agente socratico?",
  agents: "Che differenza c'è tra precondizioni ed effetti?",
  prompt: 'Cosa rende robusto un prompt?',
  workflow: 'Router o pipeline: come scegliamo?',
  tests: "Che cos'è un test di equità?",
  analisi: 'Come valutiamo la trasparenza di un output?',
  etica: "Come capiamo in quale fascia dell'AI Act siamo?",
  competenze: 'Cosa conta come prova di una competenza?',
};

let panel, fab, fabBadge, guideBox, list, input, sendBtn, ctxLine, modelChip, quick;
let open = false;
let lastField = null; // { path, label, text, section }: il campo su cui si lavora
let chosenKey = null; // passo scelto dall'elenco (finché non è fatto)
let justDone = null; // { path, label }: campo guidato appena compilato
let listOpen = false;
let shownStep = null; // il passo mostrato per ultimo nella scheda (per riconoscerlo quando viene compilato)
const skipped = new Set(); // passi saltati in questa sessione
let controller = null; // AbortController della risposta in corso
let chats = load();

function load() {
  try { return JSON.parse(sessionStorage.getItem(K_CHATS)) || {}; } catch { return {}; }
}
function save() {
  try { sessionStorage.setItem(K_CHATS, JSON.stringify(chats)); } catch { /* storage pieno o bloccato */ }
}

const currentSection = () => {
  const m = location.hash.match(/^#\/s\/([a-z]+)/);
  return m && SECTIONS.some((s) => s.key === m[1]) ? m[1] : null;
};
const chatKey = () => `${store.state.activeId}:${currentSection() || 'percorso'}`;
const chat = () => (chats[chatKey()] ||= []);
const stepKey = (s) => s.path || s.label;
const activeField = () => (lastField && lastField.section === currentSection() ? lastField : null);
/** Vero se c'è un modello collegato; altrimenti la guida lavora in modalità di base. */
const llmOn = () => Boolean(store.state.config.socratico?.attivo);

// ---------------------------------------------------------------------------
// Il percorso guidato
// ---------------------------------------------------------------------------

/** I passi che mancano nel capitolo aperto e quello da proporre ora. */
function guideState() {
  const sec = currentSection();
  const all = sec && store.state.doc ? guideSteps(store.state.doc, sec) : [];
  let todo = all.filter((s) => !skipped.has(stepKey(s)));
  if (!todo.length && all.length) { skipped.clear(); todo = all; } // finiti i saltati: si ricomincia
  const current = todo.find((s) => stepKey(s) === chosenKey) || todo[0] || null;
  return { sec, all, current };
}

/** Il primo capitolo non ancora completo (per «Avanti»). */
function nextIncomplete(after) {
  const c = completion(store.state.doc);
  const start = Math.max(0, SECTIONS.findIndex((s) => s.key === after) + 1);
  return [...SECTIONS.slice(start), ...SECTIONS.slice(0, start)].find((s) => c.sections[s.key].pct < 100 && s.key !== after) || null;
}

/** Evidenzia e porta in vista un elemento della pagina. */
function flash(el) {
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('soc-flash'); void el.offsetWidth; el.classList.add('soc-flash');
}

function showStep(step) {
  if (step.kind === 'campo') {
    const el = document.querySelector(`[data-path="${CSS.escape(step.path)}"]`);
    if (!el) return toast('Il campo non è visibile in questa pagina.');
    flash(el);
    el.focus({ preventScroll: true });
    return;
  }
  const scope = step.within ? document.querySelector(step.within) : document.querySelector('main');
  const btn = step.button && [...(scope || document).querySelectorAll('button, a.btn')].find((b) => b.textContent.includes(step.button));
  if (btn) flash(btn);
  else toast('Lo trovate nelle schede di questo capitolo.');
}

function workOn(step) {
  chosenKey = stepKey(step);
  if (step.kind === 'campo') {
    lastField = { path: step.path, label: step.label, text: step.input === 'text', section: currentSection() };
    send(`Lavoriamo su «${step.label}». Da dove partiamo?`, 'guida');
  } else {
    send(`${step.label}. Come lo affrontiamo?`, 'guida', { noField: true });
  }
}

function skip(step) {
  skipped.add(stepKey(step));
  if (chosenKey === stepKey(step)) chosenKey = null;
  renderGuide();
}

function renderGuide() {
  if (!guideBox) return;
  const { sec, all, current } = guideState();
  updateBadge(all.length);
  const btn = (text, onclick, cls = '') => h('button', { class: `btn ${cls}`, type: 'button', onclick }, text);

  if (!store.state.doc) {
    guideBox.replaceChildren(h('div', { class: 'soc-step' },
      h('p', {}, 'Scegliete o create la vostra Task Force: poi vi accompagno capitolo per capitolo.'),
      h('div', { class: 'soc-actions' }, h('a', { class: 'btn primary small-btn', href: '#/taskforce' }, 'Task Force →'))));
    return;
  }
  if (!sec) {
    const nx = store.state.doc ? nextIncomplete(null) : null;
    guideBox.replaceChildren(h('div', { class: 'soc-step' },
      h('p', {}, 'Aprite un capitolo e vi guido campo per campo.'),
      nx ? h('div', { class: 'soc-actions' }, h('a', { class: 'btn primary', href: `#/s/${nx.key}` }, `Vai a ${nx.short} · ${nx.titolo}`)) : null));
    return;
  }

  const blocks = [];
  if (justDone) {
    blocks.push(h('div', { class: 'soc-done' },
      h('span', {}, '✓ ', h('b', {}, justDone.label), ' compilato.'),
      h('div', { class: 'soc-actions' },
        btn('Parere critico', () => { const d = justDone; justDone = null; lastField = { ...d, section: sec }; send(`Ci date un parere su quello che abbiamo scritto in «${d.label}»?`, 'parere'); }, 'primary small-btn'),
        btn('Avanti', () => { justDone = null; renderGuide(); }, 'ghost small-btn'))));
  }

  if (!current) {
    shownStep = null;
    const nx = nextIncomplete(sec);
    blocks.push(h('div', { class: 'soc-step complete' },
      h('div', { class: 'soc-step-head' }, h('span', { class: 'soc-kicker' }, 'Capitolo completo'), h('span', { class: 'soc-count ok' }, '✓')),
      h('p', {}, 'Tutti i campi di questo capitolo sono compilati.'),
      h('div', { class: 'soc-actions' },
        btn('Parere sul capitolo', () => send('Abbiamo completato il capitolo: cosa vi sembra il punto più debole?', 'libero', { noField: true }), 'small-btn'),
        nx ? h('a', { class: 'btn primary small-btn', href: `#/s/${nx.key}` }, `Avanti: ${nx.short} →`) : h('a', { class: 'btn primary small-btn', href: '#/verifica' }, 'Verifica finale →'))));
    guideBox.replaceChildren(...blocks);
    return;
  }

  shownStep = current;
  const g = current.kind === 'campo' ? fieldGuide(current.path) : null;
  blocks.push(h('div', { class: `soc-step ${current.kind}` },
    h('div', { class: 'soc-step-head' },
      h('span', { class: 'soc-kicker' }, current.kind === 'azione' ? 'Prossimo passo · da fare' : 'Prossimo passo · da compilare'),
      h('span', { class: 'soc-count', title: 'Passi che mancano in questo capitolo' }, `${all.length} da fare`)),
    h('p', { class: 'soc-step-label' }, current.label),
    g?.domanda ? h('p', { class: 'soc-q' }, g.domanda) : null,
    g ? h('p', { class: 'soc-hint' }, h('b', {}, 'A cosa serve: '), g.cosa, ' ', h('b', {}, 'È buono se: '), g.buona) : null,
    h('div', { class: 'soc-actions' },
      btn('Mostrami', () => showStep(current), 'small-btn'),
      btn('Ragioniamoci insieme', () => workOn(current), 'primary small-btn'),
      btn('Salta', () => skip(current), 'ghost small-btn'))));

  if (all.length > 1) {
    const details = h('details', { class: 'soc-all', open: listOpen, ontoggle: (e) => { listOpen = e.target.open; } },
      h('summary', {}, `Tutti i passi del capitolo (${all.length})`),
      h('ol', {}, all.map((s) => h('li', { class: stepKey(s) === stepKey(current) ? 'on' : (skipped.has(stepKey(s)) ? 'skipped' : '') },
        h('button', { type: 'button', onclick: () => { chosenKey = stepKey(s); skipped.delete(stepKey(s)); renderGuide(); } },
          s.kind === 'azione' ? '◆ ' : '', s.label)))));
    blocks.push(details);
  }
  guideBox.replaceChildren(...blocks);
}

function updateBadge(n) {
  if (!fabBadge) return;
  fabBadge.textContent = n > 99 ? '99+' : String(n);
  fabBadge.hidden = !currentSection() || n === 0;
  fab.title = n ? `Guida socratica: ${n} passi da fare in questo capitolo` : 'Guida socratica: ragioniamo insieme';
}

// ---------------------------------------------------------------------------
// Il campo su cui si sta lavorando
// ---------------------------------------------------------------------------

/** Un'etichetta leggibile per qualunque campo legato al documento. */
function labelFor(el) {
  // se il campo è un passo del percorso, usiamo la sua etichetta
  const sec = currentSection();
  const step = sec && store.state.doc ? guideSteps(store.state.doc, sec).find((s) => s.path === el.dataset.path) : null;
  if (step) return step.label;
  const clean = (t) => (t || '').replace('✓', '').replace(/\s+/g, ' ').trim();
  const parts = [];
  const card = el.closest('.card, .step, tr');
  const badge = card?.querySelector('.avatar, .num-badge, .step-num');
  if (card?.classList.contains('story')) parts.push(`Storia ${clean(badge?.textContent)}`);
  else if (card?.classList.contains('persona')) parts.push(clean(badge?.textContent));
  else if (card?.classList.contains('agent')) parts.push(card.querySelector('[data-path$=".nome"]')?.value || card.querySelector('.agent-title')?.firstChild?.textContent || 'Agente');
  else if (card?.classList.contains('step')) parts.push(`Passo ${clean(badge?.textContent)}`);
  else if (card?.tagName === 'TR') {
    const head = card.querySelector('th[scope=row]');
    if (head) parts.push(clean(head.textContent).slice(0, 70));
    else parts.push(`Caso ${clean(card.querySelector('td')?.textContent)}`);
  }
  const fieldLabel = el.closest('.field')?.querySelector(':scope > label');
  const td = el.closest('td[data-label]');
  if (fieldLabel) parts.push(clean(fieldLabel.textContent).replace(/ · .*$/, ''));
  else if (td) parts.push(td.dataset.label);
  else if (el.placeholder) parts.push(el.placeholder);
  return parts.filter(Boolean).join(' · ') || el.dataset.path;
}

document.addEventListener('focusin', (e) => {
  const el = e.target;
  if (!el?.dataset?.path || panel?.contains(el)) return;
  const text = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el.dataset.kind || 'text') === 'text');
  lastField = { path: el.dataset.path, label: labelFor(el), text, section: currentSection() };
  renderContext();
  renderQuick();
});

// Quando il gruppo esce da un campo del percorso dopo averlo compilato, la guida
// lo nota e propone un parere critico prima di andare avanti.
document.addEventListener('focusout', (e) => {
  const el = e.target;
  if (!el?.dataset?.path || panel?.contains(el)) return;
  // il percorso si è già aggiornato mentre il gruppo scriveva: confrontiamo con il passo MOSTRATO
  const step = shownStep;
  if (step?.kind === 'campo' && step.path === el.dataset.path) {
    setTimeout(() => {
      if (filled(store.get(el.dataset.path))) {
        justDone = { path: el.dataset.path, label: step.label, text: step.input === 'text' };
        if (chosenKey === stepKey(step)) chosenKey = null;
      }
      renderGuide();
    }, 50);
  }
});

// ---------------------------------------------------------------------------
// Conversazione
// ---------------------------------------------------------------------------

/** Markdown minimo e sicuro: paragrafi, a capo, **grassetto**, *corsivo*. */
function rich(text) {
  return text.split(/\n{2,}/).map((para) => h('p', {}, para.split('\n').flatMap((line, i) => [
    i ? h('br') : null,
    ...line.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/).map((t) => {
      if (/^\*\*[^*]+\*\*$/.test(t)) return h('b', {}, t.slice(2, -2));
      if (/^\*[^*]+\*$/.test(t)) return h('i', {}, t.slice(1, -1));
      return t;
    }),
  ])));
}

function insertIntoField(msg) {
  const f = msg.field;
  const cur = store.get(f.path);
  const text = msg.content.trim();
  store.set(f.path, filled(cur) ? `${String(cur).trimEnd()}\n${text}` : text);
  const el = document.querySelector(`[data-path="${CSS.escape(f.path)}"]`);
  if (el) flash(el);
  toast(filled(cur) ? `Aggiunto in fondo a «${f.label}».` : `Inserito in «${f.label}».`);
  const { current } = guideState();
  if (!current || current.path !== f.path) justDone = { path: f.path, label: f.label, text: true };
  renderGuide();
}

function messageEl(msg) {
  const el = h('div', { class: `soc-msg ${msg.role}${msg.error ? ' error' : ''}` });
  if (msg.role === 'assistant' && !msg.content) el.append(h('span', { class: 'soc-typing', 'aria-label': 'La guida sta pensando' }, h('i'), h('i'), h('i')));
  else el.append(...rich(msg.content));
  // «↳ Inserisci» solo sotto frasi che possono andare in un campo: non domande, non «scrivetecelo voi»
  const insertable = !msg.starter && !/\?\s*$/.test(msg.content) && !isPressure(msg.content) && msg.content.trim().split(/\s+/).length >= 3;
  if (msg.role === 'user' && msg.field?.text && msg.field.groupId === store.state.activeId && insertable) {
    el.append(h('button', { class: 'soc-insert', type: 'button', title: 'Inserisce questa vostra frase nel campo', onclick: () => insertIntoField(msg) },
      `↳ Inserisci in «${msg.field.label}»`));
  }
  return el;
}

function renderMessages() {
  if (!list) return;
  const msgs = chat();
  if (!msgs.length) {
    list.replaceChildren(h('div', { class: 'soc-intro' },
      h('p', {}, h('b', {}, 'Vi accompagno campo per campo.'), " Il prossimo passo è qui sopra. Se qualcosa non vi è chiaro chiedete pure: vi spiego i concetti. Le risposte nei campi però le scrivete voi."),
      h('p', { class: 'small' }, 'Quando una vostra frase vi convince, con «↳ Inserisci» la mettete nel campo.'),
      llmOn() ? null : h('p', { class: 'soc-offline' }, h('b', {}, 'Modalità di base. '),
        "Il modello della guida non è collegato: vi accompagno con il percorso, le schede dei campi e il glossario del corso. Per le risposte libere il docente deve collegare un modello (AI_BASE_URL e AI_MODEL).")));
    return;
  }
  list.replaceChildren(...msgs.map(messageEl));
  list.scrollTop = list.scrollHeight;
}

/** Domande rapide, legate al capitolo e al campo attivo. */
function renderQuick() {
  if (!quick) return;
  const sec = currentSection();
  const f = activeField();
  const chips = [];
  if (f) chips.push(['Non capiamo cosa chiede questo campo', `Non capiamo cosa chiede il campo «${f.label}»: ce lo spiegate?`, 'domanda']);
  if (f && filled(store.get(f.path))) chips.push([`Parere su «${f.label.length > 28 ? f.label.slice(0, 26) + '…' : f.label}»`, `Ci date un parere su quello che abbiamo scritto in «${f.label}»?`, 'parere']);
  if (sec) chips.push([`Spiegateci: ${CONCEPT[sec]}`, CONCEPT[sec], 'domanda']);
  chips.push(['Cosa ci sta sfuggendo?', 'Cosa ci sta sfuggendo in questo capitolo? Fateci le domande scomode.', 'libero']);
  quick.replaceChildren(...chips.slice(0, 3).map(([label, text, intent]) => h('button', { type: 'button', onclick: () => send(text, intent, { starter: true }) }, label)));
}

function renderContext() {
  if (!ctxLine) return;
  const sec = SECTIONS.find((s) => s.key === currentSection());
  const f = activeField();
  ctxLine.replaceChildren(
    h('span', {}, sec ? `${sec.num} · ${sec.titolo}` : 'Percorso'),
    f ? h('span', {}, ' · campo «', h('b', {}, f.label), '»') : h('span', { class: 'muted' }, ' · nessun campo scelto'));
}

function setBusy(busy) {
  sendBtn.textContent = busy ? '■ Ferma' : 'Invia';
  sendBtn.classList.toggle('stop', busy);
  input.disabled = busy;
  quick.querySelectorAll('button').forEach((b) => { b.disabled = busy; });
}

/**
 * Manda un messaggio alla guida.
 * intent: 'guida' (lavoriamo su un campo) | 'parere' | 'domanda' | 'libero'
 */
async function send(text, intent = 'libero', { noField = false, starter = false } = {}) {
  const content = String(text ?? input.value).trim();
  if (!content || controller) return;
  if (text === undefined) { input.value = ''; autoSize(); }
  if (!open) toggle(true);
  const sec = currentSection();
  const f = noField ? null : activeField();
  const field = f ? { ...f, groupId: store.state.activeId } : null;
  const msgs = chat();
  msgs.push({ role: 'user', content, field, starter: starter || intent === 'guida' || intent === 'parere' });
  const reply = { role: 'assistant', content: '' };
  msgs.push(reply);
  renderMessages();
  renderContext();
  save();

  const local = () => offlineReply({ text: content, intent, field, filledNow: Boolean(field && filled(store.get(field.path))) });
  if (!llmOn()) {
    reply.content = local();
    save();
    renderMessages();
    return;
  }

  controller = new AbortController();
  setBusy(true);
  try {
    const res = await fetch('api/socratico', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        groupId: store.state.activeId,
        section: sec,
        intent,
        field: field && { path: field.path, label: field.label },
        messages: msgs.slice(0, -1).filter((m) => !m.error).map(({ role, content: c }) => ({ role, content: c })),
      }),
    });
    if (!res.ok) {
      let msg = `Errore ${res.status}`;
      try { msg = (await res.json()).error || msg; } catch { /* non JSON */ }
      throw new Error(msg);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const bubble = list.lastElementChild;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      reply.content += decoder.decode(value, { stream: true });
      bubble.replaceChildren(...rich(reply.content));
      list.scrollTop = list.scrollHeight;
    }
    if (!reply.content.trim()) throw new Error('La guida non ha risposto. Riprovate.');
  } catch (e) {
    if (e.name === 'AbortError') {
      reply.content = (reply.content || '') + (reply.content ? ' …' : '(interrotta)');
    } else {
      // il modello non risponde (spento, ancora in download…): la guida di base risponde comunque
      reply.content = `${local()}\n\n*(${e.message.replace(/^La guida non risponde: /, 'Il modello non ha risposto: ')} Intanto vi ho risposto con il glossario e le schede.)*`;
    }
  } finally {
    controller = null;
    setBusy(false);
    save();
    renderMessages();
    input.focus();
  }
}

function autoSize() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight + 2, 140) + 'px';
}

function toggle(force) {
  open = force ?? !open;
  panel.hidden = !open;
  fab.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('soc-open', open);
  if (open) { renderAll(); setTimeout(() => input.focus(), 50); }
}

function renderAll() {
  renderContext();
  renderGuide();
  renderQuick();
  if (!controller) renderMessages();
}

/** Crea il pulsante e il pannello (una volta sola). */
export function mount() {
  if (fab) return;
  fabBadge = h('span', { class: 'soc-badge', hidden: true });
  fab = h('button', { class: 'soc-fab', type: 'button', 'aria-controls': 'soc-panel', 'aria-expanded': 'false', title: 'Guida socratica: ragioniamo insieme', onmousedown: (e) => e.preventDefault(), onclick: () => toggle() },
    h('span', { class: 'soc-fab-icon', 'aria-hidden': 'true' }, '?'), h('span', { class: 'soc-fab-label' }, 'Guida socratica'), fabBadge);
  ctxLine = h('div', { class: 'soc-ctx' });
  modelChip = h('span', { class: 'soc-model mono' });
  guideBox = h('div', { class: 'soc-guide', 'aria-live': 'polite' });
  list = h('div', { class: 'soc-list', 'aria-live': 'polite' });
  quick = h('div', { class: 'soc-quick' });
  input = h('textarea', { rows: 1, placeholder: 'Chiedete quello che non sapete, o proponete la vostra idea…', 'aria-label': 'Messaggio alla guida',
    oninput: autoSize,
    onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } } });
  sendBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => (controller ? controller.abort() : send()) }, 'Invia');
  panel = h('section', { id: 'soc-panel', class: 'soc-panel', hidden: true, 'aria-label': 'Guida socratica', onkeydown: (e) => { if (e.key === 'Escape') toggle(false); } },
    h('header', { class: 'soc-head' },
      h('div', { class: 'grow' }, h('h2', {}, 'Guida socratica ', modelChip), ctxLine),
      h('button', { class: 'icon', type: 'button', title: 'Nuova conversazione', 'aria-label': 'Nuova conversazione', onclick: () => {
        if (controller) controller.abort();
        chats[chatKey()] = []; save(); renderMessages();
      } }, '↺'),
      h('button', { class: 'icon', type: 'button', title: 'Chiudi', 'aria-label': 'Chiudi', onclick: () => toggle(false) }, '✕')),
    guideBox,
    list,
    quick,
    h('div', { class: 'soc-compose' }, input, sendBtn),
    h('p', { class: 'soc-foot' }, 'La guida spiega e fa domande; le risposte nei campi le scrivete voi.'));
  document.body.append(panel, fab);

  // il percorso si aggiorna mentre il gruppo lavora (anche dagli altri computer)
  let t;
  store.subscribe(({ source }) => {
    if (source !== 'local' && source !== 'remote') return;
    clearTimeout(t);
    t = setTimeout(() => { renderGuide(); if (open) renderQuick(); }, 250);
  });
  update();
}

/** Da chiamare a ogni cambio di vista o di Task Force. */
export function update() {
  if (!fab) return;
  const cfg = store.state.config.socratico;
  fab.hidden = store.state.config.socratico === undefined; // sempre visibile, anche senza modello
  modelChip.textContent = cfg?.attivo ? cfg.model : 'modalità di base';
  modelChip.classList.toggle('off', !cfg?.attivo);
  if (lastField && lastField.section !== currentSection()) lastField = null;
  if (chosenKey && !guideState().all.some((s) => stepKey(s) === chosenKey)) chosenKey = null;
  justDone = justDone && lastField?.section === currentSection() ? justDone : null;
  renderGuide();
  if (open) renderAll();
}
