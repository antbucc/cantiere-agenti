// Le undici sezioni del capitolo. Ogni renderer restituisce un elemento DOM
// costruito con gli helper di ui.js; i campi si salvano da soli.

import * as store from './store.js';
import { api } from './api.js';
import { h, field, select, checkbox, live, warnings, dialog, toast } from './ui.js';
import {
  SECTIONS, SETTORI, FIELDS, PERSONA_TIPI, MODELLI, PATTERNS, LIVELLI_UMANO, TEST_TIPI, TEST_QUOTE,
  ESITI, OUTPUTS, CRITERI, FASCE, SUPERVISIONE, DOMANDE_ETICA, COMPETENZE, LIVELLI_COMP,
  items, newId, nextOrd, filled, planCheck, sectionStatus, reuseAgent, reusers,
} from './model.js';

let rerender = () => {};
export function setRerender(fn) { rerender = fn; }

/**
 * Firma "strutturale" del documento: se cambia (elementi aggiunti, tolti,
 * riordinati, tipo di passo, agente socratico…) la sezione va ridisegnata;
 * altrimenti basta aggiornare i valori dei campi.
 */
export function structureSignature(doc) {
  const pick = (map, keys = []) => items(map).map((x) => [x.id, x.ord, ...keys.map((k) => x[k])]);
  return JSON.stringify([
    pick(doc?.personas, ['aiDraft']),
    pick(doc?.stories, ['aiDraft']),
    items(doc?.agents).map((a) => [a.id, a.ord, a.socratico, a.versioni?.length || 0]),
    pick(doc?.workflow?.steps, ['tipo']),
    pick(doc?.tests),
  ]);
}

// ---------------------------------------------------------------------------
// Struttura comune di una sezione
// ---------------------------------------------------------------------------

function frame(key, todo, ...body) {
  const i = SECTIONS.findIndex((s) => s.key === key);
  const s = SECTIONS[i];
  const prev = SECTIONS[i - 1];
  const next = SECTIONS[i + 1];
  const giorno = s.giorno === 'venerdi' ? 'Venerdì · progettare' : 'Sabato · costruire e valutare';
  return h('article', { class: `section day-${s.giorno}` },
    h('header', { class: 'sec-head' },
      h('div', { class: 'sec-band' }, giorno),
      h('div', { class: 'sec-title' },
        h('span', { class: 'sec-num' }, s.num),
        h('h1', {}, s.titolo),
        h('span', { class: 'chip time' }, `${s.tempo} · ${s.short}`)),
      live(() => {
        const st = sectionStatus(key, store.state.doc);
        return h('div', { class: 'sec-progress' }, h('span', { class: 'mono' }, `${st.pct}%`), h('div', { class: 'bar' + (st.pct === 100 ? ' full' : '') }, h('span', { style: `width:${st.pct}%` })));
      })),
    h('aside', { class: 'todo' }, h('h2', {}, 'Cosa fare'), h('ol', {}, todo.map((t) => h('li', { html: t })))),
    h('div', { class: 'sec-body' }, body),
    h('nav', { class: 'sec-nav' },
      prev ? h('a', { class: 'btn ghost', href: `#/s/${prev.key}` }, `← ${prev.short} ${prev.titolo}`) : h('span'),
      next ? h('a', { class: 'btn primary', href: `#/s/${next.key}` }, `Avanti: ${next.short} ${next.titolo} →`)
        : h('a', { class: 'btn primary', href: '#/verifica' }, 'Avanti: Verifica finale →')));
}

const sub = (title, hint) => h('h3', { class: 'sub' }, title, hint ? h('small', {}, hint) : null);
const fieldsOf = (base, defs, extra = {}) => defs.map((f) => field([...base, f.key], { label: f.label, ph: f.ph, ...extra }));

// ---- Operazioni sulle liste indicizzate per id

function addItem(listPath, prefix, defaults) {
  const id = newId(prefix);
  store.set([...listPath, id], { ...defaults, ord: nextOrd(store.get(listPath)), deleted: false });
  rerender();
  // porta il nuovo elemento in vista
  requestAnimationFrame(() => document.querySelector(`[data-item="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  return id;
}

async function removeItem(listPath, id, what) {
  const ok = await dialog({ title: `Eliminare ${what}?`, body: 'Lo potete ricreare, ma il contenuto andrà perso.', ok: 'Elimina' });
  if (!ok) return;
  store.set([...listPath, id, 'deleted'], true);
  rerender();
}

function move(listPath, id, dir) {
  const list = items(store.get(listPath));
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  // rinumera tutti: evita pareggi di `ord`
  store.setMany(list.map((x, k) => [[...listPath, x.id, 'ord'], k + 1]));
  rerender();
}

const itemTools = (listPath, id, what, { reorder = true } = {}) => h('div', { class: 'item-tools' },
  reorder ? h('button', { class: 'icon', title: 'Sposta su', 'aria-label': 'Sposta su', onclick: () => move(listPath, id, -1) }, '↑') : null,
  reorder ? h('button', { class: 'icon', title: 'Sposta giù', 'aria-label': 'Sposta giù', onclick: () => move(listPath, id, 1) }, '↓') : null,
  h('button', { class: 'icon danger', title: `Elimina ${what}`, 'aria-label': `Elimina ${what}`, onclick: () => removeItem(listPath, id, what) }, '✕'));

/** "Bozza con AI": riempie solo i campi ancora vuoti. */
async function aiDraft(btn, kind, listPath, id, extra = {}) {
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Sto scrivendo…';
  try {
    const res = await api.draft({ groupId: store.state.activeId, kind, ...extra });
    const entries = Object.entries(res).filter(([k]) => !filled(store.get([...listPath, id, k])))
      .map(([k, v]) => [[...listPath, id, k], v]);
    entries.push([[...listPath, id, 'aiDraft'], true]);
    store.setMany(entries);
    toast(entries.length > 1 ? 'Bozza inserita nei campi vuoti. Ora criticatela e riscrivetela!' : 'Tutti i campi erano già compilati.');
    rerender();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

const aiButton = (onclick) => (store.state.config.ai
  ? h('button', { class: 'btn ai', type: 'button', onclick: (e) => onclick(e.currentTarget) }, '✨ Bozza con AI') : null);

const draftNote = (path) => (store.get([...path, 'aiDraft'])
  ? field([...path, 'modifiche'], { label: 'Cosa avete cambiato rispetto alla bozza', ph: 'Cosa era sbagliato, stereotipato o troppo generico? Cosa avete riscritto?', cls: 'ai-note' })
  : null);

const personaOptions = () => Object.fromEntries(items(store.get('personas')).map((p, i) => [p.id, `P${i + 1} · ${p.nome || 'senza nome'}`]));
const agentOptions = () => Object.fromEntries(items(store.get('agents')).map((a) => [a.id, a.nome || 'Agente senza nome']));

// ---------------------------------------------------------------------------
// Capitolo 1 · Scenario
// ---------------------------------------------------------------------------

function scenario() {
  return frame('scenario', [
    'Scegliete <b>un</b> caso reale del vostro settore: un processo che conoscete, con un problema concreto.',
    'Compilate i campi in ordine: dal contesto alla misura di successo. Usate numeri quando potete.',
    'Dalla checklist etica (Capitolo 10) scegliete le 3 domande più critiche per questo scenario.',
    'Scrivete il titolo e la sintesi alla fine: diventano la pagina d\'apertura della vostra parte del libro.',
  ],
  h('div', { class: 'grid2' },
    field('titolo', { label: 'Titolo della vostra parte', ph: 'Es. «Il primo giorno senza panico»', multiline: false }),
    select('settore', Object.fromEntries(SETTORI.map((s) => [s, s])), { label: 'Settore' })),
  field('sintesi', { label: 'In due frasi', ph: 'Il problema e la vostra proposta, come li spieghereste a un collega alla macchinetta del caffè' }),
  field('membri', { label: 'Autori', ph: 'Nomi (o soli nomi di battesimo) dei membri della Task Force', multiline: false, hint: 'nessun altro dato personale' }),
  sub('Lo scenario'),
  fieldsOf(['scenario'], FIELDS.scenario),
  field(['scenario', 'foto'], { label: 'Foto della lavagna (facoltativa)', ph: 'Link alla foto o breve descrizione', multiline: false }));
}

// ---------------------------------------------------------------------------
// Capitolo 2 · Personas
// ---------------------------------------------------------------------------

function personas() {
  const list = items(store.get('personas'));
  return frame('personas', [
    'Create 2–4 personas: chi userà il sistema, chi ne è <b>toccato senza usarlo</b>, chi lo supervisiona.',
    'Date a ognuna una giornata, obiettivi, frustrazioni e un rapporto con l\'AI credibili.',
    'Chiedetevi per ognuna: <i>cosa rischia se il sistema sbaglia?</i>',
    store.state.config.ai ? 'Potete partire da una bozza con AI, ma poi dovete dire cosa avete cambiato.' : 'Evitate gli stereotipi: pensate a persone che conoscete davvero.',
  ],
  live(() => warnings(sectionStatus('personas', store.state.doc).warnings, 'Personas complete: c\'è anche chi è toccato senza usare il sistema.')),
  h('div', { class: 'cards' }, list.map((p, i) => {
    const base = ['personas', p.id];
    return h('div', { class: 'card persona', dataset: { item: p.id } },
      h('div', { class: 'card-head' },
        live(() => h('span', { class: `avatar t-${store.get([...base, 'tipo']) || 'none'}` }, `P${i + 1}`)),
        h('div', { class: 'grow' },
          field([...base, 'nome'], { label: 'Nome e ruolo', ph: 'Es. Marta, 52 anni, segreteria', multiline: false }),
          select([...base, 'tipo'], PERSONA_TIPI, { label: 'Tipo' })),
        itemTools(['personas'], p.id, 'questa persona', { reorder: false })),
      fieldsOf(base, FIELDS.persona),
      aiButton((btn) => aiDraft(btn, 'persona', ['personas'], p.id)),
      draftNote(base));
  })),
  h('button', { class: 'btn add', onclick: () => addItem(['personas'], 'p', { nome: '', tipo: list.length === 0 ? 'utente' : '' }) }, '+ Aggiungi persona'));
}

// ---------------------------------------------------------------------------
// Capitolo 3 · User stories
// ---------------------------------------------------------------------------

function stories() {
  const list = items(store.get('stories'));
  return frame('stories', [
    'Scrivete almeno <b>4</b> storie con la formula <i>Come [persona] voglio [azione] per [beneficio]</i>.',
    'Per ognuna: criterio di accettazione <i>dato… quando… allora…</i> verificabile in un test.',
    'Almeno una storia <b>negativa</b>: cosa il sistema non deve fare (es. «non deve decidere al posto di…»).',
    'Ordinatele per priorità con le frecce.',
  ],
  live(() => warnings(sectionStatus('stories', store.state.doc).warnings, 'Storie sufficienti, compresa una negativa.')),
  list.map((s, i) => {
    const base = ['stories', s.id];
    return h('div', { class: 'card story', dataset: { item: s.id } },
      h('div', { class: 'card-head' },
        h('span', { class: 'num-badge' }, String(i + 1)),
        h('div', { class: 'formula grow' },
          h('span', { class: 'kw' }, 'Come'), select([...base, 'persona'], personaOptions, { empty: '— persona —' }),
          h('span', { class: 'kw' }, 'voglio'), field([...base, 'voglio'], { ph: 'azione', rows: 1 }),
          h('span', { class: 'kw' }, 'per'), field([...base, 'per'], { ph: 'beneficio', rows: 1 })),
        itemTools(['stories'], s.id, 'questa storia')),
      h('div', { class: 'accept' },
        h('span', { class: 'accept-label' }, 'Accettazione'),
        h('div', { class: 'grid3' },
          field([...base, 'dato'], { label: 'Dato', ph: 'la situazione di partenza' }),
          field([...base, 'quando'], { label: 'Quando', ph: "l'evento o l'azione" }),
          field([...base, 'allora'], { label: 'Allora', ph: 'il risultato osservabile' }))),
      h('div', { class: 'row' },
        checkbox([...base, 'negativa'], 'Storia negativa (cosa NON deve succedere)', { cls: 'check neg' }),
        aiButton((btn) => aiDraft(btn, 'story', ['stories'], s.id, { personaId: store.get([...base, 'persona']) }))),
      draftNote(base));
  }),
  h('button', { class: 'btn add', onclick: () => addItem(['stories'], 's', { negativa: false }) }, '+ Aggiungi user story'));
}

// ---------------------------------------------------------------------------
// Capitolo 4 · Mockup
// ---------------------------------------------------------------------------

function mockup() {
  return frame('mockup', [
    'Disegnate su carta tre schermate: <b>prima</b>, <b>durante</b>, <b>dopo</b>. Fotografatele.',
    "Segnate dove si vede che è un'AI, dove l'agente fa una domanda socratica, dove l'utente approva.",
    'Pensate al supervisore e al caso di errore: anche quelli sono schermate.',
  ],
  h('div', { class: 'grid3' }, fieldsOf(['mockup'], FIELDS.mockup.slice(0, 3), { rows: 4 })),
  field(['mockup', 'foto'], { label: 'Foto del mockup', ph: 'Link alla foto delle schermate disegnate', multiline: false }),
  sub('I punti delicati'),
  fieldsOf(['mockup'], FIELDS.mockup.slice(3)));
}

// ---------------------------------------------------------------------------
// Capitolo 5 · Agenti e Capitolo 6 · Prompt e versioni
// ---------------------------------------------------------------------------

async function freezeVersion(id) {
  const a = store.get(['agents', id]);
  if (!filled(a?.prompt)) return toast('Scrivete prima il prompt.', 'error');
  const v = Array.isArray(a.versioni) ? a.versioni : [];
  const res = await dialog({
    title: `Congela la versione ${v.length + 1}`,
    body: 'Salviamo una copia del prompt com\'è adesso. Per la storia delle versioni:',
    fields: [{ key: 'nota', label: 'Cosa non andava e cosa è cambiato', multiline: true, required: true,
      ph: v.length ? 'Es. Inventava le scadenze: abbiamo aggiunto «se non trovi la procedura, dillo»' : 'Es. Prima versione, scritta dopo il mockup' }],
    ok: 'Congela',
  });
  if (!res) return;
  store.set(['agents', id, 'versioni'], [...v, { n: v.length + 1, prompt: a.prompt, nota: res.nota.trim(), at: new Date().toISOString() }]);
  toast(`Versione ${v.length + 1} congelata.`);
  rerender();
}

/** Copia nel capitolo attivo l'agente `agentId` della Task Force `groupId`. */
export function addReusedAgent(groupId, agentId) {
  const g = store.state.groups.get(groupId);
  const a = items(g?.data.agents).find((x) => x.id === agentId);
  if (!a || !store.state.doc) return null;
  const id = addItem(['agents'], 'a', reuseAgent(a, g));
  toast(`«${a.nome || 'Agente'}» copiato. Ora adattatelo al vostro scenario.`);
  return id;
}

async function importAgent() {
  const others = [...store.state.groups.values()].filter((g) => g.id !== store.state.activeId)
    .flatMap((g) => items(g.data.agents).map((a) => ({ g, a })));
  if (!others.length) return toast('Le altre Task Force non hanno ancora agenti.');
  const res = await dialog({
    title: "Riusa un agente di un'altra Task Force",
    body: 'Ne fate una copia nella vostra parte, con la provenienza. Poi adattatela: precondizioni, regole e prompt vanno rivisti per il vostro scenario.',
    fields: [{ key: 'scelta', label: 'Agente', required: true,
      options: Object.fromEntries(others.map(({ g, a }) => [`${g.id}/${a.id}`, `${a.nome || 'senza nome'}${a.socratico ? ' (socratico)' : ''} — ${g.name}`])) }],
    ok: 'Copia nella nostra parte',
  });
  if (!res) return;
  const [groupId, agentId] = res.scelta.split('/');
  addReusedAgent(groupId, agentId);
}

function agents() {
  const list = items(store.get('agents'));
  return frame('agents', [
    'Dividete il lavoro in <b>2–5 agenti</b>, ognuno con un solo ruolo chiaro. Meno è meglio.',
    'Per ognuno: precondizioni (cosa serve prima) ed effetti (cosa produce). Serviranno nel workflow.',
    'Almeno un agente <b>socratico</b>: fa domande per far ragionare la persona invece di dare la risposta.',
    'Scegliete la taglia del modello più piccola che basta: il prompt lo scrivete nel Capitolo 6.',
    'Potete <b>riusare</b> un agente di un\'altra Task Force (dal Registro): è una copia da adattare, e va detto cosa avete cambiato.',
  ],
  live(() => warnings(sectionStatus('agents', store.state.doc).warnings, 'Squadra di agenti ben dimensionata, con un socratico.')),
  list.map((a) => {
    const base = ['agents', a.id];
    return h('div', { class: 'card agent', dataset: { item: a.id } },
      h('div', { class: 'card-head' },
        h('span', { class: 'avatar t-agent', 'aria-hidden': 'true' }, '⚙'),
        h('div', { class: 'grow' }, field([...base, 'nome'], { label: 'Nome dell\'agente', ph: 'Es. Smistatore', multiline: false })),
        checkbox([...base, 'socratico'], 'socratico', { cls: 'chip-toggle', onchange: () => rerender() }),
        itemTools(['agents'], a.id, 'questo agente')),
      a.origine ? h('div', { class: 'origin' },
        h('span', {}, '♻ Riusato da ', h('b', {}, a.origine.nome || 'un agente'), ` di «${a.origine.groupName}»`),
        field([...base, 'adattamento'], { label: "Cosa avete adattato rispetto all'originale", ph: 'Precondizioni, regole, prompt, taglia del modello: cosa non andava per il vostro scenario?' })) : null,
      live(() => {
        const by = reusers([...store.state.groups.values()], a.id);
        return by.length ? h('div', { class: 'reused-by' }, `★ Riusato da ${by.length} Task Force: ${by.join(', ')}`) : null;
      }),
      h('div', { class: 'grid2' }, fieldsOf(base, FIELDS.agent)),
      a.socratico ? field([...base, 'domande'], { label: 'Domande che pone', ph: 'Le 2–3 domande con cui fa ragionare la persona, invece di darle la risposta' }) : null,
      h('div', { class: 'grid2' },
        select([...base, 'modello'], MODELLI, { label: 'Taglia del modello' }),
        field([...base, 'temperatura'], { label: 'Temperatura', type: 'number', min: 0, max: 2, step: 0.1, ph: '0–1', hint: 'bassa = più prevedibile' })),
      h('a', { class: 'to-prompt', href: '#/s/prompt' }, filled(a.prompt) ? `Prompt: ${(a.versioni || []).length} versioni congelate → Cap. 6` : 'Prompt ancora da scrivere → Cap. 6'));
  }),
  h('div', { class: 'row' },
    h('button', { class: 'btn add', onclick: () => addItem(['agents'], 'a', { socratico: false, modello: 'piccolo', temperatura: 0.2, versioni: [] }) }, '+ Aggiungi agente'),
    h('button', { class: 'btn', onclick: importAgent }, "♻ Riusa un agente di un'altra Task Force"),
    h('a', { class: 'btn ghost', href: '#/registro' }, 'Sfoglia il Registro')));
}

const fmtAt = (iso) => new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });

async function restoreVersion(id, v) {
  const ok = await dialog({ title: `Riprendere la versione ${v.n}?`, body: 'Il prompt attuale viene sostituito da quello della versione scelta. Se vi serve, congelatelo prima.', ok: 'Riprendi' });
  if (!ok) return;
  store.set(['agents', id, 'prompt'], v.prompt);
  toast(`Ripresa la versione ${v.n}: ora è il prompt corrente.`);
  rerender();
}

function prompt() {
  const list = items(store.get('agents'));
  return frame('prompt', [
    "Per ogni agente scrivete il prompt: <b>ruolo</b>, cosa riceve, <b>formato</b> della risposta, cosa non deve mai fare, cosa fa <b>se non sa</b>.",
    'Provatelo sulla piattaforma con un caso tipico e uno al limite.',
    'Quando lo cambiate dopo una prova, <b>congelate</b> la versione e annotate cosa non andava: è la storia del vostro prompt, e finisce nel libro.',
  ],
  live(() => warnings(sectionStatus('prompt', store.state.doc).warnings, 'Ogni agente ha il suo prompt e almeno una versione congelata.')),
  list.length ? null : h('p', { class: 'empty' }, 'Nessun agente ancora: createli nel Capitolo 5.'),
  list.map((a) => {
    const base = ['agents', a.id];
    const versioni = Array.isArray(a.versioni) ? a.versioni : [];
    return h('div', { class: 'card agent prompt-card', dataset: { item: a.id } },
      h('div', { class: 'card-head' },
        h('span', { class: 'avatar t-agent', 'aria-hidden': 'true' }, '⚙'),
        h('div', { class: 'grow' },
          h('h3', { class: 'agent-title' }, a.nome || 'Agente senza nome', a.socratico ? h('span', { class: 'chip soc' }, 'socratico') : null),
          h('p', { class: 'small muted' }, [a.ruolo, a.modello ? `modello ${MODELLI[a.modello] || a.modello}` : null, a.temperatura !== undefined && a.temperatura !== '' ? `temperatura ${a.temperatura}` : null].filter(filled).join(' · ')))),
      field([...base, 'prompt'], { label: 'Prompt (versione corrente)', ph: 'Sei … Il tuo compito è … Ricevi … Rispondi con … Non devi mai … Se non sai, …', mono: true, rows: 10 }),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => freezeVersion(a.id) }, `❄ Congela come versione ${versioni.length + 1}`)),
      versioni.length
        ? h('div', {}, h('h3', { class: 'sub' }, 'Storia delle versioni'),
          h('ul', { class: 'versions' }, [...versioni].reverse().map((v) => h('li', {},
            h('div', {}, h('b', {}, `v${v.n}`), ' · ', fmtAt(v.at), ' — ', v.nota),
            h('details', {}, h('summary', {}, 'mostra il prompt'), h('pre', {}, v.prompt),
              h('button', { class: 'btn ghost small-btn', onclick: () => restoreVersion(a.id, v) }, '↺ Riprendi questa versione'))))))
        : h('p', { class: 'small muted' }, 'Nessuna versione congelata.'));
  }));
}

// ---------------------------------------------------------------------------
// Capitolo 7 · Workflow
// ---------------------------------------------------------------------------

function workflow() {
  const steps = items(store.get('workflow.steps'));
  const stepsPath = ['workflow', 'steps'];
  const stepLabel = (s, i) => (s.tipo === 'umano' ? `Passo ${i + 1} · umano` : `Passo ${i + 1} · ${store.get(['agents', s.agente, 'nome']) || 'agente'}`);
  return frame('workflow', [
    'Scegliete un pattern: <b>pipeline</b> (in fila), <b>router</b> (smista), <b>produttore e critico</b>, o una combinazione.',
    'Mettete in fila i passi. Per ogni agente indicate chi soddisfa le sue precondizioni: l\'input iniziale o un passo precedente.',
    "Inserite almeno un passo con l'<b>umano nel ciclo</b> e dite se è informato, approva o decide.",
    'La <b>verifica del piano</b> si aggiorna da sola: deve essere tutta verde prima dei test.',
  ],
  h('div', { class: 'grid2' },
    select(['workflow', 'pattern'], PATTERNS, { label: 'Pattern' }),
    field(['workflow', 'motivazione'], { label: 'Perché questo pattern', ph: FIELDS.workflow[0].ph })),
  sub('I passi', 'dall\'alto in basso, nell\'ordine in cui avvengono'),
  h('ol', { class: 'steps' }, steps.map((s, i) => {
    const base = [...stepsPath, s.id];
    const isHuman = s.tipo === 'umano';
    const prevOptions = () => {
      const now = items(store.get('workflow.steps'));
      const idx = now.findIndex((x) => x.id === s.id);
      return { input: 'Input umano iniziale', ...Object.fromEntries(now.slice(0, Math.max(0, idx)).map((x, k) => [x.id, stepLabel(x, k)])) };
    };
    return h('li', { class: 'step ' + (isHuman ? 'human' : 'agent'), dataset: { item: s.id } },
      h('span', { class: 'step-num' }, String(i + 1)),
      h('div', { class: 'step-body' },
        h('div', { class: 'seg' },
          ['agente', 'umano'].map((t) => h('button', { class: s.tipo === t ? 'on' : '', type: 'button',
            onclick: () => { store.set([...base, 'tipo'], t); rerender(); } }, t === 'agente' ? '🤖 Agente' : '👤 Umano nel ciclo'))),
        isHuman
          ? h('div', { class: 'grid2' },
            select([...base, 'livello'], LIVELLI_UMANO, { label: "L'umano…" }),
            field([...base, 'nota'], { label: 'Chi e cosa fa', ph: 'Es. la tutor legge la sintesi e la conferma', rows: 1 }))
          : h('div', { class: 'grid3' },
            select([...base, 'agente'], agentOptions, { label: 'Agente' }),
            select([...base, 'soddisfatta'], prevOptions, { label: 'Precondizioni soddisfatte da…' }),
            field([...base, 'nota'], { label: 'Nota', ph: 'Cosa passa al passo successivo', rows: 1 }))),
      itemTools(stepsPath, s.id, 'questo passo'));
  })),
  h('div', { class: 'row' },
    h('button', { class: 'btn add', onclick: () => addItem(stepsPath, 'w', { tipo: 'agente', agente: '', soddisfatta: steps.length ? '' : 'input' }) }, '+ Passo agente'),
    h('button', { class: 'btn add human', onclick: () => addItem(stepsPath, 'w', { tipo: 'umano', livello: '' }) }, '+ Passo umano')),
  live(() => {
    const plan = planCheck(store.state.doc);
    return h('div', { class: 'plan ' + (plan.ok ? 'ok' : '') },
      h('h3', {}, 'Verifica del piano'),
      h('ul', {}, plan.checks.map((c) => h('li', { class: c.ok ? 'ok' : 'ko' }, h('span', { class: 'mark' }, c.ok ? '✓' : '✕'), c.label, c.detail ? h('small', {}, ' — ' + c.detail) : null))));
  }),
  sub('Le domande del progettista'),
  fieldsOf(['workflow'], FIELDS.workflow.slice(1)),
  field(['workflow', 'passi'], { label: 'I passi in parole', ph: 'Raccontate il flusso come una storia: arriva…, poi…, infine…' }),
  field(['workflow', 'dsl'], { label: 'Configurazione o DSL del workflow', ph: 'Incollate qui la definizione esportata dalla piattaforma (YAML, JSON, …)', mono: true, rows: 4 }),
  field(['workflow', 'screenshot'], { label: 'Screenshot', ph: 'Link allo screenshot del workflow nella piattaforma', multiline: false }));
}

// ---------------------------------------------------------------------------
// Capitolo 8 · Test
// ---------------------------------------------------------------------------

function prepareTests() {
  const list = items(store.get('tests'));
  const entries = [];
  let ord = nextOrd(store.get('tests'));
  for (const [tipo, n] of Object.entries(TEST_QUOTE)) {
    const missing = n - list.filter((t) => t.tipo === tipo).length;
    for (let k = 0; k < missing; k += 1) entries.push([['tests', newId('t')], { tipo, ord: ord++, deleted: false }]);
  }
  if (!entries.length) return toast('I 12 casi ci sono già.');
  store.setMany(entries);
  toast(`Aggiunti ${entries.length} casi.`);
  rerender();
}

function tests() {
  const list = items(store.get('tests'));
  const cols = [
    ['input', 'Input', 'Cosa diamo al sistema'],
    ['atteso', 'Atteso', 'Cosa dovrebbe succedere'],
    ['ottenuto', 'Ottenuto', 'Cosa è successo davvero'],
  ];
  return frame('tests', [
    'Preparate <b>12 casi</b>: 6 tipici, 3 al limite, 2 di equità (stesso caso, persona diversa), 1 ostile.',
    "Scrivete l'esito atteso <b>prima</b> di eseguire il test.",
    'Eseguite, annotate ottenuto, esito e numero di chiamate al modello.',
    'In fondo: cosa avete corretto (prompt, workflow) dopo i test.',
  ],
  live(() => {
    const now = items(store.get('tests'));
    return h('div', { class: 'counters' },
      Object.entries(TEST_QUOTE).map(([t, n]) => {
        const c = now.filter((x) => x.tipo === t).length;
        return h('span', { class: 'counter ' + (c >= n ? 'ok' : '') }, `${TEST_TIPI[t]} `, h('b', { class: 'mono' }, `${c}/${n}`));
      }),
      h('span', { class: 'sep' }),
      Object.entries(ESITI).map(([e, l]) => h('span', { class: `counter esito-${e}` }, `${l} `, h('b', { class: 'mono' }, String(now.filter((x) => x.esito === e).length)))));
  }),
  h('div', { class: 'row' },
    h('button', { class: 'btn', onclick: prepareTests }, '⚡ Prepara i 12 casi'),
    h('button', { class: 'btn add', onclick: () => addItem(['tests'], 't', { tipo: '' }) }, '+ Aggiungi un caso')),
  list.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'grid-table tests' },
    h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Tipo'), cols.map(([, l]) => h('th', {}, l)), h('th', {}, 'Esito'), h('th', {}, 'Chiamate'), h('th', {}, 'Note'), h('th', {}))),
    h('tbody', {}, list.map((t, i) => {
      const base = ['tests', t.id];
      return h('tr', { dataset: { item: t.id } },
        h('td', { 'data-label': '#', class: 'mono' }, String(i + 1)),
        h('td', { 'data-label': 'Tipo' }, select([...base, 'tipo'], TEST_TIPI, { empty: '—' })),
        cols.map(([k, l, ph]) => h('td', { 'data-label': l }, field([...base, k], { ph, rows: 1 }))),
        h('td', { 'data-label': 'Esito' }, select([...base, 'esito'], ESITI, { empty: '—' })),
        h('td', { 'data-label': 'Chiamate' }, field([...base, 'chiamate'], { type: 'number', ph: 'n.' })),
        h('td', { 'data-label': 'Note' }, field([...base, 'note'], { ph: 'Perché', rows: 1 })),
        h('td', {}, itemTools(['tests'], t.id, 'questo caso', { reorder: false })));
    })))) : h('p', { class: 'empty' }, 'Nessun caso ancora. Usate «Prepara i 12 casi».'),
  field(['testsNote', 'correzioni'], { label: 'Correzioni dopo i test', ph: 'Cosa avete cambiato nei prompt o nel workflow dopo aver visto i risultati (e congelato come nuova versione?)' }));
}

// ---------------------------------------------------------------------------
// Capitolo 9 · Analisi critica
// ---------------------------------------------------------------------------

function analisi() {
  return frame('analisi', [
    'Scegliete tre output reali dai test: <b>un successo</b>, <b>un fallimento</b>, <b>un caso ambiguo</b>.',
    'Valutate ognuno sui sei criteri. Siate severi: è il vostro lavoro, non una pubblicità.',
    'Rispondete alla domanda «Se andasse in produzione domani…».',
    'Annotate la domanda ricevuta dal Consiglio e come avete risposto.',
  ],
  h('div', { class: 'cards three' }, OUTPUTS.map((o) => h('div', { class: 'card' },
    h('h3', {}, o.label),
    field(['analisi', o.key, 'caso'], { label: 'Il caso', ph: 'Quale input, quale output (riassunto)' }),
    CRITERI.map((c) => field(['analisi', o.key, c.key], { label: c.label, ph: c.ph, rows: 1 }))))),
  sub('Il giudizio'),
  field(['analisi', 'danno'], { label: 'Se andasse in produzione domani…', ph: '…qual è il danno peggiore che potrebbe fare? A chi? Quanto ci metteremmo ad accorgercene?', rows: 3 }),
  h('div', { class: 'grid2' },
    field(['analisi', 'consiglioDomanda'], { label: 'La domanda del Consiglio', ph: 'La domanda che vi ha fatto il Consiglio, parola per parola' }),
    field(['analisi', 'consiglio'], { label: 'La vostra risposta', ph: 'Cosa avete risposto' })),
  field(['analisi', 'cambiato'], { label: 'Cosa avete cambiato dopo il Consiglio', ph: 'Una modifica concreta (o perché avete deciso di non cambiare)' }));
}

// ---------------------------------------------------------------------------
// Capitolo 10 · Etica e sostenibilità
// ---------------------------------------------------------------------------

function etica() {
  return frame('etica', [
    'Riprendete la checklist: per ogni domanda, cosa avevate <b>previsto venerdì</b> e cosa avete <b>osservato sabato</b> nei test.',
    "Collocate lo scenario in una fascia dell'AI Act e motivate.",
    'Scegliete il livello di supervisione umana e fate il bilancio di sobrietà: si poteva fare con meno?',
  ],
  h('div', { class: 'table-wrap' }, h('table', { class: 'grid-table etica' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Domanda'), h('th', {}, 'Previsto · venerdì'), h('th', {}, 'Osservato · sabato'), h('th', {}, 'Cosa cambiamo'))),
    h('tbody', {}, DOMANDE_ETICA.map((q, i) => {
      const base = ['etica', 'q' + (i + 1)];
      return h('tr', {},
        h('th', { scope: 'row', class: 'q' }, h('span', { class: 'mono qn' }, String(i + 1)), q),
        h('td', { 'data-label': 'Previsto · venerdì' }, field([...base, 'previsto'], { rows: 2 })),
        h('td', { 'data-label': 'Osservato · sabato' }, field([...base, 'osservato'], { rows: 2 })),
        h('td', { 'data-label': 'Cosa cambiamo' }, field([...base, 'cambiamo'], { rows: 2 })));
    })))),
  sub('AI Act e supervisione'),
  h('div', { class: 'grid2' },
    select(['etica', 'fascia'], FASCE, { label: "Fascia dell'AI Act" }),
    select(['etica', 'supervisione'], SUPERVISIONE, { label: 'Livello di supervisione' })),
  field(['etica', 'fasciaMotivo'], { label: 'Perché questa fascia', ph: 'Quale uso, quali persone, quali obblighi ne derivano (trasparenza, registrazione, valutazione…)' }),
  field(['etica', 'rischi'], { label: 'Rischi residui', ph: 'Cosa resta rischioso anche dopo le correzioni, e chi se ne fa carico' }),
  sub('Bilancio di sobrietà'),
  h('div', { class: 'grid2' }, fieldsOf(['etica', 'bilancio'], FIELDS.bilancio)));
}

// ---------------------------------------------------------------------------
// Capitolo 11 · Competenze e lezioni
// ---------------------------------------------------------------------------

function competenze() {
  return frame('competenze', [
    'Per ogni competenza: a che livello eravate venerdì mattina, a che livello siete ora.',
    'Indicate dove l\'avete esercitata e una prova concreta (un capitolo, un test, una versione del prompt).',
    'Chiudete con tre lezioni, una raccomandazione per un formatore e cosa <b>non</b> automatizzereste.',
  ],
  h('div', { class: 'table-wrap' }, h('table', { class: 'grid-table comp' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Competenza'), h('th', {}, 'Venerdì'), h('th', {}, 'Sabato'), h('th', {}, 'Dove'), h('th', {}, 'Prova'))),
    h('tbody', {}, COMPETENZE.map((c) => {
      const base = ['competenze', c.key];
      return h('tr', {},
        h('th', { scope: 'row' }, c.label),
        h('td', { 'data-label': 'Venerdì' }, select([...base, 'prima'], LIVELLI_COMP, { empty: '—' })),
        h('td', { 'data-label': 'Sabato' }, select([...base, 'livello'], LIVELLI_COMP, { empty: '—' })),
        h('td', { 'data-label': 'Dove' }, field([...base, 'dove'], { ph: 'Es. Cap. 5, Cap. 8', rows: 1 })),
        h('td', { 'data-label': 'Prova' }, field([...base, 'prova'], { ph: 'Es. versione 3 del prompt del Risponditore', rows: 1 })));
    })))),
  sub('Lezioni'),
  fieldsOf(['competenze'], FIELDS.competenzeFinali, { rows: 3 }));
}

export const RENDERERS = { scenario, personas, stories, mockup, agents, prompt, workflow, tests, analisi, etica, competenze };
