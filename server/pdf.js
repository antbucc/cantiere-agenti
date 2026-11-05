// Compilazione del PDF con la TeX Live installata sul server (latexmk + pdfLaTeX).
// Se LaTeX non c'è, l'app propone il progetto per Overleaf al posto del PDF.
//
// - Una compilazione alla volta (coda), con un tempo massimo.
// - I PDF già compilati restano in memoria per lo stesso sorgente: due docenti che
//   scaricano il libro uno dopo l'altro non lo ricompilano.

import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let available;
/** Vero se latexmk e il motore scelto rispondono. */
export function pdfAvailable(env = process.env) {
  if (env.PDF === 'off') return false;
  if (available === undefined) {
    const engine = env.LATEX_ENGINE || 'pdflatex';
    available = ['latexmk', engine].every((cmd) => spawnSync(cmd, ['--version'], { stdio: 'ignore', timeout: 5000 }).status === 0);
  }
  return available;
}

const cache = new Map(); // hash del sorgente → Buffer del PDF
const MAX_CACHE = 20;
let queue = Promise.resolve();

function run(cmd, args, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    p.stdout.on('data', (d) => { log = (log + d).slice(-20000); });
    p.stderr.on('data', (d) => { log = (log + d).slice(-20000); });
    const timer = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.on('close', (code) => { clearTimeout(timer); resolve({ code, log }); });
  });
}

/** Prime righe utili dell'errore LaTeX ("! ..."), per un messaggio leggibile. */
function latexError(log) {
  const i = log.indexOf('\n!');
  return i >= 0 ? log.slice(i + 1, i + 600).trim() : log.slice(-600).trim();
}

/**
 * Compila un progetto { 'main.tex': ..., 'parti/x.tex': ... } e restituisce il PDF.
 * Lancia un errore con le righe rilevanti del log se la compilazione fallisce.
 */
export function compilePdf(files, env = process.env) {
  const hash = crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex');
  if (cache.has(hash)) return Promise.resolve(cache.get(hash));
  const job = queue.then(async () => {
    if (cache.has(hash)) return cache.get(hash);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cantiere-pdf-'));
    try {
      for (const [name, content] of Object.entries(files)) {
        const target = path.join(dir, name);
        if (!target.startsWith(dir + path.sep)) throw new Error('Nome di file non valido');
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, content);
      }
      const engine = env.LATEX_ENGINE || 'pdflatex';
      const flag = { pdflatex: '-pdf', lualatex: '-lualatex', xelatex: '-xelatex' }[engine] || '-pdf';
      const { code, log } = await run('latexmk', [flag, '-interaction=nonstopmode', '-halt-on-error', '-file-line-error', 'main.tex'], dir, Number(env.PDF_TIMEOUT_MS) || 180_000);
      if (code !== 0) throw new Error('Compilazione LaTeX non riuscita:\n' + latexError(log));
      const pdf = await fs.readFile(path.join(dir, 'main.pdf'));
      cache.set(hash, pdf);
      if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
      return pdf;
    } finally {
      fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });
  queue = job.catch(() => {}); // un errore non blocca la coda
  return job;
}
