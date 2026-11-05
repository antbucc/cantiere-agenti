// Avvio del server: `npm start`.
import 'dotenv/config';
import http from 'node:http';
import os from 'node:os';
import { createApp } from './app.js';
import { defaultDbFile } from './db.js';
import { seed } from '../scripts/seed.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DB_FILE = defaultDbFile();

// Su Railway il disco del container si azzera a ogni deploy: senza Volume si perdono i dati.
if (process.env.RAILWAY_ENVIRONMENT && !process.env.RAILWAY_VOLUME_MOUNT_PATH && !process.env.DB_FILE) {
  console.warn('\n⚠ Railway senza Volume: il database verrà CANCELLATO a ogni deploy o riavvio.\n  Aggiungete un Volume al servizio (es. montato su /data): verrà usato in automatico.\n');
}

/** Problemi di configurazione dei codici, in italiano; lista vuota se è tutto a posto. */
function configProblems(env) {
  const corso = (env.CODICE_CORSO || '').trim();
  const docente = (env.CODICE_DOCENTE || '').trim();
  const out = [];
  if (!corso) out.push('Manca CODICE_CORSO (il codice che gli studenti inseriscono per entrare).');
  if (!docente) out.push('Manca CODICE_DOCENTE (il codice per la lavagna e il libro intero).');
  if (corso && docente && corso === docente) out.push('CODICE_CORSO e CODICE_DOCENTE devono essere diversi: altrimenti ogni studente entra come docente.');
  if (/^scegliete-un-codice/.test(corso) || /^scegliete-un-codice/.test(docente)) out.push('I codici sono ancora quelli di esempio di .env.example: sceglietene di vostri.');
  return out;
}

/**
 * Senza codici validi l'app non si avvia, ma resta in ascolto con una pagina che
 * spiega cosa manca: su Railway, uscire farebbe ripartire il servizio in un ciclo
 * di crash senza spiegazioni. /salute risponde 503, così il deploy risulta fallito.
 */
function startSetupServer(problems) {
  const where = process.env.RAILWAY_ENVIRONMENT
    ? 'Su Railway: servizio → <b>Variables</b> → aggiungete le variabili. Il servizio si riavvia da solo.'
    : 'In locale: copiate <code>.env.example</code> in <code>.env</code>, impostate i codici e riavviate con <code>npm start</code>.';
  console.error('\n✖ Configurazione incompleta:\n  - ' + problems.join('\n  - ')
    + (process.env.RAILWAY_ENVIRONMENT ? '\n  Impostate le variabili nel tab Variables del servizio su Railway.\n' : '\n  Copiate .env.example in .env e impostate i codici.\n'));
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const page = `<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dify · configurazione</title>
<style>body{font:16px/1.6 system-ui,sans-serif;background:#F3F3F1;color:#23243a;margin:0;padding:40px 16px}main{max-width:640px;margin:auto;background:#fff;border-radius:14px;padding:24px 28px;border-top:6px solid #E26D5A}h1{font-size:1.3rem}code{background:#eee;padding:1px 5px;border-radius:4px}li{margin:6px 0}</style>
<main><h1>Dify non è ancora configurato</h1>
<ul>${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
<p>${where}</p>
<p>Esempio: <code>CODICE_CORSO=agenti-2026</code> e <code>CODICE_DOCENTE=</code> una frase lunga che conoscete solo voi.</p></main></html>`;
  const srv = http.createServer((req, res) => {
    if (req.url.startsWith('/salute')) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, errore: problems }));
    }
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page);
  });
  srv.listen(PORT, HOST, () => console.error(`  Pagina di istruzioni su http://localhost:${PORT}\n`));
  process.on('SIGTERM', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));
}

const problems = configProblems(process.env);
if (problems.length) {
  startSetupServer(problems);
} else {
  start();
}

function start() {
  // SEED_ESEMPIO=1: crea la Task Force di esempio, ma solo se il database è vuoto.
  if (process.env.SEED_ESEMPIO === '1') {
    try { seed(DB_FILE, { onlyIfEmpty: true }); } catch (e) { console.warn('Esempio non creato:', e.message); }
  }
  const ctx = createApp({ dbFile: DB_FILE, courseCode: process.env.CODICE_CORSO.trim(), teacherCode: process.env.CODICE_DOCENTE.trim() });

  const server = ctx.app.listen(PORT, HOST, () => {
    console.log('\nDify');
    console.log(`  locale:        http://localhost:${PORT}`);
    // Indirizzi della rete locale, da proiettare in aula
    for (const ifaces of Object.values(os.networkInterfaces())) {
      for (const i of ifaces || []) {
        if (i.family === 'IPv4' && !i.internal) console.log(`  rete locale:   http://${i.address}:${PORT}`);
      }
    }
    console.log(`  database:      ${DB_FILE}`);
    const e = process.env;
    console.log(`  bozza con AI:  ${e.AI_BASE_URL && e.AI_MODEL && e.BOZZE_AI !== 'off' ? e.AI_MODEL + ' @ ' + e.AI_BASE_URL : 'disattivata'}`);
    console.log(`  guida socratica: ${e.AI_BASE_URL && e.SOCRATICO !== 'off' && (e.SOCRATICO_MODEL || e.AI_MODEL) ? (e.SOCRATICO_MODEL || e.AI_MODEL) + ' @ ' + e.AI_BASE_URL : 'disattivata'}\n`);
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') console.error(`\n✖ La porta ${PORT} è già occupata. Impostate un'altra porta, es. PORT=3100 npm start\n`);
    else console.error(e);
    process.exit(1);
  });

  function shutdown() {
    server.close();
    ctx.close();
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
