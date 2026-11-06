// Export in LaTeX: un progetto pronto per Overleaf (o per latexmk in locale).
//
// Struttura del libro: una \part per Task Force (in ordine di settore), ognuna con
// gli 11 \chapter del percorso (numerati da 1 in ogni parte); in appendice il
// registro degli agenti e le lezioni apprese. Ogni parte, capitolo e agente ha
// una \label, così nel progetto Overleaf si possono usare \ref e \hyperref.
//
// Il testo degli studenti è libero (emoji, simboli…): lo convertiamo in LaTeX
// sicuro per pdfLaTeX, il compilatore predefinito di Overleaf, che si fermerebbe
// davanti a un carattere Unicode che non conosce.

import {
  SECTIONS, FIELDS, PERSONA_TIPI, MODELLI, PATTERNS, LIVELLI_UMANO, TEST_TIPI, ESITI,
  OUTPUTS, CRITERI, FASCE, SUPERVISIONE, DOMANDE_ETICA, COMPETENZE, LIVELLI_COMP,
  items, filled, reusers,
} from '../public/js/model.js';
import { bookOrder, roman } from './export.js';
import {
  workflowsOf, graphOf, graphCheck, buildCatalog, readingOrder, resolveAgent, nodeLabel, nodeSub,
  isExternal, usedIn, NODE_W, NODE_H,
} from '../public/js/grafo-core.js';

// ---------------------------------------------------------------------------
// Testo → LaTeX
// ---------------------------------------------------------------------------

/** Caratteri speciali di LaTeX e simboli tipografici comuni. */
const TEX_MAP = {
  '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', $: '\\$', '&': '\\&', '#': '\\#', '%': '\\%', _: '\\_',
  '^': '\\textasciicircum{}', '~': '\\textasciitilde{}', '<': '\\textless{}', '>': '\\textgreater{}', '|': '\\textbar{}',
  '[': '{[}', ']': '{]}', '"': '\\textquotedbl{}', '\t': ' ', '\u00a0': '~',
  '→': '$\\rightarrow$', '←': '$\\leftarrow$', '↔': '$\\leftrightarrow$', '⇒': '$\\Rightarrow$', '↓': '$\\downarrow$', '↑': '$\\uparrow$',
  '✓': '\\checkmark{}', '✔': '\\checkmark{}', '✅': '\\checkmark{}', '✗': '$\\times$', '✕': '$\\times$', '❌': '$\\times$', '×': '$\\times$',
  '≤': '$\\leq$', '≥': '$\\geq$', '≈': '$\\approx$', '≠': '$\\neq$', '±': '$\\pm$', '★': '$\\star$', '☆': '$\\star$',
  '•': '\\textbullet{}', '…': '\\dots{}', '€': '\\texteuro{}', '–': '--', '—': '---', '‑': '-',
  '“': '``', '”': "''", '„': ',,', '‘': '`', '’': "'", '«': '\\guillemotleft{}', '»': '\\guillemotright{}',
  '·': '\\textperiodcentered{}', '°': '\\textdegree{}', '§': '\\S{}', '¶': '\\P{}', '©': '\\textcopyright{}', '®': '\\textregistered{}',
};

/** Vero per i caratteri che pdfLaTeX (T1 + utf8) stampa senza aiuto. */
const passThrough = (cp) => (cp >= 32 && cp < 127) || (cp >= 0xa1 && cp <= 0x17f && cp !== 0xd7);

/** Una riga di testo libero → LaTeX. I caratteri sconosciuti (emoji…) vengono tolti. */
export function tex(value) {
  let out = '';
  for (const ch of String(value ?? '').normalize('NFC')) {
    if (ch in TEX_MAP) out += TEX_MAP[ch];
    else if (passThrough(ch.codePointAt(0))) out += ch;
    // altrimenti: carattere non stampabile con pdfLaTeX, lo omettiamo
  }
  return out.replace(/ {2,}/g, ' ');
}

const NA = '\\textit{---}';

/** Testo su più righe: i paragrafi restano paragrafi, gli a capo diventano \newline. */
export function texBlock(value, { inCell = false } = {}) {
  if (!filled(value)) return NA;
  const paras = String(value).replace(/\r/g, '').trim().split(/\n\s*\n/)
    .map((p) => p.split('\n').map((l) => tex(l.trim())).filter(Boolean).join(' \\newline\n'));
  return paras.join(inCell ? ' \\newline\n' : '\n\n');
}
const cellTex = (v) => texBlock(v, { inCell: true });

/** Testo dentro Verbatim: niente da escapare, ma solo caratteri che pdfLaTeX conosce. */
const VERB_MAP = { '→': '->', '←': '<-', '⇒': '=>', '…': '...', '–': '-', '—': '--', '“': '"', '”': '"', '‘': "'", '’': "'", '\t': '  ', '\u00a0': ' ', '•': '*', '✓': 'v', '✗': 'x', '×': 'x' };
export function verbText(value) {
  let out = '';
  for (const ch of String(value ?? '').replace(/\r/g, '').normalize('NFC')) {
    if (ch === '\n') out += ch;
    else if (ch in VERB_MAP) out += VERB_MAP[ch];
    else if (passThrough(ch.codePointAt(0)) || ch === '«' || ch === '»') out += ch;
    else out += '?';
  }
  return out.replace(/\\end\{Verbatim\}/g, '\\end {Verbatim}').replace(/\s+$/, '');
}
const verbatim = (text, opts = '') => `\\begin{Verbatim}[${['breaklines', 'breakanywhere', 'fontsize=\\small', 'frame=single', 'rulecolor=\\color{linea}', 'framesep=6pt', opts].filter(Boolean).join(',')}]\n${verbText(text) || '(vuoto)'}\n\\end{Verbatim}\n`;

/** Pezzo sicuro per una \label: lettere, cifre e trattini. */
export const labelSlug = (s) => String(s || 'x').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'x';

// ---------------------------------------------------------------------------
// Blocchi ricorrenti
// ---------------------------------------------------------------------------

/** Tabella lunga (si spezza tra le pagine) con colonne a larghezza data. */
function longTable(cols, headers, rows) {
  if (!rows.length) return '\\textit{Nessuna riga.}\n';
  return [
    '{\\small',
    `\\begin{xltabular}{\\linewidth}{@{}${cols}@{}}`,
    '\\toprule',
    headers.map((x) => `\\textbf{${tex(x)}}`).join(' & ') + ' \\\\',
    '\\midrule\n\\endhead',
    '\\bottomrule\n\\endfoot',
    rows.map((r) => r.join(' & ') + ' \\\\').join('\n\\addlinespace[2pt]\n'),
    '\\end{xltabular}}\n',
  ].join('\n');
}

const campo = (label, value) => `\\campo{${tex(label)}}{${texBlock(value)}}\n`;
const campi = (obj, defs) => defs.map((f) => campo(f.label, obj?.[f.key])).join('\n');
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : '');

// ---------------------------------------------------------------------------
// Schede degli agenti, diagrammi e workflow (usati dal catalogo, dalla Parte II
// e dall'export della singola Task Force)
// ---------------------------------------------------------------------------

/** Il riferimento a un agente: link alla sua scheda se è nel libro, altrimenti solo il nome. */
function agentRef(groupId, agentId, name, ctx) {
  const lab = ctx.agentLabel?.(groupId, agentId);
  return lab ? `\\hyperref[${lab}]{${tex(name)}}` : tex(name);
}

/** La scheda di un agente: etichette, origine, dove è usato, campi; con o senza prompt. */
export function agentSectionTex(a, g, ctx, { heading = 'section', withPrompt = true, slug } = {}) {
  const out = [];
  const label = ctx.agentLabel?.(g.id, a.id) || `agente:${slug || labelSlug(g.name)}:${labelSlug(a.id)}`;
  out.push(`\\${heading}{${tex(a.nome || 'Agente senza nome')}}\\label{${label}}`);
  const tags = [a.socratico ? 'socratico' : null, MODELLI[a.modello] ? `modello ${MODELLI[a.modello].toLowerCase()}` : null,
    a.temperatura !== undefined && a.temperatura !== '' ? `temperatura ${a.temperatura}` : null].filter(Boolean);
  if (tags.length) out.push(`\\noindent${tags.map((t) => `\\etichetta{${tex(t)}}`).join('~')}\\par\\smallskip`);
  out.push(`\\noindent\\textit{Task Force ${tex(g.name)}.}\\par\\smallskip`);
  if (a.origine) {
    const who = `${tex(a.origine.nome || 'un agente')} di \\guillemotleft{}${tex(a.origine.groupName)}\\guillemotright{}`;
    const src = ctx.agentLabel?.(a.origine.groupId, a.origine.agentId);
    out.push(`\\noindent\\textit{Copiato e adattato da ${src ? `\\hyperref[${src}]{${who}}` : who}.}\\par\\smallskip`);
  }
  const by = reusers(ctx.groups || [g], a.id);
  if (by.length) out.push(`\\noindent\\textit{Copiato da: ${by.map(tex).join(', ')}.}\\par\\smallskip`);
  const where = usedIn(ctx.groups || [g], g.id, a.id);
  out.push(`\\noindent\\textit{Nei workflow: ${where.length ? where.map(({ group, wf }) => {
    const wl = ctx.wfLabel?.(group.id, wf.id);
    const name = `${tex(wf.nome || 'Workflow')}${group.id === g.id ? '' : ` (${tex(group.name)})`}`;
    return wl ? `\\hyperref[${wl}]{${name}}` : name;
  }).join(', ') : 'nessuno'}.}\\par\\smallskip`);
  out.push('\\begin{description}[style=nextline,leftmargin=1em,labelindent=0pt]');
  for (const f of FIELDS.agent) out.push(`  \\item[${tex(f.label)}] ${texBlock(a[f.key])}`);
  if (a.socratico) out.push(`  \\item[Domande socratiche] ${texBlock(a.domande)}`);
  if (a.origine) out.push(`  \\item[Cosa abbiamo adattato] ${texBlock(a.adattamento)}`);
  out.push('\\end{description}');
  if (withPrompt) out.push(promptTex(a, heading === 'section' ? 'subsection*' : 'subsubsection*'));
  return out.join('\n') + '\n';
}

/** Il prompt corrente e la storia delle versioni. */
function promptTex(a, heading = 'subsection*') {
  const versioni = Array.isArray(a.versioni) ? a.versioni : [];
  const out = [`\\${heading}{Prompt (versione corrente${versioni.length ? `, dopo v${versioni.length}` : ''})}`, verbatim(a.prompt)];
  if (versioni.length) {
    out.push(`\\${heading}{Storia delle versioni}`);
    versioni.forEach((v) => {
      out.push(`\\paragraph{v${v.n} \\textperiodcentered{} ${tex(fmtDate(v.at))}} ${texBlock(v.nota)}\\par`);
      out.push(verbatim(v.prompt, 'fontsize=\\footnotesize'));
    });
  }
  return out.join('\n');
}

/**
 * Il grafo di un workflow in TikZ. Le posizioni vengono dal compositore, ma le
 * distanze sono fisse in centimetri (abbastanza per due o tre righe di testo):
 * se il diagramma è più largo della pagina viene ridotto in blocco, così i nodi
 * non si sovrappongono mai.
 */
export function tikzGraph(wf, c) {
  const { nodes, edges } = graphOf(wf);
  if (!nodes.length) return '\\textit{Grafo vuoto.}\n';
  const minX = Math.min(...nodes.map((n) => n.x ?? 0));
  const minY = Math.min(...nodes.map((n) => n.y ?? 0));
  const KX = 3.3 / 240; // cm per pixel in orizzontale (una colonna del compositore = 3,3 cm)
  const KY = 2.0 / 100; // cm per pixel in verticale (una riga = 2 cm)
  const BOX_W = 2.9;
  const width = Math.max(...nodes.map((n) => ((n.x ?? 0) - minX) * KX)) + BOX_W;
  const id = new Map(nodes.map((n, i) => [n.id, `n${i + 1}`]));
  const style = { agente: 'tipo-agente', umano: 'tipo-umano', input: 'tipo-io', output: 'tipo-io' };
  const lines = ['\\begin{tikzpicture}'];
  for (const n of nodes) {
    const ext = n.tipo === 'agente' && isExternal(n.agente);
    const sub = n.tipo === 'umano' || ext ? `\\\\[-1pt]{\\scriptsize ${tex(nodeSub(n, c.doc, c.catalog, c.groupId))}}` : '';
    const x = (((n.x ?? 0) - minX) * KX + BOX_W / 2).toFixed(2);
    const y = (-((n.y ?? 0) - minY) * KY).toFixed(2);
    lines.push(`  \\node[nodo, ${style[n.tipo] || 'tipo-agente'}${ext ? ', esterno' : ''}] (${id.get(n.id)}) at (${x},${y}) {\\textbf{${tex(nodeLabel(n, c.doc, c.catalog, c.groupId))}}${sub}};`);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) {
    const a = byId.get(e.da); const b = byId.get(e.a);
    const lbl = filled(e.condizione) ? ` node[etichetta-freccia] {${tex(e.condizione)}}` : '';
    const dx = (b.x ?? 0) - (a.x ?? 0); const dy = (b.y ?? 0) - (a.y ?? 0);
    if (e.ritorno) {
      // il ritorno passa sopra i nodi, dove non c'è niente
      lines.push(`  \\draw[freccia, dashed] (${id.get(e.da)}.north) to[out=90, in=90, looseness=1.1]${lbl.replace('etichetta-freccia', 'etichetta-freccia, above')} (${id.get(e.a)}.north);`);
    } else if (Math.abs(dx) < NODE_W) {
      // stessa colonna: dall'alto in basso (o viceversa)
      lines.push(dy >= 0
        ? `  \\draw[freccia] (${id.get(e.da)}.south) -- ${lbl ? lbl.replace('etichetta-freccia', 'etichetta-freccia, right, pos=0.5') : ''} (${id.get(e.a)}.north);`
        : `  \\draw[freccia] (${id.get(e.da)}.north) -- ${lbl ? lbl.replace('etichetta-freccia', 'etichetta-freccia, right, pos=0.5') : ''} (${id.get(e.a)}.south);`);
    } else {
      // curve divaricate quando il nodo d'arrivo è più in alto o più in basso
      const out = dy < -10 ? 25 : dy > 10 ? -25 : 0;
      lines.push(`  \\draw[freccia] (${id.get(e.da)}.east) to[out=${out}, in=180]${lbl} (${id.get(e.a)}.west);`);
    }
  }
  lines.push('\\end{tikzpicture}');
  const body = lines.join('\n');
  // più largo della pagina: riduzione in blocco (testo compreso), senza sovrapposizioni
  return `\\begin{center}\n${width > 15.5 ? `\\resizebox{\\linewidth}{!}{%\n${body}%\n}` : body}\n\\end{center}\n`;
}

/** Un workflow: diagramma, come funziona (con i rimandi alle schede), verifica, domande. */
export function workflowTex(wf, g, ctx, { heading = 'chapter', withGroup = false } = {}) {
  const c = { doc: g.data, catalog: ctx.catalog, groupId: g.id };
  const out = [];
  const lab = ctx.wfLabel?.(g.id, wf.id);
  out.push(`\\${heading}{${tex(wf.nome || 'Workflow')}${withGroup ? ` \\textperiodcentered{} ${tex(g.name)}` : ''}}${lab ? `\\label{${lab}}` : ''}`);
  out.push(`\\noindent\\etichetta{${tex(PATTERNS[wf.pattern] || wf.pattern || 'pattern non indicato')}}~\\textit{Task Force ${tex(g.name)}.}\\par\\medskip`);
  if (filled(wf.motivazione)) out.push(campo('Perché questo pattern', wf.motivazione));
  out.push(tikzGraph(wf, c));
  const sub = heading === 'chapter' ? 'section*' : 'subsection*';
  out.push(`\\${sub}{Come funziona}`);
  const steps = readingOrder(wf, c).filter((r) => r.node.tipo !== 'output');
  if (!steps.length) out.push('\\textit{Grafo vuoto.}\n');
  else {
    out.push('\\begin{enumerate}[leftmargin=*]');
    for (const r of steps) {
      let who;
      if (r.node.tipo === 'umano') who = `\\colorbox{giallo!45}{\\textbf{${tex(r.label)}}} --- ${tex(r.sub)}`;
      else if (r.node.tipo === 'input') who = `\\textbf{${tex(r.label)}}`;
      else {
        const res = resolveAgent(r.node.agente, c.doc, c.catalog, c.groupId);
        const [gid, aid] = isExternal(r.node.agente) ? r.node.agente.split('/') : [g.id, r.node.agente];
        who = `\\textbf{${res ? agentRef(gid, aid, r.label, ctx) : tex(r.label)}}${isExternal(r.node.agente) ? ` \\textit{(${tex(r.sub)})}` : ''}`;
      }
      const to = r.to.map((t) => `${tex(t.label)}${filled(t.condizione) ? ` se ${tex(t.condizione)}` : ''}${t.ritorno ? ' (ritorno)' : ''}`).join('; ');
      out.push(`  \\item ${who}${filled(r.node.nota) ? `: ${tex(r.node.nota)}` : ''}${to ? ` $\\rightarrow$ ${to}` : ''}`);
    }
    out.push('\\end{enumerate}');
  }
  out.push(`\\${sub}{Verifica del grafo}\n\\begin{itemize}[leftmargin=*]`);
  for (const k of graphCheck(wf, c).checks) out.push(`  \\item[${k.ok ? '\\textcolor{verde}{\\checkmark}' : '\\textcolor{rosso}{$\\square$}'}] ${tex(k.label)}${k.detail ? ` (${tex(k.detail)})` : ''}`);
  out.push('\\end{itemize}');
  out.push(campi(wf, FIELDS.workflow.slice(1)));
  if (filled(wf.passi)) out.push(campo('I passi in parole', wf.passi));
  if (filled(wf.dsl)) out.push(`\\${sub}{Configurazione del workflow}`, verbatim(wf.dsl));
  if (filled(wf.screenshot)) out.push(campo('Screenshot', wf.screenshot));
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Una Task Force → una \part con 11 capitoli
// ---------------------------------------------------------------------------

/**
 * @param group  { id, name, data }
 * @param ctx.slug       prefisso delle label di questa parte
 * @param ctx.agentLabel funzione (groupId, agentId) → label dell'agente, se esiste nel libro
 */
export function groupToLatex(group, { slug = labelSlug(group.name), agentLabel = () => null, wfLabel = () => null, allGroups = [group], inBook = false } = {}) {
  const ctx = { agentLabel, wfLabel, groups: allGroups, catalog: buildCatalog(allGroups) };
  const d = group.data || {};
  const out = [];
  const L = (key) => `cap:${slug}:${key}`;
  const chapter = (key) => {
    const s = SECTIONS.find((x) => x.key === key);
    out.push(`\n\\chapter{${tex(s.titolo)}}\\label{${L(key)}}\n`);
  };
  const titolo = filled(d.titolo) ? d.titolo.trim() : group.name;
  const sottotitolo = [`Task Force ${group.name}`, d.settore].filter(filled).map(tex).join(' \\textperiodcentered{} ');

  out.push(`% ${'='.repeat(70)}\n% Task Force: ${verbText(group.name).replace(/\n/g, ' ')}\n% ${'='.repeat(70)}`);
  out.push(`\\part[${tex(titolo)}]{${tex(titolo)}\\\\[2ex]{\\Large\\normalfont ${sottotitolo}}${filled(d.membri) ? `\\\\[1ex]{\\large\\normalfont\\itshape ${tex(d.membri.trim())}}` : ''}}\\label{part:${slug}}\n`);

  const personas = items(d.personas);
  const personaName = new Map(personas.map((p, i) => [p.id, `P${i + 1} ${p.nome || ''}`.trim()]));
  const agents = items(d.agents);

  // 1 · Scenario
  chapter('scenario');
  out.push(`\\begin{induefrasi}\n${texBlock(d.sintesi)}\n\\end{induefrasi}\n`);
  out.push(`\\noindent\\textbf{Autori:} ${filled(d.membri) ? tex(d.membri.trim()) : NA}\\par\\medskip\n`);
  out.push(campi(d.scenario, FIELDS.scenario));
  if (filled(d.scenario?.foto)) out.push(campo('Foto della lavagna', d.scenario.foto));

  // 2 · Personas
  chapter('personas');
  if (!personas.length) out.push('\\textit{Nessuna persona.}\n');
  personas.forEach((p, i) => {
    out.push(`\\section{P${i + 1} \\textperiodcentered{} ${tex(p.nome || 'Senza nome')}}\\label{persona:${slug}:${labelSlug(p.id)}}`);
    out.push(`\\noindent\\etichetta{${tex(PERSONA_TIPI[p.tipo] || 'tipo non indicato')}}\\par\\smallskip`);
    if (filled(p.frase)) out.push(`\\begin{quote}\\itshape ${texBlock(p.frase)}\\end{quote}`);
    out.push('\\begin{description}[style=nextline,leftmargin=1em,labelindent=0pt]');
    for (const f of FIELDS.persona.filter((x) => x.key !== 'frase')) out.push(`  \\item[${tex(f.label)}] ${texBlock(p[f.key])}`);
    if (p.aiDraft) out.push(`  \\item[Bozza con AI: cosa abbiamo cambiato] ${texBlock(p.modifiche)}`);
    out.push('\\end{description}\n');
  });

  // 3 · User stories
  chapter('stories');
  const stories = items(d.stories);
  out.push(longTable('P{0.5cm}P{2.6cm}LLP{4.2cm}P{1.1cm}', ['#', 'Come…', 'voglio…', 'per…', 'Dato / quando / allora', 'Neg.'], stories.map((s, i) => [
    String(i + 1), cellTex(personaName.get(s.persona)), cellTex(s.voglio), cellTex(s.per),
    `\\textbf{Dato} ${filled(s.dato) ? tex(s.dato) : '\\dots'}; \\textbf{quando} ${filled(s.quando) ? tex(s.quando) : '\\dots'}; \\textbf{allora} ${filled(s.allora) ? tex(s.allora) : '\\dots'}`,
    s.negativa ? 'sì' : 'no',
  ])));

  // 4 · Mockup
  chapter('mockup');
  out.push(campi(d.mockup, FIELDS.mockup));
  if (filled(d.mockup?.foto)) out.push(campo('Foto del mockup', d.mockup.foto));

  // 5 · Agenti, 6 · Prompt e versioni, 7 · Workflow
  // nel libro rimandano al catalogo (Parte I) e ai workflow (Parte II); da soli contengono tutto
  const wfs = workflowsOf(d);
  if (inBook) {
    chapter('agents');
    if (!agents.length) out.push('\\textit{Nessun agente.}\n');
    else {
      out.push('Le schede complete, con prompt e versioni, sono nella Parte~\\ref{part:catalogo}.\n\\begin{itemize}[leftmargin=*]');
      for (const a of agents) out.push(`  \\item \\textbf{${agentRef(group.id, a.id, a.nome || 'Agente senza nome', ctx)}}${a.socratico ? ' (socratico)' : ''} --- ${tex(a.ruolo || '')}`);
      out.push('\\end{itemize}');
    }
    chapter('prompt');
    out.push(agents.length ? 'I prompt, nella versione corrente e con la storia delle versioni, sono nelle schede della Parte~\\ref{part:catalogo}.\n' : '\\textit{Nessun agente.}\n');
    chapter('workflow');
    if (!wfs.length) out.push('\\textit{Nessun workflow.}\n');
    else {
      out.push('I diagrammi e la verifica sono nella Parte~\\ref{part:workflow}.\n\\begin{itemize}[leftmargin=*]');
      for (const wf of wfs) {
        const wl = wfLabel(group.id, wf.id);
        out.push(`  \\item \\textbf{${wl ? `\\hyperref[${wl}]{${tex(wf.nome || 'Workflow')}}` : tex(wf.nome || 'Workflow')}} --- ${tex(PATTERNS[wf.pattern] || wf.pattern || 'pattern non indicato')}`);
      }
      out.push('\\end{itemize}');
    }
  } else {
    chapter('agents');
    if (!agents.length) out.push('\\textit{Nessun agente.}\n');
    agents.forEach((a) => out.push(agentSectionTex(a, group, ctx, { withPrompt: false, slug })));
    chapter('prompt');
    if (!agents.length) out.push('\\textit{Nessun agente.}\n');
    agents.forEach((a) => out.push(`\\section{Prompt di ${tex(a.nome || 'agente senza nome')}}`, promptTex(a)));
    chapter('workflow');
    if (!wfs.length) out.push('\\textit{Nessun workflow.}\n');
    wfs.forEach((wf) => out.push(workflowTex(wf, group, ctx, { heading: 'section' })));
  }

  // 8 · Test
  chapter('tests');
  const tests = items(d.tests);
  const count = (k, v) => tests.filter((t) => t[k] === v).length;
  out.push(`\\noindent Casi: ${tests.length} (${Object.entries(TEST_TIPI).map(([k, l]) => `${tex(l.toLowerCase())} ${count('tipo', k)}`).join(', ')}).\\newline`);
  out.push(`Esiti: ${Object.entries(ESITI).map(([k, l]) => `${tex(l.toLowerCase())} ${count('esito', k)}`).join(', ')}.\\par\\medskip\n`);
  out.push(longTable('P{0.4cm}P{1.3cm}LLLP{1.4cm}P{0.9cm}', ['#', 'Tipo', 'Input', 'Atteso', 'Ottenuto', 'Esito', 'Chiam.'], tests.map((t, i) => [
    String(i + 1), cellTex(TEST_TIPI[t.tipo] || t.tipo), cellTex(t.input), cellTex(t.atteso),
    cellTex(t.ottenuto) + (filled(t.note) ? ` \\newline\\textit{${tex(t.note)}}` : ''), cellTex(ESITI[t.esito] || t.esito), filled(t.chiamate) ? tex(t.chiamate) : NA,
  ])));
  out.push(campo('Correzioni dopo i test', d.testsNote?.correzioni));

  // 9 · Analisi critica
  chapter('analisi');
  const an = d.analisi || {};
  out.push(longTable('P{2.2cm}LLL', ['Criterio', ...OUTPUTS.map((o) => o.label.replace('Output ', 'Output\u00a0'))], [
    ['\\textbf{Caso}', ...OUTPUTS.map((o) => cellTex(an[o.key]?.caso))],
    ...CRITERI.map((c) => [`\\textbf{${tex(c.label)}}`, ...OUTPUTS.map((o) => cellTex(an[o.key]?.[c.key]))]),
  ]));
  out.push(campo('Se andasse in produzione domani, quale sarebbe il danno peggiore?', an.danno));
  out.push(campo('La domanda del Consiglio', an.consiglioDomanda));
  out.push(campo('La nostra risposta', an.consiglio));
  out.push(campo('Cosa abbiamo cambiato', an.cambiato));

  // 10 · Etica e sostenibilità
  chapter('etica');
  const e = d.etica || {};
  out.push(longTable('P{0.4cm}P{4cm}LLL', ['#', 'Domanda', 'Previsto (ven.)', 'Osservato (sab.)', 'Cosa cambiamo'], DOMANDE_ETICA.map((q, i) => {
    const r = e['q' + (i + 1)] || {};
    return [String(i + 1), tex(q), cellTex(r.previsto), cellTex(r.osservato), cellTex(r.cambiamo)];
  })));
  out.push(campo("Fascia dell'AI Act", [FASCE[e.fascia], e.fasciaMotivo].filter(filled).join('. ')));
  out.push(campo('Supervisione umana', SUPERVISIONE[e.supervisione]));
  out.push(campo('Rischi residui', e.rischi));
  out.push('\\subsection*{Bilancio di sobrietà}');
  out.push(longTable('P{4cm}L', ['Voce', 'Valore'], FIELDS.bilancio.map((f) => [tex(f.label), cellTex(e.bilancio?.[f.key])])));

  // 11 · Competenze e lezioni
  chapter('competenze');
  const c = d.competenze || {};
  out.push(longTable('P{3.4cm}P{1.8cm}P{1.8cm}LL', ['Competenza', 'Venerdì', 'Sabato', 'Dove', 'Prova'], COMPETENZE.map((k) => {
    const r = c[k.key] || {};
    return [tex(k.label), tex(LIVELLI_COMP[r.prima] || '—'), tex(LIVELLI_COMP[r.livello] || '—'), cellTex(r.dove), cellTex(r.prova)];
  })));
  out.push(campi(c, FIELDS.competenzeFinali));

  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Preambolo e documento
// ---------------------------------------------------------------------------

export const PREAMBLE = String.raw`% Preambolo del libro "Agenti al Lavoro" — generato da AIM-PRO Lab.
% Compila con pdfLaTeX (predefinito su Overleaf), XeLaTeX o LuaLaTeX.
\usepackage{iftex}
\ifPDFTeX
  \usepackage[T1]{fontenc}
  \usepackage[utf8]{inputenc}
  \usepackage{lmodern}
\else
  \usepackage{fontspec}
\fi
\usepackage[italian]{babel}
\usepackage[a4paper,margin=2.4cm,headheight=14pt]{geometry}
\usepackage{microtype}
\usepackage{textcomp}
\usepackage{amssymb}
\usepackage[table]{xcolor}
\usepackage{booktabs,array,xltabular}
\usepackage{enumitem}
\usepackage{fvextra}
\usepackage[most]{tcolorbox}
\usepackage{titlesec}
\usepackage{tikz}
\usetikzlibrary{arrows.meta}
\usepackage[hidelinks,bookmarksnumbered]{hyperref}

% Palette di AIM-PRO
\definecolor{primario}{HTML}{5F56A5}
\definecolor{secondario}{HTML}{A3D9CC}
\definecolor{giallo}{HTML}{FFC000}
\definecolor{rosso}{HTML}{E26D5A}
\definecolor{verde}{HTML}{2F9E6F}
\definecolor{linea}{HTML}{C9C9C4}
\definecolor{inchiostro}{HTML}{23243A}

% Stili dei diagrammi dei workflow
\tikzset{
  nodo/.style={draw, rounded corners=3pt, align=center, font=\footnotesize, inner sep=3pt, line width=0.7pt, text width=2.6cm, minimum height=1cm},
  tipo-agente/.style={fill=primario!10, draw=primario},
  tipo-umano/.style={fill=giallo!35, draw=giallo!70!black},
  tipo-io/.style={fill=secondario!45, draw=secondario!50!black, rounded corners=9pt},
  esterno/.style={dashed},
  freccia/.style={-{Stealth[length=2.2mm]}, draw=inchiostro!65, line width=0.7pt},
  etichetta-freccia/.style={fill=white, font=\scriptsize, inner sep=1pt, pos=0.38},
}

% I capitoli ricominciano da 1 in ogni parte (una parte = una Task Force)
\counterwithin*{chapter}{part}
\renewcommand{\theHchapter}{\thepart.\arabic{chapter}}
\setcounter{tocdepth}{0}

% Titoli
\titleformat{\chapter}[display]{\normalfont\bfseries\color{inchiostro}}{\large\color{primario}\MakeUppercase{\chaptertitlename}~\thechapter}{4pt}{\huge}
\titlespacing*{\chapter}{0pt}{-12pt}{18pt}
\titleformat{\section}{\normalfont\Large\bfseries\color{primario}}{}{0pt}{}
\titleformat*{\subsection}{\normalfont\large\bfseries}
\setlength{\parindent}{0pt}
\setlength{\parskip}{4pt}

% Colonne per le tabelle: L = larghezza libera, P{x} = larghezza fissa, entrambe a bandiera
\newcolumntype{L}{>{\raggedright\arraybackslash}X}
\newcolumntype{P}[1]{>{\raggedright\arraybackslash}p{#1}}

% Un campo del capitolo: etichetta in colore e testo sotto
\newcommand{\campo}[2]{\par\noindent{\color{primario}\bfseries #1}\par\nopagebreak\noindent #2\par\medskip}
% Una piccola etichetta colorata (tipo di persona, agente socratico...)
\newcommand{\etichetta}[1]{\tcbox[on line,colback=secondario!45,colframe=secondario!45,boxsep=1pt,left=4pt,right=4pt,top=1pt,bottom=1pt,arc=6pt]{\small\bfseries #1}}
% La sintesi "in due frasi" del capitolo
\newtcolorbox{induefrasi}{colback=secondario!20,colframe=primario,arc=4pt,boxrule=0.8pt,title={In due frasi},fonttitle=\bfseries}
`;

const docTitle = (titolo, sottotitolo) => String.raw`\title{\color{primario}\bfseries ${tex(titolo)}}
\author{${tex(sottotitolo)}}
\date{${tex(new Date().toLocaleDateString('it-IT', { dateStyle: 'long' }))}}`;

/** Label degli agenti di tutto il libro, per i rimandi dal registro e dalle copie. */
function agentLabels(groups, slugs) {
  const map = new Map();
  for (const g of groups) for (const a of items(g.data?.agents)) map.set(`${g.id}/${a.id}`, `agente:${slugs.get(g.id)}:${labelSlug(a.id)}`);
  return (groupId, agentId) => map.get(`${groupId}/${agentId}`) || null;
}

/** Slug unici per le Task Force (due gruppi con nomi simili non collidono). */
function uniqueSlugs(groups) {
  const used = new Set();
  const out = new Map();
  for (const g of groups) {
    let s = labelSlug(g.name);
    for (let i = 2; used.has(s); i += 1) s = `${labelSlug(g.name)}-${i}`;
    used.add(s);
    out.set(g.id, s);
  }
  return out;
}

const pad = (n) => String(n).padStart(2, '0');

/** Label dei workflow di tutto il libro. */
function wfLabels(groups, slugs) {
  const map = new Map();
  for (const g of groups) for (const wf of workflowsOf(g.data)) map.set(`${g.id}/${wf.id}`, `wf:${slugs.get(g.id)}:${labelSlug(wf.id)}`);
  return (groupId, wfId) => map.get(`${groupId}/${wfId}`) || null;
}

/** Registro degli agenti (appendice): nome con link alla scheda, workflow, origine. */
function registryTex(ordered, ctx) {
  const rows = [];
  for (const g of ordered) {
    for (const a of items(g.data?.agents)) {
      const lab = ctx.agentLabel(g.id, a.id);
      const src = a.origine ? ctx.agentLabel(a.origine.groupId, a.origine.agentId) : null;
      const wfs = usedIn(ordered, g.id, a.id).map(({ group, wf }) => `${tex(wf.nome || 'Workflow')}${group.id === g.id ? '' : ` (${tex(group.name)})`}`);
      const extra = [
        wfs.length ? `nei workflow: ${wfs.join(', ')}` : 'in nessun workflow',
        a.origine ? `copiato da ${src ? `\\hyperref[${src}]{${tex(a.origine.nome || 'agente')}}` : tex(a.origine.nome || 'agente')} di ${tex(a.origine.groupName)}` : null,
      ].filter(Boolean);
      rows.push([
        `\\hyperref[${lab}]{\\textbf{${tex(a.nome || '---')}}} \\newline{\\footnotesize\\itshape ${extra.join('; ')}}`,
        tex(g.name), tex(MODELLI[a.modello] || '—'), a.socratico ? 'sì' : 'no', cellTex(a.ruolo),
        `${filled(a.precond) ? tex(a.precond) : '\\dots'} $\\rightarrow$ ${filled(a.effetti) ? tex(a.effetti) : '\\dots'}`,
      ]);
    }
  }
  return longTable('P{3.2cm}P{1.9cm}P{1.2cm}P{0.8cm}LL', ['Agente', 'Task Force', 'Modello', 'Socr.', 'Ruolo', 'Precondizioni → effetti'], rows);
}

/**
 * Il libro come progetto: { 'main.tex', 'preambolo.tex', 'catalogo.tex', 'workflow.tex',
 * 'parti/NN-….tex', 'appendici.tex' }. Parte I: il catalogo di tutti gli agenti;
 * Parte II: i workflow; poi una parte per Task Force; in appendice registro e lezioni.
 */
export function bookProject(groups, { titolo = 'Agenti al Lavoro', sottotitolo = "Libro dei casi d'uso" } = {}) {
  const ordered = bookOrder(groups).flatMap((x) => x.groups);
  const slugs = uniqueSlugs(ordered);
  const ctx = { agentLabel: agentLabels(ordered, slugs), wfLabel: wfLabels(ordered, slugs), groups: ordered, catalog: buildCatalog(ordered) };
  const files = { 'preambolo.tex': PREAMBLE };

  // Parte I · Catalogo degli agenti
  const catalogo = ['\\part{Catalogo degli agenti}\\label{part:catalogo}',
    'Tutti gli agenti progettati nel corso, raggruppati per Task Force. Ogni scheda dice in quali workflow l\'agente è usato, anche da altre Task Force che lo prendono dal catalogo.\n'];
  for (const g of ordered) {
    const list = items(g.data?.agents);
    if (!list.length) continue;
    catalogo.push(`\\chapter{Gli agenti di \\guillemotleft{}${tex(g.name)}\\guillemotright{}}`);
    list.forEach((a) => catalogo.push(agentSectionTex(a, g, ctx, { slug: slugs.get(g.id) })));
  }
  files['catalogo.tex'] = catalogo.join('\n');

  // Parte II · I workflow
  const wfPart = ['\\part{I workflow}\\label{part:workflow}',
    'Come gli agenti sono composti in grafi. Ogni freccia dice che gli effetti di un nodo coprono le precondizioni del successivo; le frecce tratteggiate tornano indietro; i nodi tratteggiati sono agenti presi dal catalogo di un\'altra Task Force.\n'];
  for (const g of ordered) for (const wf of workflowsOf(g.data)) wfPart.push(workflowTex(wf, g, ctx, { withGroup: true }));
  if (wfPart.length === 2) wfPart.push('\\chapter*{Nessun workflow}');
  files['workflow.tex'] = wfPart.join('\n');

  // Le Task Force
  const inputs = ['\\input{catalogo}', '\\input{workflow}'];
  ordered.forEach((g, i) => {
    const name = `parti/${pad(i + 1)}-${slugs.get(g.id)}.tex`;
    files[name] = groupToLatex(g, { slug: slugs.get(g.id), agentLabel: ctx.agentLabel, wfLabel: ctx.wfLabel, allGroups: ordered, inBook: true });
    inputs.push(`\\input{${name.replace(/\.tex$/, '')}}`);
  });

  const settori = bookOrder(groups).map(({ settore, groups: gs }) => `\\item[${tex(settore)}] ${gs.map((g) => `Parte~\\ref{part:${slugs.get(g.id)}}: ${tex(filled(g.data?.titolo) ? g.data.titolo.trim() : g.name)} \\textit{(${tex(g.name)})}`).join(' \\newline\n')}`);
  const lezioni = ordered.map((g) => {
    const c = g.data?.competenze || {};
    return [`\\section{${tex(g.name)}}`, campo('Lezioni', c.lezioni), campo('Raccomandazione per un formatore', c.raccomandazione), campo('Cosa non automatizzeremmo', c.nonauto)].join('\n');
  }).join('\n');

  files['appendici.tex'] = [
    '\\part*{Appendici}\\addcontentsline{toc}{part}{Appendici}',
    '\\appendix',
    '\\chapter{Registro degli agenti}\\label{app:registro}',
    `Tutti gli agenti in una tabella. Il nome rimanda alla scheda nel catalogo.\n`,
    registryTex(ordered, ctx),
    '\\chapter{Lezioni apprese}\\label{app:lezioni}',
    lezioni || '\\textit{Nessuna Task Force.}',
  ].join('\n');

  const nAgents = ordered.reduce((n, g) => n + items(g.data?.agents).length, 0);
  const nWf = ordered.reduce((n, g) => n + workflowsOf(g.data).length, 0);
  files['main.tex'] = String.raw`% Libro "Agenti al Lavoro" — progetto LaTeX generato da AIM-PRO Lab.
% Su Overleaf: New Project → Upload Project → questo .zip. Compilatore: pdfLaTeX (predefinito).
% catalogo.tex = Parte I (agenti), workflow.tex = Parte II, parti/ = una parte per Task Force.
% Label disponibili: part:catalogo, part:workflow, part:<task-force>, cap:<task-force>:<capitolo>,
% agente:<task-force>:<id>, wf:<task-force>:<id>, persona:<task-force>:<id>, app:registro, app:lezioni.
\documentclass[11pt,a4paper,openany]{book}
\input{preambolo}
${docTitle(titolo, sottotitolo)}

\begin{document}
\frontmatter
\maketitle
\tableofcontents

\chapter{Come leggere questo libro}
Il libro raccoglie il lavoro di ${ordered.length} Task Force del corso: ${nAgents} agenti e ${nWf} workflow.
La Parte~\ref{part:catalogo} è il catalogo di tutti gli agenti, con prompt e versioni.
La Parte~\ref{part:workflow} mostra come gli agenti sono composti in workflow, anche tra Task Force diverse.
Seguono le parti delle Task Force, con gli stessi capitoli del percorso (${SECTIONS.map((s) => tex(s.titolo)).join(', ')}):
per agenti e workflow rimandano alle prime due parti.
In appendice trovate il registro di tutti gli agenti e le lezioni apprese.

\section*{Le Task Force, per settore}
\begin{description}[style=nextline,leftmargin=1em,labelindent=0pt]
${settori.join('\n') || '\\item[---] Nessuna Task Force.'}
\end{description}

\mainmatter
${inputs.join('\n')}

\input{appendici}
\end{document}
`;
  return files;
}

/**
 * La parte di una sola Task Force come progetto autonomo: i capitoli 5–7 contengono
 * schede, prompt e workflow. allGroups serve a dare un nome agli agenti presi dal catalogo.
 */
export function groupProject(group, allGroups = [group]) {
  const slug = labelSlug(group.name);
  const titolo = filled(group.data?.titolo) ? group.data.titolo.trim() : group.name;
  const own = (gid, aid) => (gid === group.id && group.data?.agents?.[aid] && !group.data.agents[aid].deleted ? `agente:${slug}:${labelSlug(aid)}` : null);
  return {
    'preambolo.tex': PREAMBLE,
    [`parti/${slug}.tex`]: groupToLatex(group, { slug, agentLabel: own, allGroups: allGroups.some((g) => g.id === group.id) ? allGroups : [group, ...allGroups] }),
    'main.tex': String.raw`% Parte di una Task Force (11 capitoli) — generata da AIM-PRO Lab.
% Su Overleaf: New Project → Upload Project → questo .zip. Compilatore: pdfLaTeX (predefinito).
\documentclass[11pt,a4paper,openany]{book}
\input{preambolo}
${docTitle(titolo, `Task Force ${group.name}`)}

\begin{document}
\frontmatter
\maketitle
\tableofcontents
\mainmatter
\input{parti/${slug}}
\end{document}
`,
  };
}

/**
 * Un progetto in un solo file .tex (preambolo e parti incorporati), comodo per
 * "Apri in Overleaf" o per incollarlo in un progetto esistente.
 */
export function singleFile(files) {
  const read = (name) => files[name] ?? files[`${name}.tex`] ?? '';
  return files['main.tex']
    .replace('\\input{preambolo}', () => read('preambolo.tex'))
    .replace(/\\input\{([^}]+)\}/g, (m, name) => (name === 'preambolo' ? m : read(`${name}.tex`)));
}
