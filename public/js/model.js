// Modello dati condiviso tra server (export, seed) e browser (UI, completamento).
// Nessuna dipendenza: è un modulo ES puro.

export const SETTORI = [
  'Amministrazione e servizi',
  'Cura e salute',
  'Formazione e scuola',
  'Tecnico e produzione',
  'Commerciale e clienti',
  'Ricerca',
  'Altro',
];

export const PERSONA_TIPI = {
  utente: 'Utente',
  toccata: 'Toccata ma non utente',
  supervisore: 'Supervisore',
};

export const MODELLI = { piccolo: 'Piccolo', medio: 'Medio', grande: 'Grande' };

export const PATTERNS = {
  pipeline: 'Pipeline',
  router: 'Router',
  'produttore e critico': 'Produttore e critico',
  combinazione: 'Combinazione',
};

export const LIVELLI_UMANO = {
  informato: 'È informato',
  approva: 'Approva',
  decide: 'Decide',
};

export const TEST_TIPI = { tipico: 'Tipico', limite: 'Limite', equita: 'Equità', ostile: 'Ostile' };
/** Proporzioni dei 12 casi di test. */
export const TEST_QUOTE = { tipico: 6, limite: 3, equita: 2, ostile: 1 };
export const ESITI = { passato: 'Passato', parziale: 'Parziale', fallito: 'Fallito' };

export const OUTPUTS = [
  { key: 'out1', label: 'Output 1 · un successo' },
  { key: 'out2', label: 'Output 2 · un fallimento' },
  { key: 'out3', label: 'Output 3 · un caso ambiguo' },
];

export const CRITERI = [
  { key: 'correttezza', label: 'Correttezza', ph: 'I fatti sono giusti?' },
  { key: 'completezza', label: 'Completezza', ph: 'Manca qualcosa?' },
  { key: 'tono', label: 'Tono', ph: 'Adatto alla persona?' },
  { key: 'trasparenza', label: 'Trasparenza', ph: 'Dice cosa non sa?' },
  { key: 'equita', label: 'Equità', ph: 'Tratta tutti allo stesso modo?' },
  { key: 'costo', label: 'Costo', ph: 'Chiamate, taglia del modello' },
];

export const FASCE = {
  minimo: 'Rischio minimo',
  limitato: 'Rischio limitato (obblighi di trasparenza)',
  alto: 'Alto rischio',
  inaccettabile: 'Inaccettabile (pratica vietata)',
};

export const SUPERVISIONE = {
  nel: "Umano nel ciclo — approva ogni output prima che abbia effetto",
  sul: "Umano sul ciclo — monitora e può fermare il sistema",
  fuori: "Umano fuori dal ciclo — verifica a campione, a posteriori",
};

export const DOMANDE_ETICA = [
  'Quali dati entrano nel sistema? Ci sono dati personali o riservati? Come li proteggiamo?',
  'Chi è toccato dagli output anche senza usare il sistema?',
  "L'utente sa di parlare con un'AI e sa cosa può e non può fare?",
  "Dov'è il punto di controllo umano? Chi approva, chi può fermare?",
  "Cosa succede quando l'agente sbaglia? Chi se ne accorge e in quanto tempo?",
  'Quali gruppi potrebbero essere trattati peggio? Li abbiamo testati?',
  "In quale fascia dell'AI Act cade lo scenario? Quali obblighi derivano?",
  'Quali competenze umane il sistema rischia di erodere? Come le manteniamo?',
  'Qual è il costo in chiamate e taglia dei modelli? Si può fare con meno?',
  "C'è un caso in cui la risposta giusta è non usare l'AI? Qual è?",
];

export const COMPETENZE = [
  { key: 'c1', label: 'C1 Fondamenti' },
  { key: 'c2', label: 'C2 Interazione' },
  { key: 'c3', label: 'C3 Progettazione' },
  { key: 'c4', label: 'C4 Valutazione critica' },
  { key: 'c5', label: 'C5 Etica e responsabilità' },
  { key: 'c6', label: 'C6 Sostenibilità e impatto' },
];
export const LIVELLI_COMP = { iniziale: 'Iniziale', intermedio: 'Intermedio', avanzato: 'Avanzato' };

export const BADGES = ['Occhio critico', 'Guardiano', 'Sobrietà', 'Mentore'];
export const PUNTI_BADGE = 5;
export const PUNTI_TAPPA = 10;

/**
 * I capitoli del percorso, nell'ordine del menu. `num` è l'etichetta lunga
 * ("Capitolo 5"), `short` quella breve ("Cap. 5").
 */
export const SECTIONS = [
  { key: 'scenario', n: 1, titolo: 'Scenario', giorno: 'venerdi', tempo: '30 minuti' },
  { key: 'personas', n: 2, titolo: 'Personas', giorno: 'venerdi', tempo: '20 minuti' },
  { key: 'stories', n: 3, titolo: 'User stories', giorno: 'venerdi', tempo: '25 minuti' },
  { key: 'mockup', n: 4, titolo: 'Mockup', giorno: 'venerdi', tempo: '30 minuti' },
  { key: 'agents', n: 5, titolo: 'Agenti', giorno: 'venerdi', tempo: '25 minuti' },
  { key: 'prompt', n: 6, titolo: 'Prompt e versioni', giorno: 'venerdi', tempo: '20 minuti' },
  { key: 'workflow', n: 7, titolo: 'Workflow', giorno: 'sabato', tempo: '45 minuti' },
  { key: 'tests', n: 8, titolo: 'Test', giorno: 'sabato', tempo: '40 minuti' },
  { key: 'analisi', n: 9, titolo: 'Analisi critica', giorno: 'sabato', tempo: '30 minuti' },
  { key: 'etica', n: 10, titolo: 'Etica e sostenibilità', giorno: 'sabato', tempo: '30 minuti' },
  { key: 'competenze', n: 11, titolo: 'Competenze e lezioni', giorno: 'sabato', tempo: '20 minuti' },
].map((s) => ({ ...s, num: `Capitolo ${s.n}`, short: `Cap. ${s.n}` }));

/** "Capitolo 5 · Agenti" a partire dalla chiave. */
export const sectionLabel = (key) => {
  const s = SECTIONS.find((x) => x.key === key);
  return s ? `${s.num} · ${s.titolo}` : key;
};

// ---------------------------------------------------------------------------
// Utilità
// ---------------------------------------------------------------------------

/** Vero se il valore conta come "compilato". */
export function filled(v) {
  if (typeof v === 'string') return v.trim() !== '';
  if (typeof v === 'number') return !Number.isNaN(v);
  return v === true;
}

/** Elementi non cancellati di una lista indicizzata per id, ordinati per `ord`. */
export function items(map) {
  return Object.entries(map || {})
    .filter(([, v]) => v && !v.deleted)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0) || a.id.localeCompare(b.id));
}

/** Id breve e leggibile, sicuro come chiave JSON e in un percorso con punti. */
export function newId(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}

/** Prossimo valore di `ord` per una lista (anche contando gli elementi cancellati). */
export function nextOrd(map) {
  return Object.values(map || {}).reduce((m, v) => Math.max(m, v?.ord ?? 0), 0) + 1;
}

/** Documento vuoto di un nuovo gruppo. */
export function emptyDoc({ settore = '', membri = '' } = {}) {
  return {
    titolo: '', sintesi: '', settore, membri,
    scenario: {}, personas: {}, stories: {}, mockup: {}, agents: {},
    workflow: { steps: {} }, tests: {}, testsNote: {}, analisi: {},
    etica: { bilancio: {} }, competenze: {},
  };
}

// ---------------------------------------------------------------------------
// Verifica del piano (workflow)
// ---------------------------------------------------------------------------

/**
 * Controlla il piano del workflow. Restituisce le quattro verifiche e i dettagli.
 * Una precondizione è "coperta" se è soddisfatta dall'input umano iniziale o da un
 * passo che viene PRIMA nel workflow.
 */
export function planCheck(doc) {
  const steps = items(doc.workflow?.steps);
  const agents = items(doc.agents);
  const agentIds = new Set(agents.map((a) => a.id));
  const position = new Map(steps.map((s, i) => [s.id, i]));
  const scoperti = [];
  steps.forEach((s, i) => {
    if (s.tipo !== 'agente') return;
    const by = s.soddisfatta;
    const ok = by === 'input' || (position.has(by) && position.get(by) < i);
    const valid = agentIds.has(s.agente);
    if (!ok || !valid) scoperti.push(i + 1);
  });
  const usati = new Set(steps.filter((s) => s.tipo === 'agente').map((s) => s.agente));
  const nonUsati = agents.filter((a) => !usati.has(a.id)).map((a) => a.nome || 'senza nome');
  const checks = [
    { ok: steps.length > 0 && scoperti.length === 0, label: 'Ogni precondizione è coperta',
      detail: scoperti.length ? `Passi da sistemare: ${scoperti.join(', ')}` : '' },
    { ok: steps.some((s) => s.tipo === 'umano'), label: 'Almeno un passo umano nel ciclo', detail: '' },
    { ok: steps.length >= 2, label: 'Almeno due passi', detail: '' },
    { ok: agents.length > 0 && nonUsati.length === 0, label: 'Ogni agente è usato',
      detail: nonUsati.length ? `Non usati: ${nonUsati.join(', ')}` : '' },
  ];
  return { checks, ok: checks.every((c) => c.ok) };
}

// ---------------------------------------------------------------------------
// Completamento delle sezioni
// ---------------------------------------------------------------------------
// Ogni sezione produce una lista di "verifiche" (valori tra 0 e 1). La percentuale
// è la media. Gli avvisi sono i messaggi da mostrare nella sezione e nella pagina
// "Verifica finale".

const ratio = (obj, keys) => (keys.length ? keys.filter((k) => filled(obj?.[k])).length / keys.length : 1);
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

const SCENARIO_KEYS = ['contesto', 'problema', 'processo', 'stakeholder', 'obiettivo', 'dati', 'etica', 'sostenibilita', 'nonai'];
const PERSONA_KEYS = ['nome', 'tipo', 'giornata', 'obiettivi', 'frustrazioni', 'ai', 'vulnerabilita', 'frase'];
const STORY_KEYS = ['persona', 'voglio', 'per', 'dato', 'quando', 'allora'];
const MOCKUP_KEYS = ['prima', 'durante', 'dopo', 'ai', 'socratico', 'approva', 'supervisore', 'errore'];
const AGENT_KEYS = ['nome', 'ruolo', 'obiettivo', 'precond', 'effetti', 'regole', 'strumenti', 'umano', 'modello'];
const WORKFLOW_KEYS = ['pattern', 'motivazione', 'alternativa', 'ultimo', 'togliere', 'nonso', 'approvazione'];
const TEST_KEYS = ['input', 'atteso', 'ottenuto', 'esito'];
const ANALISI_OUT_KEYS = ['caso', ...CRITERI.map((c) => c.key)];
const COMP_KEYS = ['prima', 'livello', 'dove', 'prova'];

const SCORERS = {
  scenario(doc) {
    const w = [];
    if (!filled(doc.titolo)) w.push('Manca il titolo della vostra parte.');
    if (!filled(doc.sintesi)) w.push('Manca la sintesi "in due frasi".');
    const missing = SCENARIO_KEYS.filter((k) => !filled(doc.scenario?.[k])).length;
    if (missing) w.push(`${missing} campi dello scenario ancora vuoti.`);
    return { checks: [ratio(doc, ['titolo', 'sintesi', 'settore', 'membri']), ratio(doc.scenario, SCENARIO_KEYS)], warnings: w };
  },
  personas(doc) {
    const list = items(doc.personas);
    const w = [];
    if (list.length < 2) w.push('Servono almeno 2 personas.');
    if (!list.some((p) => p.tipo === 'toccata')) w.push('Manca una persona "toccata ma non utente": chi subisce gli output senza usare il sistema?');
    return {
      checks: [Math.min(list.length, 2) / 2, list.some((p) => p.tipo === 'toccata') ? 1 : 0, avg(list.map((p) => ratio(p, PERSONA_KEYS)))],
      warnings: w,
    };
  },
  stories(doc) {
    const list = items(doc.stories);
    const w = [];
    if (list.length < 4) w.push(`Servono almeno 4 user stories (ora ${list.length}).`);
    if (!list.some((s) => s.negativa)) w.push('Manca una storia negativa: cosa il sistema NON deve fare?');
    return {
      checks: [Math.min(list.length, 4) / 4, list.some((s) => s.negativa) ? 1 : 0, avg(list.map((s) => ratio(s, STORY_KEYS)))],
      warnings: w,
    };
  },
  mockup(doc) {
    const missing = MOCKUP_KEYS.filter((k) => !filled(doc.mockup?.[k])).length;
    return { checks: [ratio(doc.mockup, MOCKUP_KEYS)], warnings: missing ? [`${missing} campi del mockup ancora vuoti.`] : [] };
  },
  agents(doc) {
    const list = items(doc.agents);
    const w = [];
    if (list.length < 2) w.push('Servono almeno 2 agenti.');
    if (list.length > 5) w.push(`Troppi agenti (${list.length}): massimo 5. Si può fare con meno?`);
    if (!list.some((a) => a.socratico)) w.push('Nessun agente socratico: quale agente dovrebbe fare domande invece di dare risposte?');
    const nonAdattati = list.filter((a) => a.origine && !filled(a.adattamento)).map((a) => a.nome || 'senza nome');
    if (nonAdattati.length) w.push(`Agenti riusati senza dire cosa avete adattato: ${nonAdattati.join(', ')}.`);
    return {
      checks: [list.length >= 2 && list.length <= 5 ? 1 : list.length === 1 ? 0.5 : list.length > 5 ? 0.5 : 0, list.some((a) => a.socratico) ? 1 : 0, avg(list.map((a) => ratio(a, a.origine ? [...AGENT_KEYS, 'adattamento'] : AGENT_KEYS)))],
      warnings: w,
    };
  },
  prompt(doc) {
    const list = items(doc.agents);
    if (!list.length) return { checks: [0], warnings: ['Prima create gli agenti nel Capitolo 5.'] };
    const w = [];
    const noPrompt = list.filter((a) => !filled(a.prompt)).map((a) => a.nome || 'senza nome');
    if (noPrompt.length) w.push(`Agenti senza prompt: ${noPrompt.join(', ')}.`);
    const noVersion = list.filter((a) => !(a.versioni || []).length).map((a) => a.nome || 'senza nome');
    if (noVersion.length) w.push(`Nessuna versione congelata per: ${noVersion.join(', ')}. Congelate almeno la prima.`);
    return {
      checks: [list.filter((a) => filled(a.prompt)).length / list.length, (list.length - noVersion.length) / list.length],
      warnings: w,
    };
  },
  workflow(doc) {
    const plan = planCheck(doc);
    const w = plan.checks.filter((c) => !c.ok).map((c) => `Verifica del piano: ${c.label.toLowerCase()} — non ancora.${c.detail ? ' ' + c.detail + '.' : ''}`);
    const missing = WORKFLOW_KEYS.filter((k) => !filled(doc.workflow?.[k])).length;
    if (missing) w.push(`${missing} domande sul workflow senza risposta.`);
    return { checks: [ratio(doc.workflow, WORKFLOW_KEYS), plan.checks.filter((c) => c.ok).length / plan.checks.length], warnings: w };
  },
  tests(doc) {
    const list = items(doc.tests);
    const w = [];
    const quota = Object.entries(TEST_QUOTE).map(([t, n]) => {
      const have = list.filter((x) => x.tipo === t).length;
      if (have < n) w.push(`Test ${TEST_TIPI[t].toLowerCase()}: ${have} di ${n}.`);
      return Math.min(have, n) / n;
    });
    const nonEseguiti = list.filter((t) => !filled(t.esito)).length;
    if (nonEseguiti) w.push(`${nonEseguiti} test senza esito.`);
    if (!filled(doc.testsNote?.correzioni)) w.push('Mancano le correzioni fatte dopo i test.');
    return { checks: [avg(quota), avg(list.map((t) => ratio(t, TEST_KEYS))), filled(doc.testsNote?.correzioni) ? 1 : 0], warnings: w };
  },
  analisi(doc) {
    const a = doc.analisi || {};
    const w = [];
    const outs = OUTPUTS.map((o) => ratio(a[o.key], ANALISI_OUT_KEYS));
    OUTPUTS.forEach((o, i) => { if (outs[i] < 1) w.push(`${o.label}: analisi incompleta.`); });
    if (!filled(a.danno)) w.push('Manca la risposta a "Se andasse in produzione domani…".');
    if (!filled(a.consiglio)) w.push('Manca la risposta alla domanda del Consiglio.');
    return { checks: [...outs, ratio(a, ['danno', 'consiglioDomanda', 'consiglio', 'cambiato'])], warnings: w };
  },
  etica(doc) {
    const e = doc.etica || {};
    const w = [];
    const qs = DOMANDE_ETICA.map((_, i) => ratio(e['q' + (i + 1)], ['previsto', 'osservato', 'cambiamo']));
    const incomplete = qs.filter((r) => r < 1).length;
    if (incomplete) w.push(`${incomplete} domande della checklist ancora incomplete.`);
    if (!filled(e.fascia)) w.push("Manca la fascia dell'AI Act.");
    if (!filled(e.supervisione)) w.push('Manca il livello di supervisione.');
    return {
      checks: [avg(qs), ratio(e, ['fascia', 'fasciaMotivo', 'supervisione', 'rischi']), ratio(e.bilancio, ['chiamate', 'taglie', 'eliminato', 'proiezione', 'compiti'])],
      warnings: w,
    };
  },
  competenze(doc) {
    const c = doc.competenze || {};
    const w = [];
    const rows = COMPETENZE.map((k) => ratio(c[k.key], COMP_KEYS));
    const incomplete = rows.filter((r) => r < 1).length;
    if (incomplete) w.push(`${incomplete} competenze ancora da valutare.`);
    const finali = ratio(c, ['lezioni', 'raccomandazione', 'nonauto', 'usoai']);
    if (finali < 1) w.push('Mancano lezioni, raccomandazione, cosa non automatizzare o uso dell\'AI.');
    return { checks: [avg(rows), finali], warnings: w };
  },
};

/** Stato di una sezione: { pct (0–100), warnings[] }. */
export function sectionStatus(key, doc) {
  const { checks, warnings } = SCORERS[key](doc || {});
  return { pct: Math.round(avg(checks) * 100), warnings };
}

/** Riepilogo del capitolo: percentuali per sezione, totale, sezioni complete, punti potenziali. */
export function completion(doc) {
  const sections = {};
  for (const s of SECTIONS) sections[s.key] = sectionStatus(s.key, doc);
  const pcts = Object.values(sections).map((s) => s.pct);
  const complete = pcts.filter((p) => p === 100).length;
  return {
    sections,
    total: Math.round(avg(pcts)),
    complete,
    puntiPotenziali: complete * PUNTI_TAPPA,
  };
}

/** Totale della lavagna per un gruppo. */
export function boardTotal(b) {
  const p = b?.punti || {};
  const sum = ['tappe', 'quiz', 'revisione', 'consiglio'].reduce((t, k) => t + (Number(p[k]) || 0), 0);
  return sum + (b?.badges?.length || 0) * PUNTI_BADGE;
}

// ---------------------------------------------------------------------------
// Etichette e placeholder dei campi (usati sia dalla UI sia dall'export)
// ---------------------------------------------------------------------------

export const FIELDS = {
  scenario: [
    { key: 'contesto', label: 'Contesto', ph: 'Organizzazione, settore, chi lavora lì' },
    { key: 'problema', label: 'Problema', ph: 'Cosa va storto oggi, quanto spesso, cosa costa' },
    { key: 'processo', label: 'Processo attuale', ph: 'I passi di oggi, chi li fa, con quali strumenti' },
    { key: 'stakeholder', label: 'Stakeholder', ph: 'Chi usa, chi è toccato, chi decide, chi controlla' },
    { key: 'obiettivo', label: 'Obiettivo e misura di successo', ph: 'Cosa deve essere vero alla fine; come lo misuriamo (numeri!)' },
    { key: 'dati', label: 'Dati e documenti', ph: 'Cosa entra nel sistema; cosa è sensibile' },
    { key: 'etica', label: 'Vincoli etici', ph: 'Dalla checklist: le 3 domande più critiche' },
    { key: 'sostenibilita', label: 'Sostenibilità', ph: 'Volume atteso; compiti umani toccati' },
    { key: 'nonai', label: 'Cosa resta volutamente umano', ph: 'Le decisioni e i momenti che non affidiamo all\'AI, e perché' },
  ],
  persona: [
    { key: 'giornata', label: 'Una giornata tipo', ph: 'Cosa fa dal mattino alla sera; dove incontra il problema' },
    { key: 'obiettivi', label: 'Obiettivi', ph: 'Cosa vuole ottenere, in parole sue' },
    { key: 'frustrazioni', label: 'Frustrazioni', ph: 'Cosa la fa arrabbiare o perdere tempo oggi' },
    { key: 'ai', label: "Rapporto con l'AI", ph: 'Fiducia, timori, esperienze precedenti' },
    { key: 'vulnerabilita', label: 'Vulnerabilità', ph: 'Cosa rischia se il sistema sbaglia o la esclude' },
    { key: 'frase', label: 'Una frase tipica', ph: '"…" — qualcosa che direbbe davvero' },
  ],
  mockup: [
    { key: 'prima', label: 'Prima · la schermata iniziale', ph: "Cosa vede l'utente quando arriva; cosa gli chiediamo" },
    { key: 'durante', label: "Durante · l'interazione", ph: 'Come si svolge lo scambio con il sistema, passo per passo' },
    { key: 'dopo', label: 'Dopo · il risultato', ph: "Cosa ottiene l'utente; cosa succede dopo" },
    { key: 'ai', label: "Dove si vede che è un'AI", ph: 'Avvisi, etichette, limiti dichiarati' },
    { key: 'socratico', label: "Dove l'agente fa domande invece di rispondere", ph: 'Il momento socratico: quale domanda, a chi, perché' },
    { key: 'approva', label: "Dove l'utente approva o corregge", ph: 'Pulsanti, conferme, modifiche possibili' },
    { key: 'supervisore', label: 'Cosa vede il supervisore', ph: 'Registro, segnalazioni, possibilità di fermare' },
    { key: 'errore', label: "Cosa succede quando l'AI sbaglia", ph: 'Come se ne accorge l\'utente; come rimedia' },
  ],
  agent: [
    { key: 'ruolo', label: 'Ruolo', ph: 'In una frase: cosa fa e cosa NON fa' },
    { key: 'obiettivo', label: 'Obiettivo', ph: 'Il risultato che deve produrre' },
    { key: 'precond', label: 'Precondizioni', ph: 'Cosa deve essere vero prima che parta (input, dati, approvazioni)' },
    { key: 'effetti', label: 'Effetti', ph: 'Cosa è vero dopo: quale output, in quale formato, per chi' },
    { key: 'regole', label: 'Regole e limiti', ph: 'Cosa non deve mai fare; quando deve fermarsi' },
    { key: 'strumenti', label: 'Strumenti e documenti', ph: 'A cosa ha accesso (e a cosa no)' },
    { key: 'umano', label: 'Quando passa la mano a un umano', ph: 'Le situazioni in cui chiede aiuto o rinuncia' },
  ],
  workflow: [
    { key: 'motivazione', label: 'Perché questo pattern', ph: 'Cosa vi fa preferire questo schema per il vostro scenario' },
    { key: 'alternativa', label: 'Alternativa scartata', ph: 'Quale altro pattern avete considerato e perché no' },
    { key: 'ultimo', label: "Chi ha l'ultima parola", ph: "Sull'output finale decide un agente o una persona? Chi?" },
    { key: 'togliere', label: 'Cosa potreste togliere', ph: 'Quale agente o passo si può eliminare senza perdere qualità?' },
    { key: 'nonso', label: 'Quando un agente "non sa"', ph: 'Cosa succede se un agente non ha la risposta: a chi passa?' },
    { key: 'approvazione', label: 'Dove serve approvazione umana', ph: "Il punto in cui nulla procede senza un sì di una persona" },
  ],
  bilancio: [
    { key: 'chiamate', label: 'Chiamate per caso', ph: 'Quante chiamate al modello per un caso tipico' },
    { key: 'taglie', label: 'Taglie dei modelli', ph: 'Quali modelli e perché proprio quella taglia' },
    { key: 'eliminato', label: 'Cosa abbiamo eliminato', ph: 'Agenti, passi o chiamate tolti per sobrietà' },
    { key: 'proiezione', label: 'Proiezione', ph: 'Volume annuo × chiamate: ordine di grandezza del costo ed energia' },
    { key: 'compiti', label: 'Compiti umani toccati', ph: 'Quali compiti cambiano, spariscono o nascono' },
  ],
  competenzeFinali: [
    { key: 'lezioni', label: 'Tre lezioni', ph: '1. …\n2. …\n3. …' },
    { key: 'raccomandazione', label: 'Raccomandazione per un formatore', ph: 'Cosa consigliereste a chi rifà questo percorso con un altro gruppo' },
    { key: 'nonauto', label: 'Cosa non automatizzeremmo', ph: 'Il compito che, dopo due giorni, lascereste a una persona — e perché' },
    { key: 'usoai', label: 'Dove abbiamo usato un assistente AI', ph: 'In quali capitoli, per cosa, cosa avete corretto' },
  ],
};

// ---------------------------------------------------------------------------
// Riuso di agenti tra Task Force
// ---------------------------------------------------------------------------
// Il riuso è una COPIA con provenienza, non un collegamento: ogni gruppo deve
// adattare precondizioni, regole e prompt al proprio scenario, e le modifiche
// del gruppo d'origine non devono cambiare il capitolo di chi ha riusato.

const AGENT_COPY_KEYS = ['nome', 'ruolo', 'obiettivo', 'precond', 'effetti', 'regole', 'strumenti', 'umano', 'modello', 'temperatura', 'socratico', 'domande', 'prompt'];

/** Copia di un agente di un altro gruppo, pronta da inserire in `agents`. */
export function reuseAgent(agent, group) {
  const copy = {};
  for (const k of AGENT_COPY_KEYS) if (agent[k] !== undefined) copy[k] = agent[k];
  return {
    ...copy,
    versioni: [],
    adattamento: '',
    origine: { groupId: group.id, groupName: group.name, agentId: agent.id, nome: agent.nome || '', at: new Date().toISOString() },
  };
}

/** Nomi delle Task Force che hanno riusato un certo agente. */
export function reusers(groups, agentId) {
  return groups.filter((g) => items(g.data?.agents).some((a) => a.origine?.agentId === agentId)).map((g) => g.name);
}
