// Applicazione Express: API JSON, Server-Sent Events, export e file statici.
// createApp() è separata da index.js così i test possono avviarla su un DB in memoria.

import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { groupToMarkdown, bookToMarkdown } from './export.js';
import { bookProject, groupProject, singleFile } from './latex.js';
import { makeZip } from './zip.js';
import { pdfAvailable, compilePdf } from './pdf.js';
import { aiEnabled, draft } from './ai.js';
import { socraticoEnabled, socraticoModel, streamSocratico } from './socratico.js';
import { BADGES, SETTORI, items } from '../public/js/model.js';
import { isPlainObject } from '../public/js/merge.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

/** Confronto a tempo costante, per non rivelare i codici con un attacco a tempo. */
function sameCode(given, expected) {
  if (!expected || typeof given !== 'string') return false;
  const a = crypto.createHash('sha256').update(given.trim()).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Nome di file sicuro per il download. */
const slug = (s) => String(s || 'capitolo').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'capitolo';

export function createApp({ dbFile, courseCode, teacherCode, env = process.env }) {
  if (!courseCode || !teacherCode) throw new Error('CODICE_CORSO e CODICE_DOCENTE devono essere impostati in .env');
  const store = openDb(dbFile);
  const app = express();
  app.set('trust proxy', true); // dietro un reverse proxy
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  // ---- Autenticazione: codice nel header (o nella query, per EventSource e link di download)
  const codeFrom = (req, header, query) => req.get(header) || req.query[query] || '';
  const isTeacher = (req) => sameCode(codeFrom(req, 'X-Codice-Docente', 'docente'), teacherCode);
  const isStudent = (req) => sameCode(codeFrom(req, 'X-Codice-Corso', 'codice'), courseCode)
    || sameCode(codeFrom(req, 'X-Codice-Corso', 'codice'), teacherCode) || isTeacher(req);

  const requireCourse = (req, res, next) => (isStudent(req) ? next() : res.status(401).json({ error: 'Codice del corso non valido' }));
  const requireTeacher = (req, res, next) => (isTeacher(req) ? next() : res.status(403).json({ error: 'Serve il codice docente' }));

  // ---- Server-Sent Events: ogni modifica viene inviata a tutti i client connessi
  const clients = new Set();
  function broadcast(type, payload) {
    const msg = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of clients) res.write(msg);
  }
  const heartbeat = setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25_000);
  heartbeat.unref();

  // ---- API
  const api = express.Router();

  api.post('/login', (req, res) => {
    const codice = req.body?.codice;
    if (sameCode(codice, teacherCode)) return res.json({ ruolo: 'docente' });
    if (sameCode(codice, courseCode)) return res.json({ ruolo: 'studente' });
    res.status(401).json({ error: 'Codice non valido' });
  });

  api.post('/login/docente', (req, res) => (sameCode(req.body?.codice, teacherCode)
    ? res.json({ ruolo: 'docente' }) : res.status(403).json({ error: 'Codice docente non valido' })));

  api.use(requireCourse);

  api.get('/config', (req, res) => res.json({
    ai: aiEnabled(env),
    socratico: socraticoEnabled(env) ? { model: socraticoModel(env) } : null,
    pdf: pdfAvailable(env),
    settori: SETTORI, badges: BADGES, docente: isTeacher(req),
  }));

  api.get('/events', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx: non bufferizzare lo stream
    });
    res.flushHeaders();
    res.write('retry: 3000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
  });

  api.get('/groups', (req, res) => res.json(store.listGroups()));

  api.post('/groups', (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 80);
    if (!name) return res.status(400).json({ error: 'Serve un nome per la Task Force' });
    if (store.getGroupByName(name)) return res.status(409).json({ error: 'Esiste già una Task Force con questo nome' });
    const settore = SETTORI.includes(req.body?.settore) ? req.body.settore : '';
    const membri = String(req.body?.membri || '').slice(0, 500);
    const g = store.createGroup({ name, settore, membri });
    broadcast('group', { group: g, origin: req.get('X-Client-Id') || null });
    res.status(201).json(g);
  });

  api.get('/groups/:id', (req, res) => {
    const g = store.getGroup(req.params.id);
    g ? res.json(g) : res.status(404).json({ error: 'Task Force non trovata' });
  });

  // JSON merge patch su { name, data }: più membri possono scrivere insieme
  api.patch('/groups/:id', (req, res) => {
    if (!isPlainObject(req.body)) return res.status(400).json({ error: 'Patch non valida' });
    const patch = {};
    if ('name' in req.body) patch.name = req.body.name;
    if ('data' in req.body) patch.data = req.body.data;
    const g = store.patchGroup(req.params.id, patch);
    if (!g) return res.status(404).json({ error: 'Task Force non trovata' });
    broadcast('group', { group: g, origin: req.get('X-Client-Id') || null });
    res.json(g);
  });

  api.delete('/groups/:id', requireTeacher, (req, res) => {
    if (!store.deleteGroup(req.params.id)) return res.status(404).json({ error: 'Task Force non trovata' });
    broadcast('group-deleted', { id: req.params.id });
    res.status(204).end();
  });

  api.get('/board', (req, res) => res.json(store.listBoard()));

  api.put('/board/:groupId', requireTeacher, (req, res) => {
    if (!store.getGroup(req.params.groupId)) return res.status(404).json({ error: 'Task Force non trovata' });
    const badges = Array.isArray(req.body?.badges) ? [...new Set(req.body.badges.filter((b) => BADGES.includes(b)))] : undefined;
    const b = store.setBoard(req.params.groupId, { punti: req.body?.punti || {}, badges });
    broadcast('board', b);
    res.json(b);
  });

  // Registro di tutti gli agenti di tutte le Task Force
  api.get('/agents', (req, res) => {
    const out = [];
    for (const g of store.listGroups()) {
      for (const a of items(g.data.agents)) out.push({ ...a, groupId: g.id, groupName: g.name });
    }
    res.json(out);
  });

  api.post('/ai/draft', async (req, res) => {
    if (!aiEnabled(env)) return res.status(404).json({ error: 'Bozza con AI non attiva' });
    const g = store.getGroup(req.body?.groupId);
    if (!g) return res.status(404).json({ error: 'Task Force non trovata' });
    try {
      const persona = req.body?.personaId ? g.data.personas?.[req.body.personaId] : null;
      res.json(await draft({ doc: g.data, kind: req.body?.kind, persona }, env));
    } catch (e) {
      res.status(502).json({ error: 'Bozza non disponibile: ' + e.message });
    }
  });

  // Guida socratica: risposta in streaming (testo semplice, a pezzi)
  api.post('/socratico', async (req, res) => {
    if (!socraticoEnabled(env)) return res.status(404).json({ error: 'Guida socratica non attiva' });
    const g = store.getGroup(req.body?.groupId);
    if (!g) return res.status(404).json({ error: 'Task Force non trovata' });
    const { section, field, messages } = req.body || {};
    if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: 'Nessun messaggio' });
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableEnded) abort.abort(); }); // l'utente ha chiuso o interrotto
    try {
      const stream = streamSocratico({ doc: g.data, section, field, messages }, env, abort.signal);
      const first = await stream.next(); // gli errori di connessione arrivano qui, prima degli header
      res.set({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
      if (!first.done) res.write(first.value);
      for await (const text of stream) res.write(text);
      res.end();
    } catch (e) {
      if (abort.signal.aborted) return;
      if (!res.headersSent) res.status(502).json({ error: 'La guida non risponde: ' + e.message });
      else res.end('\n\n[La risposta si è interrotta: ' + e.message + ']');
    }
  });

  // ---- Export: Markdown, LaTeX (.tex in un file), progetto Overleaf (.zip), PDF
  //   /export/book.<formato>      libro intero (solo docente)
  //   /export/<groupId>.<formato> capitolo di una Task Force
  const FORMATS = 'md|tex|zip|pdf';

  async function sendExport(req, res, { kind, groups, baseName }) {
    const download = req.query.download !== undefined;
    const fmt = req.params.fmt;
    const disposition = (ext) => res.set('Content-Disposition', `${download || ext === 'zip' ? 'attachment' : 'inline'}; filename="${baseName}.${ext}"`);
    if (fmt === 'md') {
      res.type('text/markdown; charset=utf-8');
      if (download) disposition('md');
      return res.send(kind === 'book' ? bookToMarkdown(groups) : groupToMarkdown(groups[0]));
    }
    const files = kind === 'book' ? bookProject(groups) : groupProject(groups[0]);
    if (fmt === 'tex') {
      res.type('application/x-tex; charset=utf-8');
      if (download) disposition('tex');
      return res.send(singleFile(files));
    }
    if (fmt === 'zip') {
      res.type('application/zip');
      disposition('zip');
      return res.send(makeZip(files)); // file alla radice: Overleaf trova subito main.tex
    }
    // pdf
    if (!pdfAvailable(env)) return res.status(503).json({ error: 'LaTeX non è installato su questo server: scaricate il progetto per Overleaf (.zip) e compilatelo lì.' });
    try {
      const pdf = await compilePdf(files, env);
      res.type('application/pdf');
      disposition('pdf');
      res.send(pdf);
    } catch (e) {
      console.error(e.message);
      res.status(500).json({ error: e.message });
    }
  }

  // Il libro intero richiede il codice docente (definita prima della rotta del singolo capitolo).
  api.get(`/export/book.:fmt(${FORMATS})`, requireTeacher, (req, res, next) => {
    sendExport(req, res, { kind: 'book', groups: store.listGroups(), baseName: 'libro-agenti-al-lavoro' }).catch(next);
  });

  api.get(`/export/:groupId.:fmt(${FORMATS})`, (req, res, next) => {
    const g = store.getGroup(req.params.groupId);
    if (!g) return res.status(404).json({ error: 'Task Force non trovata' });
    sendExport(req, res, { kind: 'group', groups: [g], baseName: `parte-${slug(g.name)}` }).catch(next);
  });

  api.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error(err);
    res.status(err.status || 500).json({ error: err.expose ? err.message : 'Errore del server' });
  });

  // Healthcheck senza codice (Railway, reverse proxy, monitoraggio)
  app.get('/salute', (req, res) => {
    try { store.db.prepare('SELECT 1').get(); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); }
  });

  app.use('/api', api);
  app.use(express.static(PUBLIC_DIR, { extensions: ['html'], setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));

  return { app, store, close: () => { clearInterval(heartbeat); for (const c of clients) c.end(); store.db.close(); } };
}
