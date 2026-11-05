// "Bozza con AI" (opzionale): chiama un endpoint compatibile con l'API OpenAI
// (es. Ollama locale su http://localhost:11434/v1) e chiede un JSON con i campi
// di una persona o di una user story, a partire dallo scenario del gruppo.

import { PERSONA_TIPI, items } from '../public/js/model.js';

export function aiEnabled(env = process.env) {
  return Boolean(env.AI_BASE_URL && env.AI_MODEL) && env.BOZZE_AI !== 'off';
}

function scenarioContext(doc) {
  const s = doc.scenario || {};
  const lines = [
    `Titolo: ${doc.titolo || '(non ancora definito)'}`,
    `Settore: ${doc.settore || ''}`,
    `Contesto: ${s.contesto || ''}`,
    `Problema: ${s.problema || ''}`,
    `Processo attuale: ${s.processo || ''}`,
    `Stakeholder: ${s.stakeholder || ''}`,
    `Obiettivo: ${s.obiettivo || ''}`,
  ];
  const personas = items(doc.personas).map((p) => `- ${p.nome || 'senza nome'} (${PERSONA_TIPI[p.tipo] || p.tipo || ''})`);
  if (personas.length) lines.push('Personas già definite:', ...personas);
  return lines.join('\n');
}

const SCHEMAS = {
  persona: {
    descr: 'una persona (scheda utente) realistica e non stereotipata',
    fields: {
      nome: 'nome di fantasia e ruolo, es. "Marta, impiegata amministrativa"',
      tipo: 'una tra: utente | toccata | supervisore',
      giornata: 'una giornata tipo, 2-3 frasi',
      obiettivi: 'cosa vuole ottenere',
      frustrazioni: 'cosa la frustra oggi',
      ai: "rapporto con l'AI: fiducia, timori, esperienza",
      vulnerabilita: 'cosa rischia se il sistema sbaglia',
      frase: 'una frase tipica tra virgolette',
    },
  },
  story: {
    descr: 'una user story con criteri di accettazione',
    fields: {
      voglio: "l'azione che la persona vuole compiere",
      per: 'il beneficio',
      dato: 'condizione iniziale (dato che…)',
      quando: 'evento (quando…)',
      allora: 'risultato atteso verificabile (allora…)',
    },
  },
};

/** Estrae il primo oggetto JSON da una risposta testuale del modello. */
export function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('La risposta del modello non contiene JSON');
  return JSON.parse(text.slice(start, end + 1));
}

export async function draft({ doc, kind, persona }, env = process.env) {
  const schema = SCHEMAS[kind];
  if (!schema) throw new Error('Tipo di bozza non valido');
  const fieldList = Object.entries(schema.fields).map(([k, d]) => `"${k}": ${d}`).join('\n');
  const extra = kind === 'story' && persona ? `\nLa storia riguarda la persona: ${persona.nome || ''} (${PERSONA_TIPI[persona.tipo] || ''}).` : '';
  const messages = [
    {
      role: 'system',
      content: "Sei un assistente per un corso di progettazione di agenti AI. Rispondi SOLO con un oggetto JSON valido, in italiano, senza testo aggiuntivo. Le tue bozze saranno criticate e riscritte dagli studenti: sii concreto e plausibile, evita stereotipi.",
    },
    {
      role: 'user',
      content: `Scenario del gruppo:\n${scenarioContext(doc)}${extra}\n\nScrivi ${schema.descr}. Campi del JSON:\n${fieldList}`,
    },
  ];
  const url = env.AI_BASE_URL.replace(/\/+$/, '') + '/chat/completions';
  const headers = { 'Content-Type': 'application/json' };
  if (env.AI_API_KEY) headers.Authorization = `Bearer ${env.AI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: env.AI_MODEL, messages, temperature: 0.7, response_format: { type: 'json_object' } }),
    signal: AbortSignal.timeout(Number(env.AI_TIMEOUT_MS) || 180_000),
  });
  if (!res.ok) throw new Error(`Il servizio AI ha risposto ${res.status}`);
  const body = await res.json();
  const parsed = extractJson(body.choices?.[0]?.message?.content || '');
  // Tiene solo i campi attesi, come stringhe.
  const out = {};
  for (const k of Object.keys(schema.fields)) if (parsed[k] != null) out[k] = String(parsed[k]);
  if (out.tipo && !PERSONA_TIPI[out.tipo]) delete out.tipo;
  return out;
}
