// Pagine fuori dal percorso: Task Force, Verifica del capitolo, Lavagna, Registro, Esporta.

import * as store from './store.js';
import { api, codes, request } from './api.js';
import { h, live, KEEP, refreshLive, progressBar, toast, dialog } from './ui.js';
import {
  SECTIONS, SETTORI, BADGES, PUNTI_BADGE, MODELLI, items, completion, planCheck, boardTotal, reusers,
} from './model.js';
import { addReusedAgent } from './sections.js';

const page = (title, lead, ...body) => h('article', { class: 'page' },
  h('header', { class: 'page-head' }, h('h1', {}, title), lead ? h('p', { class: 'lead' }, lead) : null),
  body);

/** Chiede il codice docente e lo salva nel browser. */
export async function unlockTeacher() {
  const res = await dialog({ title: 'Codice docente', body: 'Serve per modificare la lavagna e scaricare il libro intero.',
    fields: [{ key: 'codice', label: 'Codice', type: 'password', required: true }], ok: 'Sblocca' });
  if (!res) return false;
  try {
    await api.loginDocente(res.codice.trim());
    codes.docente = res.codice.trim();
    store.state.config.docente = true;
    toast('Modalità docente attiva.');
    return true;
  } catch (e) {
    toast(e.message, 'error');
    return false;
  }
}

// ---------------------------------------------------------------------------
// Task Force
// ---------------------------------------------------------------------------

export function taskforce() {
  const form = h('form', { class: 'card new-tf', onsubmit: async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      const g = await api.createGroup({ name: fd.get('name'), settore: fd.get('settore'), membri: fd.get('membri') });
      store.receiveGroup(g);
      store.setActive(g.id);
      location.hash = '#/s/scenario';
    } catch (err) { toast(err.message, 'error'); }
  } },
  h('h2', {}, 'Nuova Task Force'),
  h('label', { class: 'dlg-field' }, 'Nome della Task Force', h('input', { name: 'name', required: true, maxlength: 80, placeholder: 'Es. Le Sentinelle' })),
  h('label', { class: 'dlg-field' }, 'Settore', h('select', { name: 'settore' }, h('option', { value: '' }, '— scegli —'), SETTORI.map((s) => h('option', { value: s }, s)))),
  h('label', { class: 'dlg-field' }, 'Membri', h('input', { name: 'membri', placeholder: 'Solo i nomi, es. Anna, Luca, Sara' })),
  h('button', { class: 'btn primary', type: 'submit' }, 'Crea e inizia →'));

  return page('Task Force', 'Scegliete la vostra Task Force: tutti i membri possono scrivere insieme, i campi si salvano da soli.',
    live(() => {
      const groups = [...store.state.groups.values()];
      if (!groups.length) return h('p', { class: 'empty' }, 'Nessuna Task Force ancora: createne una qui sotto.');
      return h('div', { class: 'cards tf-list' }, groups.map((g) => {
        const c = completion(g.data);
        const active = g.id === store.state.activeId;
        return h('div', { class: 'card tf' + (active ? ' active' : '') },
          h('div', { class: 'tf-top' }, h('h3', {}, g.name), active ? h('span', { class: 'chip' }, 'attiva') : null),
          h('p', { class: 'muted' }, g.data.titolo || 'Parte senza titolo'),
          h('p', { class: 'small' }, [g.data.settore || 'Settore non indicato', g.data.membri].filter(Boolean).join(' · ')),
          h('div', { class: 'tf-progress' }, h('span', { class: 'mono' }, `${c.total}%`), progressBar(c.total)),
          h('div', { class: 'row' },
            h('button', { class: 'btn primary', onclick: () => { store.setActive(g.id); location.hash = '#/s/scenario'; } }, active ? 'Continua →' : 'Apri →'),
            store.state.config.docente ? h('button', { class: 'btn ghost danger', onclick: async () => {
              const ok = await dialog({ title: `Eliminare «${g.name}»?`, body: 'Il lavoro della Task Force e i punti in lavagna saranno cancellati definitivamente.', ok: 'Elimina' });
              if (ok) api.deleteGroup(g.id).then(() => store.removeGroup(g.id)).catch((e) => toast(e.message, 'error'));
            } }, 'Elimina') : null));
      }));
    }),
    form);
}

// ---------------------------------------------------------------------------
// Verifica del capitolo
// ---------------------------------------------------------------------------

export function verifica() {
  return page('Verifica finale', 'Tutto quello che manca prima di consegnare, capitolo per capitolo.',
    live(() => {
      const doc = store.state.doc;
      const c = completion(doc);
      const plan = planCheck(doc);
      return [
        h('div', { class: 'summary-box' },
          h('div', {}, h('span', { class: 'big mono' }, `${c.total}%`), h('span', {}, ' completato')),
          h('div', {}, h('span', { class: 'big mono' }, `${c.complete}/${SECTIONS.length}`), h('span', {}, ' capitoli completi')),
          h('div', {}, h('span', { class: 'big mono' }, String(c.puntiPotenziali)), h('span', {}, ' punti di tappa potenziali'))),
        h('ul', { class: 'verify' }, SECTIONS.map((s) => {
          const st = c.sections[s.key];
          return h('li', { class: `day-${s.giorno} ${st.pct === 100 ? 'ok' : ''}` },
            h('a', { href: `#/s/${s.key}` }, h('span', { class: 'mono' }, s.short), ' ', s.titolo),
            h('span', { class: 'mono pct' }, `${st.pct}%`), progressBar(st.pct),
            st.warnings.length ? h('ul', { class: 'warn-list' }, st.warnings.map((w) => h('li', {}, w))) : h('p', { class: 'ok-text' }, '✓ Completa'));
        })),
        h('div', { class: 'plan ' + (plan.ok ? 'ok' : '') }, h('h3', {}, 'Verifica del piano (Capitolo 7)'),
          h('ul', {}, plan.checks.map((k) => h('li', { class: k.ok ? 'ok' : 'ko' }, h('span', { class: 'mark' }, k.ok ? '✓' : '✕'), k.label)))),
      ];
    }),
    h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/esporta' }, 'Vai all\'export →')));
}

// ---------------------------------------------------------------------------
// Lavagna
// ---------------------------------------------------------------------------

const PUNTI = [['tappe', 'Tappe'], ['quiz', 'Quiz'], ['revisione', 'Revisione'], ['consiglio', 'Consiglio']];
const saveTimers = new Map();

/** Aggiorna la riga della lavagna partendo dallo stato attuale (non da quello del render). */
function saveBoard(groupId, change) {
  const cur = store.state.board.get(groupId) || { punti: {}, badges: [] };
  const b = { punti: { ...cur.punti, ...(change.punti || {}) }, badges: change.badges || cur.badges || [] };
  store.receiveBoard({ group_id: groupId, ...b });
  clearTimeout(saveTimers.get(groupId));
  saveTimers.set(groupId, setTimeout(() => api.setBoard(groupId, b).catch((e) => toast(e.message, 'error')), 500));
}

export function lavagna(rerender) {
  const editable = store.state.config.docente;
  return page('Lavagna', `Classifica delle Task Force. Totale = punti + ${PUNTI_BADGE} per badge. ${editable ? '' : 'Solo il docente può modificarla.'}`,
    editable ? null : h('div', { class: 'row' }, h('button', { class: 'btn', onclick: async () => { if (await unlockTeacher()) rerender(); } }, '🔒 Sblocca con codice docente')),
    live(() => {
      const rows = [...store.state.groups.values()].map((g) => {
        const b = store.state.board.get(g.id) || { punti: {}, badges: [] };
        return { g, b, total: boardTotal(b), pot: completion(g.data).puntiPotenziali };
      }).sort((x, y) => y.total - x.total || x.g.name.localeCompare(y.g.name));
      if (!rows.length) return h('p', { class: 'empty' }, 'Nessuna Task Force.');
      // Se il docente sta scrivendo in un campo, non ridisegniamo la tabella
      if (editable && document.activeElement?.matches?.('.board input')) return KEEP;
      return h('div', { class: 'table-wrap' }, h('table', { class: 'board' },
        h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Task Force'), PUNTI.map(([, l]) => h('th', { class: 'num' }, l)), h('th', {}, 'Badge'), h('th', { class: 'num' }, 'Totale'))),
        h('tbody', {}, rows.map(({ g, b, total, pot }, i) => h('tr', {},
          h('td', { class: 'mono rank' }, String(i + 1)),
          h('td', { 'data-label': 'Task Force' }, h('b', {}, g.name), h('div', { class: 'small muted' }, g.data.settore || '')),
          PUNTI.map(([k, l]) => h('td', { class: 'num', 'data-label': l },
            editable
              ? h('input', { type: 'number', class: 'mono', value: b.punti?.[k] ?? 0, min: -99, max: 999, oninput: (e) => saveBoard(g.id, { punti: { [k]: Number(e.target.value) || 0 } }), onblur: () => setTimeout(refreshLive) })
              : h('span', { class: 'mono' }, String(b.punti?.[k] ?? 0)),
            k === 'tappe' ? h('small', { class: 'pot', title: '10 punti per ogni capitolo completo' }, `potenziali ${pot}`) : null)),
          h('td', { 'data-label': 'Badge' }, h('div', { class: 'badges' }, BADGES.map((badge) => {
            const on = b.badges?.includes(badge);
            if (!editable) return on ? h('span', { class: 'badge on' }, badge) : null;
            return h('button', { class: 'badge' + (on ? ' on' : ''), type: 'button', 'aria-pressed': on, onclick: () => {
              const cur = store.state.board.get(g.id)?.badges || [];
              saveBoard(g.id, { badges: cur.includes(badge) ? cur.filter((x) => x !== badge) : [...cur, badge] });
              document.activeElement?.blur?.(); // esce dal campo numerico, così la tabella si aggiorna
              refreshLive();
            } }, badge);
          }))),
          h('td', { class: 'num total mono', 'data-label': 'Totale' }, String(total)))))));
    }));
}

// ---------------------------------------------------------------------------
// Registro degli agenti
// ---------------------------------------------------------------------------

export function registro() {
  const filter = h('input', { type: 'search', placeholder: 'Cerca per nome, ruolo o Task Force…', class: 'search' });
  const body = live(() => {
    const q = filter.value.trim().toLowerCase();
    const rows = [...store.state.groups.values()].flatMap((g) => items(g.data.agents).map((a) => ({ a, g })))
      .filter(({ a, g }) => !q || [a.nome, a.ruolo, g.name].join(' ').toLowerCase().includes(q));
    if (!rows.length) return h('p', { class: 'empty' }, 'Nessun agente.');
    const groups = [...store.state.groups.values()];
    const mine = items(store.state.doc?.agents);
    const useCell = (a, g) => {
      if (!store.state.doc) return h('span', { class: 'small muted' }, 'scegliete una Task Force');
      if (g.id === store.state.activeId) return h('span', { class: 'small muted' }, 'vostro');
      if (mine.some((m) => m.origine?.agentId === a.id)) return h('span', { class: 'chip' }, '✓ già nella vostra parte');
      return h('button', { class: 'btn small-btn', onclick: () => { if (addReusedAgent(g.id, a.id)) location.hash = '#/s/agents'; } }, '♻ Usa nella nostra parte');
    };
    return h('div', { class: 'table-wrap' }, h('table', { class: 'registry' },
      h('thead', {}, h('tr', {}, ['Agente', 'Ruolo', 'Task Force', 'Modello', 'Socratico', 'Precondizioni → effetti', 'Riusato da', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, rows.map(({ a, g }) => h('tr', {},
        h('td', { 'data-label': 'Agente' }, h('b', {}, a.nome || '—'),
          a.origine ? h('div', { class: 'small muted' }, `♻ da ${a.origine.nome || 'agente'} di «${a.origine.groupName}»`) : null),
        h('td', { 'data-label': 'Ruolo' }, a.ruolo || '—'),
        h('td', { 'data-label': 'Task Force' }, g.name),
        h('td', { 'data-label': 'Modello' }, MODELLI[a.modello] || '—'),
        h('td', { 'data-label': 'Socratico' }, a.socratico ? h('span', { class: 'chip soc' }, 'socratico') : '—'),
        h('td', { 'data-label': 'Precondizioni → effetti', class: 'pe' }, h('span', {}, a.precond || '…'), h('span', { class: 'arrow' }, ' → '), h('span', {}, a.effetti || '…')),
        h('td', { 'data-label': 'Riusato da' }, reusers(groups, a.id).join(', ') || '—'),
        h('td', {}, useCell(a, g)))))));
  });
  filter.addEventListener('input', refreshLive);
  return page('Registro degli agenti', 'Tutti gli agenti di tutte le Task Force. Potete riusarne uno nella vostra parte: è una copia da adattare, con la provenienza.', filter, body);
}

// ---------------------------------------------------------------------------
// Esporta
// ---------------------------------------------------------------------------

/** Scarica un export (testo o binario) con gli header di autenticazione. */
async function download(path, filename, btn) {
  const label = btn?.textContent;
  if (btn) { btn.disabled = true; if (/\.pdf$/.test(filename)) btn.textContent = 'Compilo il PDF…'; }
  try {
    const res = await request('GET', path, undefined, { raw: true });
    const url = URL.createObjectURL(await res.blob());
    const a = h('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) {
    toast(e.message.split('\n')[0], 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}

async function copy(path, what) {
  try { await navigator.clipboard.writeText(await api.exportText(path)); toast(`${what} copiato negli appunti.`); } catch (e) { toast('Copia non riuscita: ' + e.message, 'error'); }
}

/**
 * "Apri in Overleaf": invia il .tex a overleaf.com, che crea un nuovo progetto.
 * Il contenuto lascia il computer solo con questo clic esplicito.
 */
async function openInOverleaf(path, name, btn) {
  btn.disabled = true;
  try {
    const texSrc = await api.exportText(path);
    const form = h('form', { method: 'POST', action: 'https://www.overleaf.com/docs', target: '_blank', hidden: true },
      h('input', { type: 'hidden', name: 'encoded_snip', value: encodeURIComponent(texSrc) }),
      h('input', { type: 'hidden', name: 'snip_name', value: name }),
      h('input', { type: 'hidden', name: 'engine', value: 'pdflatex' }));
    document.body.append(form);
    form.submit();
    form.remove();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

const fileSlug = (s) => String(s || 'capitolo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

/** I pulsanti di export per un capitolo o per il libro. */
function exportBlock(base, fileBase, overleafName, what) {
  const pdf = store.state.config.pdf;
  const btn = (cls, text, onclick, title) => h('button', { class: `btn ${cls}`, type: 'button', title, onclick: (e) => onclick(e.currentTarget) }, text);
  return h('div', { class: 'export-grid' },
    h('div', { class: 'export-row' },
      h('div', { class: 'fmt' }, h('b', {}, 'PDF'), h('small', {}, pdf ? 'impaginato, pronto da leggere o stampare' : 'non disponibile su questo server')),
      pdf ? h('div', { class: 'row' }, btn('primary', '⬇ Scarica il PDF', (b) => download(`${base}.pdf`, `${fileBase}.pdf`, b))) : h('span', { class: 'small muted' }, 'Compilatelo su Overleaf con il progetto qui sotto.')),
    h('div', { class: 'export-row' },
      h('div', { class: 'fmt' }, h('b', {}, 'LaTeX per Overleaf'), h('small', {}, 'progetto con main.tex, preambolo e una cartella parti/; si compila con pdfLaTeX')),
      h('div', { class: 'row' },
        btn('primary', '⬇ Progetto Overleaf (.zip)', (b) => download(`${base}.zip`, `${fileBase}.zip`, b), 'Su Overleaf: New Project → Upload Project'),
        btn('', '↗ Apri in Overleaf', (b) => openInOverleaf(`${base}.tex`, overleafName, b), 'Crea un nuovo progetto su overleaf.com con questo contenuto'),
        btn('', '⬇ .tex (file unico)', (b) => download(`${base}.tex`, `${fileBase}.tex`, b)),
        btn('ghost', '⧉ Copia LaTeX', () => copy(`${base}.tex`, 'LaTeX')))),
    h('div', { class: 'export-row' },
      h('div', { class: 'fmt' }, h('b', {}, 'Markdown'), h('small', {}, 'testo semplice, per wiki, pandoc, documenti condivisi')),
      h('div', { class: 'row' },
        btn('', '⬇ .md', (b) => download(`${base}.md`, `${fileBase}.md`, b)),
        btn('ghost', '⧉ Copia Markdown', () => copy(`${base}.md`, what)))));
}

let previewFmt = 'md';

export function esporta(rerender) {
  const g = store.activeGroup();
  const docente = store.state.config.docente;
  const base = g ? `api/export/${encodeURIComponent(g.id)}` : null;
  const pre = h('pre', { class: 'md-preview' }, 'Caricamento…');
  const loadPreview = () => { if (base) api.exportText(`${base}.${previewFmt}`).then((t) => { pre.textContent = t; }).catch((e) => { pre.textContent = e.message; }); };
  loadPreview();
  const tabs = h('div', { class: 'seg' }, [['md', 'Markdown'], ['tex', 'LaTeX']].map(([f, l]) => h('button', { type: 'button', class: previewFmt === f ? 'on' : '',
    onclick: (e) => { previewFmt = f; tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); loadPreview(); } }, l)));

  return page('Esporta', 'Il vostro lavoro in PDF, in LaTeX per Overleaf o in Markdown.',
    g ? h('div', { class: 'card' },
      h('h2', {}, 'La vostra parte del libro'),
      h('p', { class: 'small muted' }, `«${g.data.titolo || g.name}»: gli 11 capitoli della Task Force ${g.name}.`),
      exportBlock(base, `parte-${fileSlug(g.name)}`, `Cantiere - ${g.name}`, 'Testo'))
      : h('p', { class: 'empty' }, 'Scegliete prima una Task Force.'),
    h('div', { class: 'card teacher' },
      h('h2', {}, 'Libro intero'),
      h('p', { class: 'small muted' }, 'Una parte per Task Force, in ordine di settore, ognuna con i suoi 11 capitoli; in appendice il registro degli agenti e le lezioni apprese.'),
      docente
        ? exportBlock('api/export/book', 'libro-agenti-al-lavoro', 'Agenti al Lavoro - libro', 'Libro')
        : h('button', { class: 'btn', onclick: async () => { if (await unlockTeacher()) rerender(); } }, '🔒 Sblocca con codice docente')),
    g ? h('div', { class: 'row' }, h('h2', { class: 'sub', style: 'margin:0' }, 'Anteprima'), tabs) : null,
    g ? pre : null);
}
