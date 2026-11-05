// Test della "Bozza con AI" contro un finto endpoint compatibile OpenAI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { draft, extractJson } from '../server/ai.js';

test('extractJson trova il JSON anche dentro testo', () => {
  assert.deepEqual(extractJson('Ecco:\n```json\n{"a":1}\n```'), { a: 1 });
});

test('draft chiama /chat/completions e tiene solo i campi attesi', async () => {
  let received;
  const mock = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      received = { url: req.url, body: JSON.parse(body) };
      const content = JSON.stringify({ nome: 'Ugo, magazziniere', tipo: 'inventato', frase: '"Ciao"', extra: 'x' });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  await new Promise((r) => mock.listen(0, r));
  const env = { AI_BASE_URL: `http://127.0.0.1:${mock.address().port}/v1/`, AI_MODEL: 'finto' };
  const out = await draft({ doc: { titolo: 'T', scenario: { contesto: 'Magazzino' } }, kind: 'persona' }, env);
  mock.close();
  assert.equal(received.url, '/v1/chat/completions');
  assert.equal(received.body.model, 'finto');
  assert.match(received.body.messages[1].content, /Contesto: Magazzino/);
  assert.deepEqual(out, { nome: 'Ugo, magazziniere', frase: '"Ciao"' }); // tipo non valido ed extra scartati
});
