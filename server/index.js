// Avvio del server: `npm start`.
import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DB_FILE = process.env.DB_FILE || path.join(process.cwd(), 'data', 'cantiere.sqlite');

let ctx;
try {
  ctx = createApp({ dbFile: DB_FILE, courseCode: process.env.CODICE_CORSO, teacherCode: process.env.CODICE_DOCENTE });
} catch (e) {
  console.error('\n✖ ' + e.message + '\n  Copia .env.example in .env e imposta i codici.\n');
  process.exit(1);
}

const server = ctx.app.listen(PORT, HOST, () => {
  console.log('\nCantiere · Agenti al Lavoro');
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
