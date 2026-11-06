// Test dell'export Markdown (capitolo e libro).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupToMarkdown, bookToMarkdown, cell } from '../server/export.js';
import { exampleDoc } from '../scripts/seed.js';

const group = { id: 'g1', name: 'Esempio · Onboarding', data: exampleDoc };

test('il capitolo ha titolo, autori, sintesi e 11 capitoli numerati', () => {
  const md = groupToMarkdown(group);
  assert.match(md, /^# Il primo mese senza panico$/m);
  assert.match(md, /\*\*Autori:\*\* Anna, Bruno, Chiara, Davide/);
  assert.match(md, /> \*\*In due frasi\.\*\* /);
  const sections = [...md.matchAll(/^## Capitolo (\d+) · /gm)].map((m) => Number(m[1]));
  assert.deepEqual(sections, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

test('user stories, test, etica e competenze sono tabelle', () => {
  const md = groupToMarkdown(group);
  assert.match(md, /\| # \| Come… \| voglio… \| per… \|/);
  assert.match(md, /\| 4 \| P1 Giulia.* \| sì \|/); // la storia negativa
  assert.match(md, /\| 2 \| Limite \| .* \| Fallito \| 2 \|/);
  assert.match(md, /\| 10 \| C'è un caso in cui la risposta giusta è non usare l'AI\?/);
  assert.match(md, /\| C3 Progettazione \| Iniziale \| Intermedio \|/);
});

test('ogni agente ha il prompt completo in un blocco di codice e la storia delle versioni', () => {
  const md = groupToMarkdown(group);
  assert.match(md, /```text\nSei lo Smistatore dello studio\./);
  assert.match(md, /Rispondi solo in JSON: \{"categoria"/);
  assert.match(md, /- \*\*v2\*\* \(.*\) — Classificava come "procedura"/);
});

test('la parte da sola: schede degli agenti, workflow con diagramma Mermaid e verifica del grafo', () => {
  const md = groupToMarkdown(group);
  assert.match(md, /^### Smistatore$/m);
  assert.match(md, /nei workflow: «Domande dei nuovi assunti»/);
  assert.match(md, /^### Domande dei nuovi assunti$/m);
  assert.match(md, /```mermaid\nflowchart LR\n/);
  assert.match(md, /n2 -->\|"procedura"\| n3/);
  assert.match(md, /2\. 🤖 \*\*Smistatore\*\*: Etichetta e domanda ripulita → Risponditore su procedure se procedura; Esperto dello studio se cliente o fuori ambito/);
  assert.match(md, /👤 \*\*Tutor\*\* — È informato/);
  assert.match(md, /✅ Ogni passo riceve ciò che gli serve/);
});

test('le celle non rompono la tabella', () => {
  assert.equal(cell('a | b\nc'), 'a \\| b<br>c');
  assert.equal(cell(''), '—');
});

test('un capitolo vuoto non va in errore', () => {
  const md = groupToMarkdown({ name: 'Vuoto', data: {} });
  assert.match(md, /^# Vuoto$/m);
  assert.match(md, /\*Nessuna persona\.\*/);
});

test('i prompt con backtick usano un recinto più lungo', () => {
  const data = { agents: { a: { ord: 1, nome: 'X', prompt: 'usa ```json``` per rispondere' } } };
  const md = groupToMarkdown({ name: 'T', data });
  assert.match(md, /````text\nusa ```json``` per rispondere\n````/);
});

test('il libro: Parte I catalogo, Parte II workflow, poi le Task Force in ordine di settore', async () => {
  const { EXAMPLES } = await import('../scripts/seed.js');
  const gs = EXAMPLES.map(({ id, name, data }) => ({ id, name, data }));
  const md = bookToMarkdown([gs[1], gs[0]]); // l'ordine di inserimento non conta: decide il settore
  const parts = [...md.matchAll(/^# (Parte [IVX]+ · .*|Appendice [AB] · .*)$/gm)].map((m) => m[1]);
  assert.deepEqual(parts, [
    'Parte I · Catalogo degli agenti', 'Parte II · I workflow',
    'Parte III · Il primo mese senza panico', 'Parte IV · Lo sportello che fa domande',
    'Appendice A · Registro degli agenti', 'Appendice B · Lezioni apprese',
  ]);
  const i = (t) => md.indexOf(t);
  assert.ok(i('## Gli agenti di «Esempio · Onboarding»') < i('## Gli agenti di «Esempio · Orientamento»'));
  assert.ok(i('# Parte I ·') < i('### Smistatore') && i('### Smistatore') < i('# Parte II ·'), 'le schede stanno nel catalogo');
  assert.match(md, /^## Registro settimanale delle domande · Esempio · Orientamento$/m);
  // il Registratore dell'Onboarding è usato anche dall'Orientamento, per riferimento
  assert.match(md, /nei workflow: «Domande dei nuovi assunti», «Registro settimanale delle domande» \(Esempio · Orientamento\)/);
  assert.match(md, /🤖 \*\*Registratore\*\* \*\(dal catalogo · Esempio · Onboarding\)\*/);
  // nelle parti delle Task Force i capitoli 5–7 rimandano alle Parti I e II
  const parteIII = md.slice(i('# Parte III ·'), i('# Parte IV ·'));
  assert.match(parteIII, /Le schede complete sono nella \*\*Parte I · Catalogo degli agenti\*\*/);
  assert.match(parteIII, /I diagrammi e la verifica sono nella \*\*Parte II · I workflow\*\*/);
  assert.doesNotMatch(parteIII, /```mermaid/);
  assert.equal([...md.matchAll(/^## Capitolo 11 · Competenze e lezioni$/gm)].length, 2);
  assert.match(md, /\| Registratore \| .* \| Esempio · Onboarding \| Piccolo \| no \| .* \| Domande dei nuovi assunti, Registro settimanale delle domande \(Esempio · Orientamento\) \|/);
  assert.match(md, /## Esempio · Orientamento\n\n\*\*Lezioni\.\*\* 1\. L'agente più utile/);
});

