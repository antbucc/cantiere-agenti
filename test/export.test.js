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

test('il workflow elenca i passi e la verifica del piano', () => {
  const md = groupToMarkdown(group);
  assert.match(md, /1\. 🤖 \*\*Smistatore\*\* — precondizioni da: input umano iniziale/);
  assert.match(md, /2\. 🤖 \*\*Risponditore su procedure\*\* — precondizioni da: passo 1/);
  assert.match(md, /4\. 👤 \*\*Umano nel ciclo\*\* — È informato/);
  assert.match(md, /✅ Ogni precondizione è coperta/);
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

test('il libro: una parte per Task Force in ordine di settore, registro e lezioni in appendice', () => {
  const other = { id: 'g2', name: 'Le Sentinelle', data: { titolo: 'Triage', settore: 'Cura e salute', competenze: { lezioni: 'Meno agenti.' } } };
  const md = bookToMarkdown([group, other]);
  const md2 = bookToMarkdown([other, group]); // l'ordine di inserimento non conta: decide il settore
  assert.equal(md2, md.replace(/\*Generato il [^*]*\*/, (m) => m));
  assert.match(md, /- \*\*Amministrazione e servizi\*\*\n  - Parte 1 · Il primo mese senza panico/);
  assert.match(md, /^# Parte 1 · Il primo mese senza panico$/m);
  assert.match(md, /^# Parte 2 · Triage$/m);
  assert.ok(md.indexOf('# Parte 1 ·') < md.indexOf('# Parte 2 ·'));
  assert.equal([...md.matchAll(/^## Capitolo 11 · Competenze e lezioni$/gm)].length, 2);
  assert.match(md, /^# Appendice A · Registro degli agenti$/m);
  assert.match(md, /\| Smistatore \| .* \| Esempio · Onboarding \| Piccolo \| no \|/);
  assert.match(md, /\| Risponditore su procedure \| .* \| sì \|/);
  assert.match(md, /^# Appendice B · Lezioni apprese$/m);
  assert.match(md, /## Le Sentinelle\n\n\*\*Lezioni\.\*\* Meno agenti\./);
});
