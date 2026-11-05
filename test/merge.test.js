// Test del JSON merge patch (RFC 7386) usato per il salvataggio concorrente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePatch, patchFromPath } from '../public/js/merge.js';

test('unisce oggetti annidati senza toccare i campi non nominati', () => {
  const doc = { titolo: 'A', personas: { p1: { nome: 'Giulia', tipo: 'utente' } } };
  const out = mergePatch(doc, { personas: { p1: { tipo: 'toccata' } } });
  assert.deepEqual(out, { titolo: 'A', personas: { p1: { nome: 'Giulia', tipo: 'toccata' } } });
});

test('null rimuove la chiave', () => {
  assert.deepEqual(mergePatch({ a: 1, b: 2 }, { a: null }), { b: 2 });
});

test('gli array vengono sostituiti, non uniti', () => {
  assert.deepEqual(mergePatch({ v: [1, 2] }, { v: [3] }), { v: [3] });
});

test('una patch non oggetto sostituisce il valore', () => {
  assert.equal(mergePatch({ a: 1 }, 'x'), 'x');
  assert.deepEqual(mergePatch('x', { a: 1 }), { a: 1 });
});

test('non modifica gli argomenti', () => {
  const doc = { a: { b: 1 } };
  const patch = { a: { c: 2 } };
  mergePatch(doc, patch);
  assert.deepEqual(doc, { a: { b: 1 } });
  assert.deepEqual(patch, { a: { c: 2 } });
});

test('due membri che scrivono campi diversi non si sovrascrivono', () => {
  let server = { stories: {} };
  const anna = patchFromPath(['stories', 's1', 'voglio'], 'chiedere una procedura');
  const bruno = patchFromPath(['stories', 's1', 'per'], 'non disturbare');
  const chiara = patchFromPath(['personas', 'p9', 'nome'], 'Rita');
  for (const p of [anna, bruno, chiara]) server = mergePatch(server, p);
  assert.deepEqual(server, {
    stories: { s1: { voglio: 'chiedere una procedura', per: 'non disturbare' } },
    personas: { p9: { nome: 'Rita' } },
  });
});

test('patchFromPath costruisce la patch minima', () => {
  assert.deepEqual(patchFromPath(['a', 'b', 'c'], 1), { a: { b: { c: 1 } } });
});
