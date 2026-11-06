// Test del modello a grafo dei workflow (grafo-core.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  workflowsOf, migrateLegacy, graphOf, graphCheck, layout, topoOrder, readingOrder, toMermaid,
  buildCatalog, resolveAgent, unusedAgents, usedIn, freeSpot, LEGACY_ID,
} from '../public/js/grafo-core.js';

const agents = { a1: { ord: 1, nome: 'Smistatore', precond: 'una domanda', effetti: 'una categoria' }, a2: { ord: 2, nome: 'Risponditore' } };

test('il vecchio workflow lineare diventa un grafo con lo stesso significato', () => {
  const doc = {
    agents,
    workflow: {
      pattern: 'pipeline', motivazione: 'semplice',
      steps: {
        s1: { ord: 1, tipo: 'agente', agente: 'a1', soddisfatta: 'input' },
        s2: { ord: 2, tipo: 'agente', agente: 'a2', soddisfatta: 's1' },
        s3: { ord: 3, tipo: 'umano', livello: 'approva' },
      },
    },
  };
  const [wf] = workflowsOf(doc);
  assert.equal(wf.id, LEGACY_ID);
  assert.equal(wf.legacy, true);
  assert.equal(wf.pattern, 'pipeline');
  const order = readingOrder(wf, { doc }).map((r) => r.label);
  assert.deepEqual(order, ['Ingresso', 'Smistatore', 'Risponditore', 'Umano nel ciclo', 'Uscita']);
  assert.ok(graphCheck(wf, { doc }).ok);
  assert.ok(Object.values(wf.nodes).every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)), 'ha già le posizioni');
  assert.deepEqual(workflowsOf({ agents }), [], 'documento senza workflow');
  assert.equal(workflowsOf({ ...doc, workflows: { w: { ord: 1, nome: 'nuovo', nodes: {}, edges: {} } } })[0].id, 'w', 'i workflow nuovi hanno la precedenza');
  assert.ok(migrateLegacy(doc).nodes.n_output);
});

const wfBase = () => ({
  nodes: {
    i: { tipo: 'input', x: 0, y: 0 }, s: { tipo: 'agente', agente: 'a1', x: 240, y: 0 },
    r: { tipo: 'agente', agente: 'a2', x: 480, y: 0 }, u: { tipo: 'umano', livello: 'decide', x: 480, y: 100 }, o: { tipo: 'output', x: 720, y: 0 },
  },
  edges: {
    e1: { da: 'i', a: 's' }, e2: { da: 's', a: 'r', condizione: 'procedura' }, e3: { da: 's', a: 'u', condizione: 'cliente' },
    e4: { da: 'r', a: 'o' }, e5: { da: 'u', a: 'o' },
  },
});

test('la verifica del grafo trova i problemi tipici', () => {
  const doc = { agents };
  assert.ok(graphCheck(wfBase(), { doc }).ok);
  const fail = (mutate, label) => {
    const wf = wfBase(); mutate(wf);
    const bad = graphCheck(wf, { doc }).checks.filter((c) => !c.ok).map((c) => c.label);
    assert.ok(bad.includes(label), `${label} — trovati: ${bad.join(' | ')}`);
  };
  fail((wf) => { delete wf.edges.e3.condizione; }, 'Le uscite di un router hanno una condizione');
  fail((wf) => { wf.edges.e1.deleted = true; }, 'Ogni passo riceve ciò che gli serve (precondizioni coperte)');
  fail((wf) => { wf.nodes.u.deleted = true; }, "Almeno un passo con l'umano nel ciclo");
  fail((wf) => { wf.edges.x = { da: 'r', a: 's' }; }, 'Nessun ciclo nascosto');
  fail((wf) => { wf.nodes.s.agente = 'sparito'; }, 'Ogni nodo agente ha il suo agente');
  fail((wf) => { wf.nodes.o.deleted = true; }, "C'è un ingresso e un'uscita");
  // il ciclo segnato come ritorno va bene
  const wf = wfBase(); wf.edges.x = { da: 'r', a: 's', ritorno: true };
  assert.ok(graphCheck(wf, { doc }).ok);
  assert.equal(topoOrder(wf).cycle, false);
});

test('disposizione automatica a colonne e ordine di lettura', () => {
  const wf = wfBase();
  for (const n of Object.values(wf.nodes)) { delete n.x; delete n.y; }
  const l = layout(wf);
  const x = (id) => l.nodes[id].x;
  assert.ok(x('i') < x('s') && x('s') < x('r') && x('r') < x('o'));
  assert.equal(x('r'), x('u'), 'i due rami del router nella stessa colonna');
  assert.notEqual(l.nodes.r.y, l.nodes.u.y);
  const spot = freeSpot(l, 'agente');
  assert.ok(Number.isFinite(spot.x) && Number.isFinite(spot.y));
});

test('agenti dal catalogo: riferimento, verifica, uso e Mermaid', () => {
  const g1 = { id: 'g1', name: 'Alfa', data: { agents } };
  const wf = wfBase(); wf.nodes.r.agente = 'g1/a2';
  const g2 = { id: 'g2', name: 'Beta', data: { agents: {}, workflows: { w: { ord: 1, nome: 'Misto', ...wf, nodes: { ...wf.nodes, s: { ...wf.nodes.s, agente: 'g1/a1' } } } } } };
  const catalog = buildCatalog([g1, g2]);
  assert.equal(resolveAgent('g1/a2', g2.data, catalog, 'g2').agent.nome, 'Risponditore');
  assert.equal(resolveAgent('g1/a2', g2.data, null, 'g2').unknown, true, 'senza catalogo non si può verificare');
  assert.equal(resolveAgent('g1/zzz', g2.data, catalog, 'g2'), null);
  assert.ok(graphCheck(g2.data.workflows.w, { doc: g2.data, catalog, groupId: 'g2' }).ok);
  assert.deepEqual(usedIn([g1, g2], 'g1', 'a2').map((x) => x.group.name), ['Beta']);
  assert.deepEqual(unusedAgents(g1.data, 'g1').map((a) => a.nome), ['Smistatore', 'Risponditore'], 'Alfa non ha workflow');
  const mm = toMermaid(g2.data.workflows.w, { doc: g2.data, catalog, groupId: 'g2' });
  assert.match(mm, /^flowchart LR/);
  assert.match(mm, /\["Risponditore<br\/><small>dal catalogo · Alfa<\/small>"\]/);
  assert.match(mm, /-->\|"cliente"\|/);
  assert.match(mm, /\{\{"Umano nel ciclo<br\/><small>Decide<\/small>"\}\}/);
});

test('frecce verso nodi eliminati o verso sé stessi vengono ignorate', () => {
  const wf = wfBase();
  wf.edges.bad1 = { da: 's', a: 'manca' };
  wf.edges.bad2 = { da: 's', a: 's' };
  assert.equal(graphOf(wf).edges.length, 5);
});
