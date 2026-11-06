// Compositore a grafo dei workflow (Capitolo 7).
//
// Tela SVG senza librerie: nodi (ingresso, agenti, umano nel ciclo, uscita) e
// frecce. Si trascinano i nodi; si collega trascinando dal pallino a destra di un
// nodo fino a un altro nodo. Cliccando una freccia, l'ispettore mette a confronto
// gli effetti del nodo di partenza con le precondizioni di quello di arrivo.
// Tutto si salva da solo (merge patch per campo), anche con più persone insieme.
// Per tastiera e telefono c'è l'elenco dei collegamenti con i menu.

import * as store from './store.js';
import { h, field, select, checkbox } from './ui.js';
import { items, newId, nextOrd, filled, LIVELLI_UMANO, MODELLI } from './model.js';
import {
  NODE_W, NODE_H, NODE_TIPI, graphOf, graphCheck, layout, freeSpot, buildCatalog, resolveAgent,
  nodeLabel, nodeSub, isExternal, externalRef, readingOrder,
} from './grafo-core.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, v);
  for (const k of kids.flat()) if (k != null) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
};
const short = (t, n = 24) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
/** Sostituisce i figli scartando null e false (replaceChildren li scriverebbe come testo). */
const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));

/** Lo stato dell'editor sopravvive ai ridisegni della sezione. */
const ui = { selected: null, zoom: 1, filter: '', fitted: new Set() };

export function grafoEditor(wfId) {
  const base = ['workflows', wfId];
  const groupId = () => store.state.activeId;
  const doc = () => store.state.doc;
  const wf = () => store.get(base) || {};
  const catalog = () => buildCatalog([...store.state.groups.values()].filter((g) => g.id !== groupId()));
  const ctx = () => ({ doc: doc(), catalog: catalog(), groupId: groupId() });

  const svgWrap = h('div', { class: 'grafo-canvas' });
  const palette = h('aside', { class: 'grafo-palette', 'aria-label': 'Tavolozza dei nodi' });
  const inspector = h('aside', { class: 'grafo-inspector', 'aria-live': 'polite' });
  const checkBox = h('div', { class: 'grafo-check' });
  const linksBox = h('div', { class: 'grafo-links' });
  const readBox = h('div', { class: 'grafo-read' });
  let drag = null; // { id, dx, dy, moved, x, y }
  let link = null; // { from, line }
  let svg;

  // ---- modifiche al documento
  const addNode = (tipo, agente = '') => {
    const id = newId('n');
    const { x, y } = freeSpot(wf(), tipo);
    store.set([...base, 'nodes', id], {
      tipo, agente, x, y, ord: nextOrd(wf().nodes), deleted: false,
      etichetta: tipo === 'input' ? 'Ingresso' : tipo === 'output' ? 'Uscita' : '', livello: '', nota: '',
    });
    ui.selected = { kind: 'node', id };
    redraw(true);
    // porta in vista il nuovo nodo
    svgWrap.querySelector(`[data-node="${id}"] rect`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  };
  const addEdge = (da, a) => {
    if (!da || !a || da === a) return;
    if (graphOf(wf()).edges.some((e) => e.da === da && e.a === a)) return;
    const id = newId('e');
    store.set([...base, 'edges', id], { da, a, condizione: '', ritorno: false, ord: nextOrd(wf().edges), deleted: false });
    ui.selected = { kind: 'edge', id };
    redraw(true);
  };
  const removeSelected = () => {
    const sel = ui.selected;
    if (!sel) return;
    if (sel.kind === 'node') {
      const touching = graphOf(wf()).edges.filter((e) => e.da === sel.id || e.a === sel.id);
      store.setMany([[[...base, 'nodes', sel.id, 'deleted'], true], ...touching.map((e) => [[...base, 'edges', e.id, 'deleted'], true])]);
    } else {
      store.set([...base, 'edges', sel.id, 'deleted'], true);
    }
    ui.selected = null;
    redraw(true);
  };
  const autoLayout = () => {
    const next = layout(wf());
    store.setMany(graphOf(wf()).nodes.map((n) => [[...base, 'nodes', n.id], { x: next.nodes[n.id].x, y: next.nodes[n.id].y }]));
    redraw();
  };

  // ---- disegno
  const pos = (n) => (drag && drag.id === n.id ? { x: drag.x, y: drag.y } : { x: n.x ?? 0, y: n.y ?? 0 });
  function edgePath(a, b, ritorno) {
    const pa = pos(a);
    const pb = pos(b);
    if (ritorno) {
      // il ritorno passa sopra i nodi (come nel PDF)
      const sx = pa.x + NODE_W / 2; const sy = pa.y;
      const tx = pb.x + NODE_W / 2; const ty = pb.y;
      const top = Math.min(sy, ty) - 70;
      return { d: `M${sx},${sy} C${sx},${top} ${tx},${top} ${tx},${ty - 6}`, mx: (sx + tx) / 2, my: top + 16 };
    }
    if (Math.abs(pb.x - pa.x) < NODE_W) {
      // stessa colonna: dall'alto in basso (o viceversa)
      const down = pb.y >= pa.y;
      const sx = pa.x + NODE_W / 2; const sy = down ? pa.y + NODE_H : pa.y;
      const tx = pb.x + NODE_W / 2; const ty = down ? pb.y - 6 : pb.y + NODE_H + 6;
      return { d: `M${sx},${sy} L${tx},${ty}`, mx: (sx + tx) / 2 + 40, my: (sy + ty) / 2 };
    }
    const sx = pa.x + NODE_W; const sy = pa.y + NODE_H / 2;
    const tx = pb.x; const ty = pb.y + NODE_H / 2;
    const c = Math.max(40, Math.abs(tx - sx) / 2);
    return { d: `M${sx},${sy} C${sx + c},${sy} ${tx - c},${ty} ${tx - 6},${ty}`, mx: (sx + tx) / 2, my: (sy + ty) / 2 };
  }

  /** Riduce il grafo per farlo stare tutto nella tela (mai oltre il 100%). */
  function fit() {
    const { nodes } = graphOf(wf());
    const W = Math.max(900, ...nodes.map((n) => (n.x ?? 0) + NODE_W + 60));
    const avail = svgWrap.clientWidth - 28; // margine per la barra di scorrimento
    if (avail > 100) ui.zoom = Math.max(0.45, Math.min(1, avail / W));
    drawSvg();
  }

  function drawSvg() {
    const { nodes, edges } = graphOf(wf());
    const c = ctx();
    const W = Math.max(900, ...nodes.map((n) => pos(n).x + NODE_W + 60));
    const H = Math.max(380, ...nodes.map((n) => pos(n).y + NODE_H + 60));
    const TOP = edges.some((e) => e.ritorno) ? -80 : 0; // spazio sopra solo se ci sono frecce di ritorno
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const sel = ui.selected;
    const el = s('svg', { class: 'grafo-svg', viewBox: `0 ${TOP} ${W} ${H - TOP}`, width: W * ui.zoom, height: (H - TOP) * ui.zoom, tabindex: 0, role: 'img', 'aria-label': `Grafo del workflow con ${nodes.length} nodi e ${edges.length} frecce` },
      s('defs', {},
        s('marker', { id: 'freccia', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, s('path', { d: 'M0,0 L10,5 L0,10 z', class: 'grafo-arrow' })),
        s('marker', { id: 'freccia-sel', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, s('path', { d: 'M0,0 L10,5 L0,10 z', class: 'grafo-arrow sel' }))),
      s('g', { class: 'edges' }, edges.map((e) => {
        const a = byId.get(e.da); const b = byId.get(e.a);
        const { d, mx, my } = edgePath(a, b, e.ritorno);
        const on = sel?.kind === 'edge' && sel.id === e.id;
        const lbl = filled(e.condizione) ? short(e.condizione, 22) : (e.ritorno ? 'ritorno' : '');
        return s('g', { 'data-edge': e.id, class: `edge${e.ritorno ? ' ritorno' : ''}${on ? ' on' : ''}` },
          s('path', { d, class: 'edge-hit' }),
          s('path', { d, class: 'edge-line', 'marker-end': `url(#${on ? 'freccia-sel' : 'freccia'})` }),
          lbl ? s('g', { class: 'edge-label' },
            s('rect', { x: mx - lbl.length * 3.4 - 8, y: my - 11, width: lbl.length * 6.8 + 16, height: 20, rx: 10 }),
            s('text', { x: mx, y: my + 4, 'text-anchor': 'middle' }, lbl)) : null,
          s('title', {}, `${nodeLabel(a, c.doc, c.catalog, c.groupId)} → ${nodeLabel(b, c.doc, c.catalog, c.groupId)}${filled(e.condizione) ? ` (${e.condizione})` : ''}`));
      })),
      s('g', { class: 'nodes' }, nodes.map((n) => {
        const p = pos(n);
        const label = nodeLabel(n, c.doc, c.catalog, c.groupId);
        const ext = n.tipo === 'agente' && isExternal(n.agente);
        const missing = n.tipo === 'agente' && !resolveAgent(n.agente, c.doc, c.catalog, c.groupId);
        const on = sel?.kind === 'node' && sel.id === n.id;
        return s('g', { 'data-node': n.id, transform: `translate(${p.x},${p.y})`, class: `node t-${n.tipo}${ext ? ' ext' : ''}${missing ? ' missing' : ''}${on ? ' on' : ''}` },
          s('rect', { width: NODE_W, height: NODE_H, rx: n.tipo === 'input' || n.tipo === 'output' ? NODE_H / 2 : 12 }),
          s('text', { x: 14, y: 26, class: 'n-title' }, short(label)),
          s('text', { x: 14, y: 46, class: 'n-sub' }, short(nodeSub(n, c.doc, c.catalog, c.groupId), 28)),
          n.tipo !== 'input' ? s('circle', { cx: 0, cy: NODE_H / 2, r: 6, class: 'port in' }) : null,
          n.tipo !== 'output' ? s('circle', { cx: NODE_W, cy: NODE_H / 2, r: 8, class: 'port out', 'data-port': 'out', tabindex: -1 }, s('title', {}, 'Trascinate fino a un altro nodo per collegarli')) : null,
          s('title', {}, `${NODE_TIPI[n.tipo]}: ${label}`));
      })));
    if (svg?.isConnected && link) el.append(link.line);
    svg = el;
    fill(svgWrap, svg);
    bindSvg();
  }

  // ---- interazioni sulla tela
  const toSvg = (e) => {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };
  function bindSvg() {
    svg.addEventListener('pointerdown', (e) => {
      const port = e.target.closest('[data-port="out"]');
      const nodeEl = e.target.closest('[data-node]');
      const edgeEl = e.target.closest('[data-edge]');
      if (port && nodeEl) {
        e.preventDefault();
        const p = toSvg(e);
        link = { from: nodeEl.dataset.node, line: s('line', { x1: p.x, y1: p.y, x2: p.x, y2: p.y, class: 'grafo-temp' }) };
        svg.append(link.line);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
      } else if (nodeEl) {
        e.preventDefault();
        const n = wf().nodes?.[nodeEl.dataset.node];
        const p = toSvg(e);
        drag = { id: nodeEl.dataset.node, dx: p.x - (n.x ?? 0), dy: p.y - (n.y ?? 0), x: n.x ?? 0, y: n.y ?? 0, moved: false };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
      } else if (edgeEl) {
        ui.selected = { kind: 'edge', id: edgeEl.dataset.edge };
        redraw(true);
      } else {
        ui.selected = null;
        redraw(true);
      }
    });
    svg.addEventListener('keydown', (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && ui.selected) { e.preventDefault(); removeSelected(); }
      if (e.key === 'Escape') { ui.selected = null; redraw(true); }
    });
  }
  function onMove(e) {
    const p = toSvg(e);
    if (drag) {
      const x = Math.max(0, Math.round(p.x - drag.dx)); const y = Math.max(0, Math.round(p.y - drag.dy));
      if (Math.abs(x - drag.x) + Math.abs(y - drag.y) > 2) drag.moved = true;
      drag.x = x; drag.y = y;
      // durante il trascinamento ridisegniamo solo la tela, senza salvare
      const keep = svgWrap.scrollLeft;
      drawSvg();
      svgWrap.scrollLeft = keep;
    } else if (link) {
      link.line.setAttribute('x2', p.x);
      link.line.setAttribute('y2', p.y);
    }
  }
  function onUp(e) {
    window.removeEventListener('pointermove', onMove);
    if (drag) {
      const d = drag;
      drag = null;
      if (d.moved) store.setMany([[[...base, 'nodes', d.id, 'x'], d.x], [[...base, 'nodes', d.id, 'y'], d.y]]);
      else ui.selected = { kind: 'node', id: d.id };
      redraw(!d.moved);
    } else if (link) {
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-node]');
      const from = link.from;
      link.line.remove();
      link = null;
      if (target && target.dataset.node !== from) addEdge(from, target.dataset.node);
      else redraw();
    }
  }

  // ---- tavolozza
  function drawPalette() {
    const d = doc();
    const used = new Set(graphOf(wf()).nodes.filter((n) => n.tipo === 'agente').map((n) => n.agente));
    const own = items(d?.agents);
    const q = ui.filter.trim().toLowerCase();
    const others = [...store.state.groups.values()].filter((g) => g.id !== groupId())
      .map((g) => ({ g, list: items(g.data?.agents).filter((a) => !q || [a.nome, a.ruolo, g.name].join(' ').toLowerCase().includes(q)) }))
      .filter((x) => x.list.length);
    const agentBtn = (a, ref, from) => h('button', { type: 'button', class: `pal-agent${used.has(ref) ? ' used' : ''}`, title: `${a.ruolo || ''}${from ? ` — da «${from}»` : ''}`, onclick: () => addNode('agente', ref) },
      h('span', { class: 'pal-name' }, a.nome || 'Agente senza nome'),
      a.socratico ? h('span', { class: 'chip soc' }, 'socratico') : null,
      used.has(ref) ? h('span', { class: 'pal-used', title: 'Già nel grafo' }, '✓') : null);
    const search = h('input', { type: 'search', placeholder: 'Cerca nel catalogo…', value: ui.filter, 'aria-label': 'Cerca un agente nel catalogo',
      oninput: (e) => { ui.filter = e.target.value; drawPalette(); const el = palette.querySelector('input[type=search]'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); } });
    fill(palette, 
      h('h4', {}, 'Nodi'),
      h('div', { class: 'pal-row' },
        h('button', { type: 'button', class: 'pal-node t-input', onclick: () => addNode('input') }, '＋ Ingresso'),
        h('button', { type: 'button', class: 'pal-node t-umano', onclick: () => addNode('umano') }, '＋ Umano nel ciclo'),
        h('button', { type: 'button', class: 'pal-node t-output', onclick: () => addNode('output') }, '＋ Uscita')),
      h('h4', {}, 'Agenti della vostra Task Force'),
      own.length ? h('div', { class: 'pal-list' }, own.map((a) => agentBtn(a, a.id))) : h('p', { class: 'small muted' }, 'Nessun agente: createli nel Capitolo 5.'),
      h('h4', {}, 'Dal catalogo delle altre Task Force'),
      search,
      others.length ? h('div', { class: 'pal-list' }, others.map(({ g, list }) => h('div', { class: 'pal-group' }, h('div', { class: 'pal-gname' }, g.name), list.map((a) => agentBtn(a, externalRef(g.id, a.id), g.name)))))
        : h('p', { class: 'small muted' }, q ? 'Nessun agente trovato.' : 'Le altre Task Force non hanno ancora agenti.'));
  }

  // ---- ispettore
  const agentBox = (title, text) => h('div', { class: 'insp-box' }, h('b', {}, title), h('p', {}, filled(text) ? text : '—'));
  function drawInspector() {
    const sel = ui.selected;
    const w = wf();
    const c = ctx();
    if (!sel || (sel.kind === 'node' ? !w.nodes?.[sel.id] || w.nodes[sel.id].deleted : !w.edges?.[sel.id] || w.edges[sel.id].deleted)) {
      ui.selected = null;
      fill(inspector, h('h4', {}, 'Come si usa'),
        h('ol', { class: 'small' },
          h('li', {}, 'Aggiungete i nodi dalla tavolozza: ingresso, agenti, umano nel ciclo, uscita.'),
          h('li', {}, 'Collegate trascinando dal pallino a destra di un nodo fino al nodo successivo.'),
          h('li', {}, 'Cliccate una freccia per controllare se gli effetti coprono le precondizioni, e per darle una condizione (router).'),
          h('li', {}, 'Le frecce che tornano indietro (il critico che rimanda al produttore) vanno segnate come «ritorno».')));
      return;
    }
    const del = h('button', { class: 'btn ghost danger small-btn', type: 'button', onclick: removeSelected }, sel.kind === 'node' ? 'Elimina il nodo' : 'Elimina la freccia');
    if (sel.kind === 'node') {
      const n = w.nodes[sel.id];
      const p = [...base, 'nodes', sel.id];
      const head = h('div', { class: 'insp-head' }, h('span', { class: `insp-kind t-${n.tipo}` }, NODE_TIPI[n.tipo]), h('b', {}, nodeLabel(n, c.doc, c.catalog, c.groupId)));
      if (n.tipo === 'agente') {
        const r = resolveAgent(n.agente, c.doc, c.catalog, c.groupId);
        const a = r?.agent || {};
        fill(inspector, head,
          r?.external ? h('p', { class: 'small insp-ext' }, `Agente di «${r.group?.name || 'un\'altra Task Force'}», usato per riferimento dal catalogo: se lo modificano, cambia anche qui. Per adattarlo al vostro caso copiatelo nel Capitolo 5.`) : null,
          !r ? h('p', { class: 'small insp-ext' }, "L'agente di questo nodo non esiste più: eliminate il nodo o sostituitelo.") : null,
          filled(a.ruolo) ? h('p', { class: 'small' }, a.ruolo) : null,
          agentBox('Precondizioni', a.precond), agentBox('Effetti', a.effetti),
          a.modello ? h('p', { class: 'small muted' }, `Modello ${MODELLI[a.modello] || a.modello}${a.socratico ? ' · socratico' : ''}`) : null,
          field([...p, 'nota'], { label: 'Cosa fa in questo workflow', ph: 'Es. solo per le richieste «procedura»', rows: 2 }),
          del);
      } else if (n.tipo === 'umano') {
        fill(inspector, head,
          field([...p, 'etichetta'], { label: 'Chi è', ph: 'Es. Segreteria, Orientatrice', multiline: false }),
          select([...p, 'livello'], LIVELLI_UMANO, { label: "L'umano…" }),
          field([...p, 'nota'], { label: 'Cosa fa', ph: 'Es. approva le risposte con importi', rows: 2 }),
          del);
      } else {
        fill(inspector, head,
          field([...p, 'etichetta'], { label: n.tipo === 'input' ? 'Cosa entra' : 'Cosa esce', ph: n.tipo === 'input' ? 'Es. Richiesta della persona' : 'Es. Risposta inviata', multiline: false }),
          del);
      }
      return;
    }
    const e = w.edges[sel.id];
    const a = w.nodes?.[e.da]; const b = w.nodes?.[e.a];
    const eff = (n) => (n?.tipo === 'agente' ? resolveAgent(n.agente, c.doc, c.catalog, c.groupId)?.agent?.effetti : n?.tipo === 'input' ? `Arriva dall'esterno: ${n.etichetta || 'ingresso'}` : n?.tipo === 'umano' ? `Decisione o controllo di ${n.etichetta || 'una persona'}` : '');
    const pre = (n) => (n?.tipo === 'agente' ? resolveAgent(n.agente, c.doc, c.catalog, c.groupId)?.agent?.precond : n?.tipo === 'output' ? 'Fine del workflow' : n?.tipo === 'umano' ? 'Ciò che la persona deve vedere per decidere' : '');
    const p = [...base, 'edges', sel.id];
    fill(inspector, 
      h('div', { class: 'insp-head' }, h('span', { class: 'insp-kind' }, 'Freccia'), h('b', {}, `${nodeLabel(a, c.doc, c.catalog, c.groupId)} → ${nodeLabel(b, c.doc, c.catalog, c.groupId)}`)),
      h('div', { class: 'insp-compare' }, agentBox(`Effetti di «${short(nodeLabel(a, c.doc, c.catalog, c.groupId), 18)}»`, eff(a)), h('span', { class: 'insp-arrow', 'aria-hidden': 'true' }, '→'), agentBox(`Precondizioni di «${short(nodeLabel(b, c.doc, c.catalog, c.groupId), 18)}»`, pre(b))),
      h('p', { class: 'insp-q' }, 'Gli effetti a sinistra coprono le precondizioni a destra? Se no, manca un passo o va cambiato un agente.'),
      field([...p, 'condizione'], { label: 'Condizione', ph: 'Solo per i router: quando si prende questa freccia (es. «categoria = procedura»)', multiline: false }),
      checkbox([...p, 'ritorno'], 'Freccia di ritorno (torna indietro, es. il critico che rimanda al produttore)', { onchange: () => redraw() }),
      del);
  }

  // ---- elenco dei collegamenti (tastiera, telefono, lettori di schermo)
  function drawLinks() {
    const { nodes, edges } = graphOf(wf());
    const c = ctx();
    const name = (id) => nodeLabel(nodes.find((n) => n.id === id) || {}, c.doc, c.catalog, c.groupId);
    const opts = (filter) => [h('option', { value: '' }, '— nodo —'), ...nodes.filter(filter).map((n) => h('option', { value: n.id }, nodeLabel(n, c.doc, c.catalog, c.groupId)))];
    const da = h('select', { 'aria-label': 'Da' }, opts((n) => n.tipo !== 'output'));
    const a = h('select', { 'aria-label': 'A' }, opts((n) => n.tipo !== 'input'));
    fill(linksBox, 
      h('h4', {}, `Collegamenti (${edges.length})`),
      edges.length ? h('ul', {}, edges.map((e) => h('li', {},
        h('button', { type: 'button', class: 'link-sel', onclick: () => { ui.selected = { kind: 'edge', id: e.id }; redraw(true); } },
          `${name(e.da)} → ${name(e.a)}`, filled(e.condizione) ? h('em', {}, ` · ${e.condizione}`) : null, e.ritorno ? h('em', {}, ' · ritorno') : null),
        h('button', { type: 'button', class: 'icon danger', title: 'Elimina la freccia', 'aria-label': 'Elimina la freccia', onclick: () => { ui.selected = { kind: 'edge', id: e.id }; removeSelected(); } }, '✕'))))
        : h('p', { class: 'small muted' }, 'Ancora nessuna freccia.'),
      h('div', { class: 'link-add' }, da, h('span', { 'aria-hidden': 'true' }, '→'), a,
        h('button', { type: 'button', class: 'btn small-btn', onclick: () => addEdge(da.value, a.value) }, 'Collega')));
  }

  function drawCheck() {
    const c = ctx();
    const res = graphCheck(wf(), c);
    fill(checkBox, h('div', { class: 'plan ' + (res.ok ? 'ok' : '') }, h('h3', {}, 'Verifica del grafo'),
      h('ul', {}, res.checks.map((k) => h('li', { class: k.ok ? 'ok' : 'ko' }, h('span', { class: 'mark' }, k.ok ? '✓' : '✕'), k.label, k.detail ? h('small', {}, ' — ' + k.detail) : null)))));
    const steps = readingOrder(wf(), c).filter((r) => r.node.tipo !== 'output');
    fill(readBox, h('h4', {}, 'Il workflow in parole'),
      steps.length ? h('ol', {}, steps.map((r) => h('li', {}, h('b', {}, r.label), r.node.tipo === 'umano' ? ` (${r.sub})` : '',
        r.to.length ? ' → ' + r.to.map((t) => `${t.label}${filled(t.condizione) ? ` se ${t.condizione}` : ''}${t.ritorno ? ' (ritorno)' : ''}`).join('; ') : ' → (nessuna freccia)')))
        : h('p', { class: 'small muted' }, 'Il grafo è vuoto.'));
  }

  function redraw(withInspector = false) {
    if (drag) return;
    drawSvg();
    drawPalette();
    drawLinks();
    drawCheck();
    if (withInspector || !inspector.firstChild) drawInspector();
  }

  // si aggiorna mentre il gruppo lavora (anche dagli altri computer); smette quando la sezione sparisce
  const root = h('div', { class: 'grafo' },
    h('div', { class: 'grafo-toolbar' },
      h('button', { type: 'button', class: 'btn small-btn', onclick: autoLayout, title: 'Mette i nodi in colonne, da sinistra a destra' }, '⇄ Disponi automaticamente'),
      h('span', { class: 'grow' }),
      h('button', { type: 'button', class: 'btn ghost small-btn', title: 'Mostra tutto il grafo nella tela', onclick: fit }, '⤢ Adatta'),
      h('button', { type: 'button', class: 'icon', title: 'Riduci', 'aria-label': 'Riduci', onclick: () => { ui.zoom = Math.max(0.5, ui.zoom - 0.15); drawSvg(); } }, '−'),
      h('button', { type: 'button', class: 'icon', title: 'Ingrandisci', 'aria-label': 'Ingrandisci', onclick: () => { ui.zoom = Math.min(1.6, ui.zoom + 0.15); drawSvg(); } }, '+')),
    h('div', { class: 'grafo-main' }, palette, svgWrap, inspector),
    h('div', { class: 'grafo-under' }, h('div', {}, checkBox, readBox), linksBox));
  const unsubscribe = store.subscribe(({ source }) => {
    if (!root.isConnected) { unsubscribe(); return; }
    if (source === 'local' || source === 'remote' || source === 'groups') {
      const hadSel = ui.selected;
      redraw();
      if (hadSel && !inspector.contains(document.activeElement)) drawInspector();
    }
  });
  redraw(true);
  // la prima volta che si apre un workflow, il grafo si adatta alla tela
  if (!ui.fitted.has(wfId)) requestAnimationFrame(() => { if (root.isConnected) { ui.fitted.add(wfId); fit(); } });
  return root;
}
