// Guida socratica: pannello in basso a destra.
//
// - Sa in quale sezione siete e su quale campo stavate scrivendo (l'ultimo
//   campo con data-path che ha avuto il focus).
// - Le risposte arrivano in streaming dal server (/api/socratico), che parla con
//   un LLM open (es. Ollama). La guida non scrive mai la soluzione.
// - Solo le frasi SCRITTE DAL GRUPPO possono essere inserite nel campo con "↳":
//   le risposte della guida no, per scelta didattica.
// - Una conversazione per Task Force e per capitolo, tenuta in sessionStorage
//   (resta se ricaricate la pagina, sparisce chiudendo il browser).

import * as store from './store.js';
import { authHeaders } from './api.js';
import { h, toast } from './ui.js';
import { SECTIONS, filled } from './model.js';

const K_CHATS = 'cantiere.socratico';

/** Domanda d'avvio "spiegaci un concetto", una per sezione. */
const CONCEPT = {
  scenario: 'Cosa rende misurabile un obiettivo?',
  personas: 'Cosa vuol dire «toccata ma non utente»?',
  stories: "Cos'è un buon criterio di accettazione?",
  mockup: "Dove dovrebbe fare domande l'agente socratico?",
  agents: 'Che differenza c\'è tra precondizioni ed effetti?',
  prompt: 'Cosa rende robusto un prompt?',
  workflow: 'Router o pipeline: come scegliamo?',
  tests: "Che cos'è un test di equità?",
  analisi: 'Come valutiamo la trasparenza di un output?',
  etica: "Come capiamo in quale fascia dell'AI Act siamo?",
  competenze: 'Cosa conta come prova di una competenza?',
};

let panel, fab, list, input, sendBtn, ctxLine, modelChip;
let open = false;
let lastField = null; // { path, label, text: bool }
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

// ---------------------------------------------------------------------------
// Il campo su cui si sta lavorando
// ---------------------------------------------------------------------------

/** Un'etichetta leggibile per qualunque campo legato al documento. */
function labelFor(el) {
  const clean = (t) => (t || '').replace('✓', '').replace(/\s+/g, ' ').trim();
  const parts = [];
  const card = el.closest('.card, .step, tr');
  const badge = card?.querySelector('.avatar, .num-badge, .step-num');
  if (card?.classList.contains('story')) parts.push(`User story ${clean(badge?.textContent)}`);
  else if (card?.classList.contains('persona')) parts.push(clean(badge?.textContent));
  else if (card?.classList.contains('agent')) parts.push(`Agente ${card.querySelector('[data-path$=".nome"]')?.value || ''}`.trim());
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
});

// ---------------------------------------------------------------------------
// Rendering
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
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('soc-flash'); void el.offsetWidth; el.classList.add('soc-flash');
  }
  toast(filled(cur) ? `Aggiunto in fondo a «${f.label}».` : `Inserito in «${f.label}».`);
}

function messageEl(msg) {
  const el = h('div', { class: `soc-msg ${msg.role}${msg.error ? ' error' : ''}` });
  if (msg.role === 'assistant' && !msg.content) el.append(h('span', { class: 'soc-typing', 'aria-label': 'La guida sta pensando' }, h('i'), h('i'), h('i')));
  else el.append(...rich(msg.content));
  if (msg.role === 'user' && msg.field?.text && msg.field.groupId === store.state.activeId) {
    el.append(h('button', { class: 'soc-insert', type: 'button', title: 'Inserisce questa vostra frase nel campo', onclick: () => insertIntoField(msg) },
      `↳ Inserisci in «${msg.field.label}»`));
  }
  return el;
}

function renderMessages() {
  if (!list) return;
  const msgs = chat();
  if (!msgs.length) {
    const sec = currentSection();
    const starters = [
      sec ? 'Da dove partiamo in questo capitolo?' : 'Da dove partiamo?',
      lastField && lastField.section === sec ? `Mettete in discussione quello che abbiamo scritto in «${lastField.label}»` : null,
      'Cosa ci sta sfuggendo? Fateci le domande scomode.',
      sec ? `Spiegateci un concetto: ${CONCEPT[sec]}` : null,
    ].filter(Boolean);
    list.replaceChildren(h('div', { class: 'soc-intro' },
      h('p', {}, h('b', {}, 'Non vi darò la soluzione.'), ' La costruiamo insieme: vi faccio domande, vi spiego i concetti quando servono, e voi scrivete le risposte con le vostre parole.'),
      h('p', { class: 'small' }, 'Cliccate prima nel campo su cui state lavorando: così so di cosa parliamo. Quando una vostra frase vi convince, con «↳» la mettete nel campo.'),
      h('div', { class: 'soc-starters' }, starters.map((t) => h('button', { type: 'button', onclick: () => send(t) }, t)))));
    return;
  }
  list.replaceChildren(...msgs.map(messageEl));
  list.scrollTop = list.scrollHeight;
}

function renderContext() {
  if (!ctxLine) return;
  const sec = SECTIONS.find((s) => s.key === currentSection());
  const field = lastField && lastField.section === currentSection() ? lastField : null;
  ctxLine.replaceChildren(
    h('span', {}, sec ? `${sec.num} · ${sec.titolo}` : 'Percorso'),
    field ? h('span', {}, ' · campo «', h('b', {}, field.label), '»') : h('span', { class: 'muted' }, ' · nessun campo scelto'));
}

function setBusy(busy) {
  sendBtn.textContent = busy ? '■ Ferma' : 'Invia';
  sendBtn.classList.toggle('stop', busy);
  input.disabled = busy;
}

// ---------------------------------------------------------------------------
// Conversazione
// ---------------------------------------------------------------------------

async function send(text) {
  const content = String(text ?? input.value).trim();
  if (!content || controller) return;
  input.value = '';
  autoSize();
  const sec = currentSection();
  const field = lastField && lastField.section === sec ? { ...lastField, groupId: store.state.activeId } : null;
  const msgs = chat();
  msgs.push({ role: 'user', content, field });
  const reply = { role: 'assistant', content: '' };
  msgs.push(reply);
  renderMessages();
  save();

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
      reply.content = e.message;
      reply.error = true;
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
  if (open) { renderContext(); renderMessages(); setTimeout(() => input.focus(), 50); }
}

/** Crea il pulsante e il pannello (una volta sola). */
export function mount() {
  if (fab) return;
  fab = h('button', { class: 'soc-fab', type: 'button', 'aria-controls': 'soc-panel', 'aria-expanded': 'false', title: 'Guida socratica: ragioniamo insieme', onmousedown: (e) => e.preventDefault(), onclick: () => toggle() },
    h('span', { class: 'soc-fab-icon', 'aria-hidden': 'true' }, '?'), h('span', { class: 'soc-fab-label' }, 'Guida socratica'));
  ctxLine = h('div', { class: 'soc-ctx' });
  modelChip = h('span', { class: 'soc-model mono' });
  list = h('div', { class: 'soc-list', 'aria-live': 'polite' });
  input = h('textarea', { rows: 1, placeholder: 'Scrivete la vostra idea o il vostro dubbio…', 'aria-label': 'Messaggio alla guida',
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
    list,
    h('div', { class: 'soc-compose' }, input, sendBtn),
    h('p', { class: 'soc-foot' }, 'Una conversazione per capitolo. La guida fa domande, non scrive la soluzione: le risposte giuste sono le vostre.'));
  document.body.append(panel, fab);
  update();
}

/** Da chiamare a ogni cambio di vista o di Task Force. */
export function update() {
  if (!fab) return;
  const cfg = store.state.config.socratico;
  const visible = Boolean(cfg && store.state.doc);
  fab.hidden = !visible;
  if (!visible && open) toggle(false);
  if (cfg) modelChip.textContent = cfg.model;
  if (lastField && lastField.section !== currentSection()) lastField = null;
  if (open) { renderContext(); if (!controller) renderMessages(); }
}
