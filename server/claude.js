// Claude (Anthropic) come modello della Guida socratica, con l'SDK ufficiale.
//
// Si attiva quando c'è ANTHROPIC_API_KEY (e SOCRATICO_PROVIDER non è "openai").
// Riceve gli stessi messaggi preparati per gli altri modelli (regole, contesto,
// conversazione) e restituisce il testo a pezzi, in streaming: i controlli che
// rendono la guida non risolutiva (server/socratico.js) restano gli stessi.
//
// Scelte:
// - modello claude-opus-5-5 (CLAUDE_MODEL per cambiarlo);
// - effort "low" (CLAUDE_EFFORT): per un tutor in chat conta la rapidità; il
//   ragionamento su questo modello è sempre attivo e si regola solo con l'effort;
// - niente temperature: su questo modello non è accettata;
// - il prompt di sistema, uguale in ogni richiesta, va in cache (costa meno);
// - fallbacks "default": se il modello declina una richiesta per i suoi filtri di
//   sicurezza, il server la rifà con il modello di ripiego consigliato.

import Anthropic from '@anthropic-ai/sdk';

export const claudeEnabled = (env = process.env) => Boolean(env.ANTHROPIC_API_KEY) && env.SOCRATICO_PROVIDER !== 'openai';
export const claudeModel = (env = process.env) => env.CLAUDE_MODEL || 'claude-opus-5-5';

let cached = null;
function client(env) {
  const key = `${env.ANTHROPIC_API_KEY}|${env.ANTHROPIC_BASE_URL || ''}`;
  if (!cached || cached.key !== key) {
    cached = { key, client: new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: env.ANTHROPIC_BASE_URL || undefined, maxRetries: 2 }) };
  }
  return cached.client;
}

/** Errori dell'API in italiano, per la guida e per i log. */
function friendly(e) {
  if (e instanceof Anthropic.AuthenticationError) return new Error('la chiave API di Anthropic non è valida (ANTHROPIC_API_KEY)');
  if (e instanceof Anthropic.PermissionDeniedError) return new Error('la chiave API di Anthropic non ha accesso a questo modello');
  if (e instanceof Anthropic.NotFoundError) return new Error(`il modello «${claudeModel()}» non esiste o non è disponibile per questa chiave`);
  if (e instanceof Anthropic.RateLimitError) return new Error('troppe richieste insieme al servizio di Anthropic: riprovate tra qualche secondo');
  if (e instanceof Anthropic.APIConnectionError) return new Error('il servizio di Anthropic non è raggiungibile');
  if (e instanceof Anthropic.APIError) return new Error(`il servizio di Anthropic ha risposto ${e.status}`);
  return e;
}

/**
 * Chiede a Claude una risposta in streaming e restituisce i pezzi di testo.
 * @param messages messaggi nello stesso formato usato per gli altri modelli:
 *                 [{ role: 'system' | 'user' | 'assistant', content }]
 */
export async function* streamClaude(messages, env = process.env, signal) {
  // i messaggi "system" diventano il prompt di sistema; il primo (le regole, sempre uguale) va in cache
  const system = messages.filter((m) => m.role === 'system')
    .map((m, i) => ({ type: 'text', text: m.content, ...(i === 0 ? { cache_control: { type: 'ephemeral' } } : {}) }));
  const turns = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }));

  let stream;
  try {
    stream = client(env).beta.messages.stream({
      model: claudeModel(env),
      max_tokens: Number(env.SOCRATICO_MAX_TOKENS) || 16000,
      system,
      messages: turns,
      output_config: { effort: env.CLAUDE_EFFORT || 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    }, { signal });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') yield event.delta.text;
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      yield '\n\nSu questa richiesta non posso aiutarvi. Provate a riformularla, o chiedete al docente.';
    }
  } catch (e) {
    if (signal?.aborted || e?.name === 'AbortError' || e instanceof Anthropic.APIUserAbortError) return;
    throw friendly(e);
  } finally {
    // la guida chiude la risposta alla prima domanda: fermiamo anche la generazione
    try { if (stream && !stream.ended) stream.abort(); } catch { /* già chiuso */ }
  }
}
