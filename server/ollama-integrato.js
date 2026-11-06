// Ollama integrato nell'app: con MODELLO_INTEGRATO=qwen2.5:7b l'app avvia Ollama
// come processo figlio, scarica il modello (nel Volume, se c'è spazio), lo carica
// in memoria e si collega da sola. Pensato per Railway: un solo servizio, una variabile.
//
// Lo stato (avvio, download con percentuale, pronto, errore) è in `stato` e
// compare in /salute. Finché il modello non è pronto la Guida socratica risponde
// in modalità di base.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const stato = { attivo: false, fase: 'spento', modello: null, progresso: null, errore: null };

const SPAZIO_MINIMO = 6e9; // byte liberi richiesti per scaricare un modello da 7B nel Volume
const log = (...a) => console.log('[ollama]', ...a);

/** Dove tenere i modelli: nel Volume se c'è (e c'è spazio), altrimenti sul disco del container. */
export function cartellaModelli(env = process.env) {
  if (env.OLLAMA_MODELS) return env.OLLAMA_MODELS;
  const fallback = path.join(os.homedir(), '.ollama', 'models');
  const vol = env.RAILWAY_VOLUME_MOUNT_PATH;
  if (!vol) return fallback;
  const dir = path.join(vol, 'ollama-modelli');
  try {
    if (fs.existsSync(dir) && fs.readdirSync(dir).length) return dir; // già scaricato in un avvio precedente
    const { bavail, bsize } = fs.statfsSync(vol);
    if (bavail * bsize >= SPAZIO_MINIMO) return dir;
    log(`Volume con meno di ${SPAZIO_MINIMO / 1e9} GB liberi: modello sul disco del container (verrà riscaricato a ogni riavvio).`);
  } catch (e) {
    log('Volume non utilizzabile per i modelli:', e.message);
  }
  return fallback;
}

/**
 * Avvia Ollama se MODELLO_INTEGRATO è impostato. Imposta (se mancano) AI_BASE_URL,
 * AI_MODEL e SOCRATICO_PROFILO=leggero, così il resto dell'app lo usa senza altre variabili.
 * Restituisce una funzione per fermarlo, o null.
 */
export function avviaOllamaIntegrato(env = process.env) {
  const modello = (env.MODELLO_INTEGRATO || '').trim();
  if (!modello) return null;
  const porta = Number(env.OLLAMA_PORTA) || 11435; // non 11434: evita conflitti con un Ollama già installato
  const base = `http://127.0.0.1:${porta}`;
  const modelli = cartellaModelli(env);
  fs.mkdirSync(modelli, { recursive: true });

  env.AI_BASE_URL ||= `${base}/v1`;
  env.AI_MODEL ||= modello;
  env.SOCRATICO_PROFILO ||= 'leggero';
  Object.assign(stato, { attivo: true, fase: 'avvio', modello, progresso: null, errore: null });
  log(`modello ${modello}, cartella ${modelli}`);

  let figlio = null;
  let fermato = false;
  let riavvii = 0;
  const avvia = () => {
    figlio = spawn(env.OLLAMA_BIN || 'ollama', ['serve'], {
      env: {
        ...process.env,
        OLLAMA_HOST: `127.0.0.1:${porta}`,
        OLLAMA_MODELS: modelli,
        OLLAMA_KEEP_ALIVE: '-1',
        OLLAMA_NUM_PARALLEL: '1',
        OLLAMA_MAX_LOADED_MODELS: '1',
        OLLAMA_CONTEXT_LENGTH: env.SOCRATICO_CTX || '4096',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // il log di Ollama è molto verboso: passiamo solo errori e avvisi
    const filtra = (buf) => String(buf).split('\n').filter((l) => /level=(ERROR|WARN)|error|panic/i.test(l)).forEach((l) => log(l.slice(0, 300)));
    figlio.stdout.on('data', filtra);
    figlio.stderr.on('data', filtra);
    figlio.on('error', (e) => { stato.fase = 'errore'; stato.errore = `Ollama non si avvia: ${e.message}`; log(stato.errore); });
    figlio.on('exit', (code) => {
      if (fermato) return;
      riavvii += 1;
      log(`Ollama si è fermato (codice ${code})${riavvii <= 5 ? ', lo riavvio' : ''}.`);
      if (riavvii <= 5) { stato.fase = 'avvio'; setTimeout(() => { avvia(); prepara(); }, 3000); } else { stato.fase = 'errore'; stato.errore = 'Ollama si è fermato troppe volte: controllate la RAM del servizio.'; }
    });
  };

  const prepara = async () => {
    try {
      // 1) aspetta che il server risponda
      for (let i = 0; ; i += 1) {
        try { if ((await fetch(`${base}/api/version`)).ok) break; } catch { /* non ancora */ }
        if (i > 120) throw new Error('Ollama non risponde dopo 2 minuti');
        await new Promise((r) => setTimeout(r, 1000));
      }
      // 2) scarica il modello se manca
      const tags = await (await fetch(`${base}/api/tags`)).json();
      if (!(tags.models || []).some((m) => m.name === modello || m.model === modello)) {
        stato.fase = 'download';
        log(`scarico ${modello}…`);
        const res = await fetch(`${base}/api/pull`, { method: 'POST', body: JSON.stringify({ model: modello, stream: true }) });
        if (!res.ok || !res.body) throw new Error(`download non riuscito (${res.status})`);
        let resto = '';
        let ultimo = -10;
        for await (const pezzo of res.body) {
          resto += Buffer.from(pezzo).toString();
          const righe = resto.split('\n');
          resto = righe.pop();
          for (const r of righe) {
            if (!r.trim()) continue;
            const j = JSON.parse(r);
            if (j.error) throw new Error(j.error);
            if (j.total && j.completed) {
              const pct = Math.floor((j.completed / j.total) * 100);
              stato.progresso = pct;
              if (pct >= ultimo + 10) { log(`download ${pct}%`); ultimo = pct; }
            }
          }
        }
      }
      // 3) lo carica in memoria, così la prima domanda non aspetta
      stato.fase = 'caricamento';
      stato.progresso = null;
      log(`carico ${modello} in memoria…`);
      const g = await fetch(`${base}/api/generate`, { method: 'POST', body: JSON.stringify({ model: modello, prompt: 'ok', stream: false, keep_alive: -1, options: { num_predict: 1 } }) });
      if (!g.ok) throw new Error(`caricamento non riuscito (${g.status})`);
      stato.fase = 'pronto';
      log(`pronto: ${modello}`);
    } catch (e) {
      stato.fase = 'errore';
      stato.errore = e.message;
      log('errore:', e.message);
    }
  };

  avvia();
  prepara();
  return () => { fermato = true; figlio?.kill('SIGTERM'); };
}
