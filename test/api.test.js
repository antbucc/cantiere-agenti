// Test dell'API su un database in memoria: patch concorrenti, permessi, export.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';

let ctx, server, base;
const S = { 'X-Codice-Corso': 'corso', 'Content-Type': 'application/json' };
const call = (method, path, body, headers = S) => fetch(base + path, { method, headers, body: body && JSON.stringify(body) });

before(async () => {
  ctx = createApp({ dbFile: ':memory:', courseCode: 'corso', teacherCode: 'docente', env: {} });
  server = ctx.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server.close(); ctx.close(); });

test('senza codice del corso: 401', async () => {
  assert.equal((await call('GET', '/groups', undefined, {})).status, 401);
});

test('patch concorrenti su campi diversi vengono unite', async () => {
  const g = await (await call('POST', '/groups', { name: 'Alfa', settore: 'Ricerca' })).json();
  await Promise.all([
    call('PATCH', `/groups/${g.id}`, { data: { personas: { p1: { nome: 'Giulia' } } } }),
    call('PATCH', `/groups/${g.id}`, { data: { personas: { p1: { tipo: 'toccata' } } } }),
    call('PATCH', `/groups/${g.id}`, { data: { titolo: 'Titolo' } }),
  ]);
  const after = await (await call('GET', `/groups/${g.id}`)).json();
  assert.deepEqual(after.data.personas.p1, { nome: 'Giulia', tipo: 'toccata' });
  assert.equal(after.data.titolo, 'Titolo');
  assert.equal(after.settore, 'Ricerca');
});

test('la lavagna e il libro richiedono il codice docente', async () => {
  const g = await (await call('POST', '/groups', { name: 'Beta' })).json();
  assert.equal((await call('PUT', `/board/${g.id}`, { punti: { quiz: 5 } })).status, 403);
  assert.equal((await call('GET', '/export/book.md')).status, 403);
  const T = { ...S, 'X-Codice-Docente': 'docente' };
  const b = await (await call('PUT', `/board/${g.id}`, { punti: { quiz: 5 }, badges: ['Mentore', 'Inventato'] }, T)).json();
  assert.deepEqual(b.punti, { tappe: 0, quiz: 5, revisione: 0, consiglio: 0 });
  assert.deepEqual(b.badges, ['Mentore']);
  const book = await call('GET', '/export/book.md', undefined, T);
  assert.equal(book.status, 200);
  assert.match(await book.text(), /Appendice A · Registro degli agenti/);
});

test('export del capitolo in Markdown', async () => {
  const g = await (await call('POST', '/groups', { name: 'Gamma' })).json();
  const res = await call('GET', `/export/${g.id}.md?download`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/markdown/);
  assert.match(res.headers.get('content-disposition'), /parte-gamma\.md/);
  assert.match(await res.text(), /^# Gamma$/m);
});
