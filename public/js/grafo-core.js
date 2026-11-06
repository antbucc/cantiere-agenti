// Workflow come grafo, condiviso tra browser (compositore) e server (export, guida).
//
// Un documento ha più workflow in doc.workflows{id}. Ogni workflow ha i campi
// testuali (pattern, motivazione, …) e un grafo:
//   nodes{id}: { tipo: 'input' | 'agente' | 'umano' | 'output', agente, livello, etichetta, nota, x, y }
//   edges{id}: { da, a, condizione, ritorno }
// Una freccia da A a B significa: gli effetti di A soddisfano le precondizioni di B.
// `condizione` etichetta le uscite di un router; `ritorno` segna le frecce che
// tornano indietro (es. il critico che rimanda al produttore).
//
// Il campo `agente` di un nodo è l'id di un agente della stessa Task Force, oppure
// "<groupId>/<agentId>" per un agente preso dal catalogo di un'altra Task Force.
//
// I vecchi documenti hanno un solo workflow lineare in doc.workflow{steps}:
// workflowsOf() lo converte al volo in un grafo, senza bisogno di migrare il DB.

import { items, filled, LIVELLI_UMANO } from './model.js';

export const NODE_W = 180;
export const NODE_H = 64;
const GAP_X = 240;
const GAP_Y = 100;
const MARGIN = 30;

export const NODE_TIPI = { input: 'Ingresso', agente: 'Agente', umano: 'Umano nel ciclo', output: 'Uscita' };
export const WORKFLOW_FIELDS = ['pattern', 'motivazione', 'alternativa', 'ultimo', 'togliere', 'nonso', 'approvazione'];
export const LEGACY_ID = 'w_principale';

// ---------------------------------------------------------------------------
// Workflow del documento (con conversione dei vecchi workflow lineari)
// ---------------------------------------------------------------------------

/** Vero se il vecchio workflow lineare ha qualcosa dentro. */
function legacyHasContent(doc) {
  const w = doc?.workflow;
  return Boolean(w && (items(w.steps).length || WORKFLOW_FIELDS.some((k) => filled(w[k]))));
}

/** Converte il vecchio workflow lineare in un workflow a grafo (stesso significato). */
export function migrateLegacy(doc) {
  const w = doc.workflow || {};
  const steps = items(w.steps);
  const nodes = { n_input: { tipo: 'input', etichetta: 'Ingresso', ord: 0 } };
  const edges = {};
  const nodeOf = (stepId) => `n_${stepId}`;
  let e = 0;
  const edge = (da, a) => { edges[`e_${++e}`] = { da, a, ord: e }; };
  steps.forEach((s, i) => {
    const id = nodeOf(s.id);
    nodes[id] = s.tipo === 'umano'
      ? { tipo: 'umano', livello: s.livello || '', etichetta: '', nota: s.nota || '', ord: i + 1 }
      : { tipo: 'agente', agente: s.agente || '', nota: s.nota || '', ord: i + 1 };
    const prev = i === 0 ? 'n_input' : nodeOf(steps[i - 1].id);
    if (s.tipo === 'agente' && s.soddisfatta === 'input') edge('n_input', id);
    else if (s.tipo === 'agente' && steps.some((x) => x.id === s.soddisfatta)) edge(nodeOf(s.soddisfatta), id);
    else edge(prev, id);
  });
  nodes.n_output = { tipo: 'output', etichetta: 'Uscita', ord: steps.length + 1 };
  // i nodi senza uscite portano all'uscita
  const hasOut = new Set(Object.values(edges).map((x) => x.da));
  for (const id of Object.keys(nodes)) if (id !== 'n_output' && !hasOut.has(id) && (id !== 'n_input' || !steps.length)) edge(id, 'n_output');
  const wf = { nome: 'Workflow principale', ord: 1, deleted: false, nodes, edges };
  for (const k of [...WORKFLOW_FIELDS, 'passi', 'dsl', 'screenshot']) if (w[k] !== undefined) wf[k] = w[k];
  return layout(wf);
}

/** I workflow del documento, come lista ordinata { id, ...wf }. */
export function workflowsOf(doc) {
  const list = items(doc?.workflows);
  if (list.length || !legacyHasContent(doc)) return list;
  return [{ id: LEGACY_ID, ...migrateLegacy(doc), legacy: true }];
}

/** Nodi e frecce validi di un workflow (frecce con estremi esistenti). */
export function graphOf(wf) {
  const nodes = items(wf?.nodes);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = items(wf?.edges).filter((e) => ids.has(e.da) && ids.has(e.a) && e.da !== e.a);
  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Agenti nei nodi: della Task Force o dal catalogo
// ---------------------------------------------------------------------------

export const isExternal = (ref) => typeof ref === 'string' && ref.includes('/');
export const externalRef = (groupId, agentId) => `${groupId}/${agentId}`;

/** Catalogo di tutti gli agenti: Map "<groupId>/<agentId>" → { agent, group }. */
export function buildCatalog(groups) {
  const map = new Map();
  for (const g of groups || []) for (const a of items(g.data?.agents)) map.set(externalRef(g.id, a.id), { agent: a, group: g });
  return map;
}

/**
 * Risolve il riferimento di un nodo: { agent, group, external } oppure null.
 * Senza catalogo, un riferimento esterno non si può verificare: restituisce
 * { agent: null, external: true } (cioè "non si sa").
 */
export function resolveAgent(ref, doc, catalog, ownGroupId) {
  if (!ref) return null;
  if (isExternal(ref)) {
    const [g, a] = ref.split('/');
    if (g === ownGroupId) return resolveAgent(a, doc, catalog, ownGroupId);
    if (!catalog) return { agent: null, group: null, external: true, unknown: true };
    const hit = catalog.get(ref);
    return hit ? { ...hit, external: true } : null;
  }
  const a = doc?.agents?.[ref];
  return a && !a.deleted ? { agent: { id: ref, ...a }, group: null, external: false } : null;
}

/** Etichetta leggibile di un nodo. */
export function nodeLabel(node, doc, catalog, ownGroupId) {
  if (node.tipo === 'agente') {
    const r = resolveAgent(node.agente, doc, catalog, ownGroupId);
    if (!r) return node.agente ? 'Agente non trovato' : 'Agente da scegliere';
    return r.agent?.nome || (r.unknown ? 'Agente dal catalogo' : 'Agente senza nome');
  }
  if (node.tipo === 'umano') return node.etichetta || 'Umano nel ciclo';
  return node.etichetta || NODE_TIPI[node.tipo] || node.tipo;
}

/** Sotto-etichetta di un nodo (livello dell'umano, Task Force d'origine). */
export function nodeSub(node, doc, catalog, ownGroupId) {
  if (node.tipo === 'umano') return LIVELLI_UMANO[node.livello] || 'livello da scegliere';
  if (node.tipo === 'agente') {
    const r = resolveAgent(node.agente, doc, catalog, ownGroupId);
    if (r?.external) return r.group ? `dal catalogo · ${r.group.name}` : 'dal catalogo';
    return r?.agent?.socratico ? 'agente socratico' : 'agente';
  }
  return NODE_TIPI[node.tipo];
}

// ---------------------------------------------------------------------------
// Ordine, raggiungibilità, disposizione automatica
// ---------------------------------------------------------------------------

function adjacency(nodes, edges, { skipReturn = true } = {}) {
  const out = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) if (!(skipReturn && e.ritorno)) out.get(e.da)?.push(e.a);
  return out;
}

function reachableFrom(starts, out) {
  const seen = new Set(starts);
  const stack = [...starts];
  while (stack.length) for (const n of out.get(stack.pop()) || []) if (!seen.has(n)) { seen.add(n); stack.push(n); }
  return seen;
}

/** Ordine di lettura del grafo (topologico, ignorando le frecce di ritorno). Restituisce anche se c'è un ciclo. */
export function topoOrder(wf) {
  const { nodes, edges } = graphOf(wf);
  const out = adjacency(nodes, edges);
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const [, list] of out) for (const b of list) indeg.set(b, indeg.get(b) + 1);
  const rank = (n) => ({ input: 0, agente: 1, umano: 1, output: 2 }[n.tipo] ?? 1);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const queue = nodes.filter((n) => indeg.get(n.id) === 0).sort((a, b) => rank(a) - rank(b) || (a.y ?? 0) - (b.y ?? 0));
  const order = [];
  while (queue.length) {
    const n = queue.shift();
    order.push(n);
    for (const b of out.get(n.id)) {
      indeg.set(b, indeg.get(b) - 1);
      if (indeg.get(b) === 0) queue.push(byId.get(b));
    }
  }
  const cycle = order.length < nodes.length;
  for (const n of nodes) if (!order.includes(n)) order.push(n);
  return { order, cycle };
}

/** Disposizione automatica a livelli, da sinistra a destra. Restituisce il workflow con x, y aggiornati. */
export function layout(wf) {
  const { nodes, edges } = graphOf(wf);
  const { order } = topoOrder(wf);
  const level = new Map();
  for (const n of order) {
    const preds = edges.filter((e) => !e.ritorno && e.a === n.id).map((e) => level.get(e.da)).filter((x) => x !== undefined);
    level.set(n.id, n.tipo === 'input' ? 0 : preds.length ? Math.max(...preds) + 1 : (n.tipo === 'output' ? 1 : 0));
  }
  const maxLevel = Math.max(0, ...level.values());
  for (const n of nodes) if (n.tipo === 'output') level.set(n.id, Math.max(level.get(n.id), maxLevel));
  // in ogni colonna, i nodi in ordine di "baricentro" dei predecessori: meno incroci
  const rows = new Map();
  const rowOf = new Map();
  const next = { ...wf, nodes: { ...wf.nodes } };
  const levels = [...new Set(order.map((n) => level.get(n.id)))].sort((a, b) => a - b);
  for (const l of levels) {
    const col = order.filter((n) => level.get(n.id) === l);
    const bary = (n) => {
      const preds = edges.filter((e) => !e.ritorno && e.a === n.id && rowOf.has(e.da)).map((e) => rowOf.get(e.da));
      return preds.length ? preds.reduce((a, b) => a + b, 0) / preds.length : order.indexOf(n);
    };
    col.sort((a, b) => bary(a) - bary(b));
    col.forEach((n, r) => {
      rowOf.set(n.id, r);
      next.nodes[n.id] = { ...wf.nodes[n.id], x: MARGIN + l * GAP_X, y: MARGIN + r * GAP_Y };
    });
    rows.set(l, col.length);
  }
  // centra verticalmente le colonne più corte
  const tallest = Math.max(1, ...rows.values());
  for (const n of nodes) {
    const l = level.get(n.id);
    const offset = ((tallest - rows.get(l)) * GAP_Y) / 2;
    next.nodes[n.id] = { ...next.nodes[n.id], y: next.nodes[n.id].y + offset };
  }
  return next;
}

/**
 * Punto libero per un nuovo nodo, in vista: l'uscita va a destra di tutto; gli
 * altri nodi sotto l'ultima colonna di lavoro (prima dell'uscita), dove c'è spazio.
 */
export function freeSpot(wf, tipo) {
  const { nodes } = graphOf(wf);
  if (!nodes.length) return { x: MARGIN, y: MARGIN };
  const maxY = Math.max(...nodes.map((n) => n.y ?? 0));
  if (tipo === 'output') return { x: Math.max(...nodes.map((n) => n.x ?? 0)) + GAP_X, y: MARGIN };
  if (tipo === 'input') return { x: MARGIN, y: maxY + GAP_Y };
  const work = nodes.filter((n) => n.tipo !== 'output');
  const lastX = Math.max(...work.map((n) => n.x ?? 0));
  const col = work.filter((n) => (n.x ?? 0) === lastX);
  // una colonna nuova, a destra dell'ultima di lavoro, se quella è piena o è la colonna dell'ingresso
  if (col.length >= 4 || col.every((n) => n.tipo === 'input')) {
    const x = lastX + GAP_X;
    const busy = nodes.filter((n) => (n.x ?? 0) === x);
    return { x, y: busy.length ? Math.max(...busy.map((n) => n.y ?? 0)) + GAP_Y : MARGIN };
  }
  return { x: lastX, y: Math.max(...col.map((n) => n.y ?? 0)) + GAP_Y };
}

// ---------------------------------------------------------------------------
// Verifica del grafo
// ---------------------------------------------------------------------------

/**
 * Verifica un workflow. Restituisce { checks: [{ ok, label, detail }], ok }.
 * catalog (facoltativo) serve a controllare gli agenti presi da altre Task Force.
 */
export function graphCheck(wf, { doc, catalog, groupId } = {}) {
  const { nodes, edges } = graphOf(wf);
  const name = (n) => nodeLabel(n, doc, catalog, groupId);
  const inputs = nodes.filter((n) => n.tipo === 'input');
  const outputs = nodes.filter((n) => n.tipo === 'output');
  const work = nodes.filter((n) => n.tipo === 'agente' || n.tipo === 'umano');
  const out = adjacency(nodes, edges);
  const reached = reachableFrom(inputs.map((n) => n.id), out);
  const incoming = new Set(edges.filter((e) => !e.ritorno).map((e) => e.a));

  const orphans = work.filter((n) => !incoming.has(n.id) || !reached.has(n.id)).map(name);
  const routers = nodes.filter((n) => edges.filter((e) => e.da === n.id && !e.ritorno).length >= 2);
  const unlabeled = routers.filter((n) => edges.some((e) => e.da === n.id && !e.ritorno && !filled(e.condizione))).map(name);
  const missingAgents = nodes.filter((n) => n.tipo === 'agente' && (!n.agente || !resolveAgent(n.agente, doc, catalog, groupId))).length;
  const { cycle } = topoOrder(wf);

  const checks = [
    { ok: inputs.length >= 1 && outputs.length >= 1, label: "C'è un ingresso e un'uscita", detail: '' },
    { ok: work.length >= 2, label: 'Almeno due passi', detail: '' },
    { ok: work.length > 0 && orphans.length === 0, label: 'Ogni passo riceve ciò che gli serve (precondizioni coperte)', detail: orphans.length ? `Senza freccia in entrata dall'ingresso: ${orphans.join(', ')}` : '' },
    { ok: outputs.some((o) => reached.has(o.id)), label: "Dall'ingresso si arriva all'uscita", detail: '' },
    { ok: work.some((n) => n.tipo === 'umano'), label: 'Almeno un passo con l\'umano nel ciclo', detail: '' },
    { ok: !cycle, label: 'Nessun ciclo nascosto', detail: cycle ? 'Le frecce che tornano indietro vanno segnate come «ritorno»' : '' },
    { ok: unlabeled.length === 0, label: 'Le uscite di un router hanno una condizione', detail: unlabeled.length ? `Da completare: ${unlabeled.join(', ')}` : '' },
    { ok: missingAgents === 0, label: 'Ogni nodo agente ha il suo agente', detail: missingAgents ? `${missingAgents} nodi senza agente (o con un agente eliminato)` : '' },
  ];
  return { checks, ok: checks.every((c) => c.ok) };
}

/** Agenti della Task Force che non compaiono in nessun workflow. */
export function unusedAgents(doc, groupId) {
  const used = new Set();
  for (const wf of workflowsOf(doc)) {
    for (const n of graphOf(wf).nodes) {
      if (n.tipo !== 'agente' || !n.agente) continue;
      if (!isExternal(n.agente)) used.add(n.agente);
      else if (groupId && n.agente.startsWith(`${groupId}/`)) used.add(n.agente.split('/')[1]);
    }
  }
  return items(doc?.agents).filter((a) => !used.has(a.id));
}

/** In quali workflow (di tutte le Task Force) compare un agente: [{ group, wf }]. */
export function usedIn(groups, groupId, agentId) {
  const out = [];
  for (const g of groups || []) {
    for (const wf of workflowsOf(g.data)) {
      const hit = graphOf(wf).nodes.some((n) => n.tipo === 'agente'
        && ((g.id === groupId && n.agente === agentId) || n.agente === externalRef(groupId, agentId)));
      if (hit) out.push({ group: g, wf });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Testo e diagrammi per l'export
// ---------------------------------------------------------------------------

/** Il workflow raccontato passo per passo: [{ node, label, sub, from: [...], to: [...] }]. */
export function readingOrder(wf, ctx = {}) {
  const { edges } = graphOf(wf);
  const { order } = topoOrder(wf);
  const label = (n) => nodeLabel(n, ctx.doc, ctx.catalog, ctx.groupId);
  const byId = new Map(order.map((n) => [n.id, n]));
  return order.map((n) => ({
    node: n,
    label: label(n),
    sub: nodeSub(n, ctx.doc, ctx.catalog, ctx.groupId),
    to: edges.filter((e) => e.da === n.id).map((e) => ({ label: label(byId.get(e.a)), condizione: e.condizione, ritorno: Boolean(e.ritorno) })),
  }));
}

/** Diagramma Mermaid (GitHub lo mostra come disegno). */
export function toMermaid(wf, ctx = {}) {
  const { nodes, edges } = graphOf(wf);
  const id = new Map(nodes.map((n, i) => [n.id, `n${i + 1}`]));
  const esc = (t) => String(t || '').replace(/"/g, '#quot;').replace(/[\n\r]+/g, ' ');
  const lines = ['flowchart LR'];
  for (const n of nodes) {
    const t = esc(nodeLabel(n, ctx.doc, ctx.catalog, ctx.groupId));
    const sub = n.tipo === 'umano' || (n.tipo === 'agente' && isExternal(n.agente)) ? `<br/><small>${esc(nodeSub(n, ctx.doc, ctx.catalog, ctx.groupId))}</small>` : '';
    const shape = { input: ['(["', '"])'], output: ['(["', '"])'], umano: ['{{"', '"}}'], agente: ['["', '"]'] }[n.tipo] || ['["', '"]'];
    lines.push(`  ${id.get(n.id)}${shape[0]}${t}${sub}${shape[1]}`);
  }
  for (const e of edges) {
    const arrow = e.ritorno ? '-.->' : '-->';
    lines.push(`  ${id.get(e.da)} ${arrow}${filled(e.condizione) ? `|"${esc(e.condizione)}"|` : ''} ${id.get(e.a)}`);
  }
  return lines.join('\n');
}

