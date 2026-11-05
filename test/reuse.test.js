// Test del riuso di agenti tra Task Force.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reuseAgent, reusers } from '../public/js/model.js';
import { groupToMarkdown, bookToMarkdown } from '../server/export.js';
import { exampleDoc } from '../scripts/seed.js';

const source = { id: 'esempio', name: 'Esempio · Onboarding', data: exampleDoc };

test('la copia porta i campi, azzera le versioni e registra la provenienza', () => {
  const orig = { id: 'a_risp', ...exampleDoc.agents.a_risp };
  const copy = reuseAgent(orig, source);
  assert.equal(copy.prompt, orig.prompt);
  assert.equal(copy.socratico, true);
  assert.deepEqual(copy.versioni, []);
  assert.equal(copy.ord, undefined, 'ord lo assegna chi inserisce');
  assert.equal(copy.deleted, undefined);
  assert.deepEqual({ ...copy.origine, at: undefined }, { groupId: 'esempio', groupName: 'Esempio · Onboarding', agentId: 'a_risp', nome: 'Risponditore su procedure', at: undefined });
  copy.domande = 'cambiata';
  assert.notEqual(exampleDoc.agents.a_risp.domande, 'cambiata', 'la copia è indipendente');
});

test('reusers elenca chi ha riusato, ignorando gli agenti eliminati', () => {
  const copy = reuseAgent({ id: 'a_risp', ...exampleDoc.agents.a_risp }, source);
  const g2 = { id: 'g2', name: 'Le Sentinelle', data: { agents: { x: { ...copy, ord: 1 } } } };
  const g3 = { id: 'g3', name: 'Gli Ex', data: { agents: { y: { ...copy, ord: 1, deleted: true } } } };
  assert.deepEqual(reusers([source, g2, g3], 'a_risp'), ['Le Sentinelle']);
});

test("l'export mostra origine, adattamento e 'riusato da' nel registro", () => {
  const copy = { ...reuseAgent({ id: 'a_risp', ...exampleDoc.agents.a_risp }, source), ord: 1, adattamento: 'Wiki → protocolli di reparto' };
  const g2 = { id: 'g2', name: 'Le Sentinelle', data: { settore: 'Cura e salute', agents: { x: copy } } };
  const md = groupToMarkdown(g2);
  assert.match(md, /\| Origine \| riusato da Risponditore su procedure di «Esempio · Onboarding» \|/);
  assert.match(md, /\| Cosa abbiamo adattato \| Wiki → protocolli di reparto \|/);
  const book = bookToMarkdown([source, g2]);
  assert.match(book, /\| Risponditore su procedure \| .* \| Esempio · Onboarding \| Medio \| sì \| .* \| — \| Le Sentinelle \|$/m);
});
