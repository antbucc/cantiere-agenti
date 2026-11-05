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
  items, filled, planCheck, reusers,
} from '../public/js/model.js';
import { bookOrder } from './export.js';

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
// Una Task Force → una \part con 11 capitoli
// ---------------------------------------------------------------------------

/**
 * @param group  { id, name, data }
 * @param ctx.slug       prefisso delle label di questa parte
 * @param ctx.agentLabel funzione (groupId, agentId) → label dell'agente, se esiste nel libro
 */
export function groupToLatex(group, { slug = labelSlug(group.name), agentLabel = () => null, allGroups = [group] } = {}) {
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
  const agentName = new Map(agents.map((a) => [a.id, a.nome || 'Agente senza nome']));

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

  // 5 · Agenti
  chapter('agents');
  if (!agents.length) out.push('\\textit{Nessun agente.}\n');
  agents.forEach((a) => {
    out.push(`\\section{${tex(a.nome || 'Agente senza nome')}}\\label{${agentLabel(group.id, a.id) || `agente:${slug}:${labelSlug(a.id)}`}}`);
    const tags = [a.socratico ? 'socratico' : null, MODELLI[a.modello] ? `modello ${MODELLI[a.modello].toLowerCase()}` : null,
      a.temperatura !== undefined && a.temperatura !== '' ? `temperatura ${a.temperatura}` : null].filter(Boolean);
    if (tags.length) out.push(`\\noindent${tags.map((t) => `\\etichetta{${tex(t)}}`).join('~')}\\par\\smallskip`);
    if (a.origine) {
      const src = agentLabel(a.origine.groupId, a.origine.agentId);
      const who = `${tex(a.origine.nome || 'un agente')} di \\guillemotleft{}${tex(a.origine.groupName)}\\guillemotright{}`;
      out.push(`\\noindent\\textit{Riusato da ${src ? `\\hyperref[${src}]{${who}}` : who}.}\\par\\smallskip`);
    }
    const by = reusers(allGroups, a.id);
    if (by.length) out.push(`\\noindent\\textit{Riusato da: ${by.map(tex).join(', ')}.}\\par\\smallskip`);
    out.push('\\begin{description}[style=nextline,leftmargin=1em,labelindent=0pt]');
    for (const f of FIELDS.agent) out.push(`  \\item[${tex(f.label)}] ${texBlock(a[f.key])}`);
    if (a.socratico) out.push(`  \\item[Domande socratiche] ${texBlock(a.domande)}`);
    if (a.origine) out.push(`  \\item[Cosa abbiamo adattato] ${texBlock(a.adattamento)}`);
    out.push('\\end{description}');
    out.push(`\\noindent Prompt e versioni: Capitolo~\\ref{${L('prompt')}}.\n`);
  });

  // 6 · Prompt e versioni
  chapter('prompt');
  if (!agents.length) out.push('\\textit{Nessun agente.}\n');
  agents.forEach((a) => {
    const versioni = Array.isArray(a.versioni) ? a.versioni : [];
    out.push(`\\section{Prompt di ${tex(a.nome || 'agente senza nome')}}`);
    out.push(`\\subsection*{Versione corrente${versioni.length ? ` (dopo v${versioni.length})` : ''}}`);
    out.push(verbatim(a.prompt));
    if (versioni.length) {
      out.push('\\subsection*{Storia delle versioni}');
      versioni.forEach((v) => {
        out.push(`\\paragraph{v${v.n} \\textperiodcentered{} ${tex(fmtDate(v.at))}} ${texBlock(v.nota)}\\par`);
        out.push(verbatim(v.prompt, 'fontsize=\\footnotesize'));
      });
    }
  });

  // 7 · Workflow
  chapter('workflow');
  const w = d.workflow || {};
  const steps = items(w.steps);
  const pos = new Map(steps.map((s, i) => [s.id, i + 1]));
  out.push(campo('Pattern', PATTERNS[w.pattern] || w.pattern));
  out.push(campi(w, FIELDS.workflow));
  out.push('\\subsection*{I passi}');
  if (!steps.length) out.push('\\textit{Nessun passo.}\n');
  else {
    out.push('\\begin{enumerate}[leftmargin=*]');
    steps.forEach((s) => {
      if (s.tipo === 'umano') {
        out.push(`  \\item \\colorbox{giallo!45}{\\textbf{Umano nel ciclo}} --- ${tex(LIVELLI_UMANO[s.livello] || 'livello non indicato')}${filled(s.nota) ? `: ${tex(s.nota)}` : ''}`);
      } else {
        const by = s.soddisfatta === 'input' ? 'input umano iniziale' : pos.has(s.soddisfatta) ? `passo ${pos.get(s.soddisfatta)}` : 'non indicato';
        out.push(`  \\item \\textbf{${tex(agentName.get(s.agente) || 'agente non scelto')}} --- precondizioni da: ${tex(by)}${filled(s.nota) ? `. ${tex(s.nota)}` : ''}`);
      }
    });
    out.push('\\end{enumerate}');
  }
  out.push('\\subsection*{Verifica del piano}\n\\begin{itemize}[leftmargin=*]');
  for (const c of planCheck(d).checks) {
    out.push(`  \\item[${c.ok ? '\\textcolor{verde}{\\checkmark}' : '\\textcolor{rosso}{$\\square$}'}] ${tex(c.label)}${c.detail ? ` (${tex(c.detail)})` : ''}`);
  }
  out.push('\\end{itemize}');
  if (filled(w.passi)) out.push(campo('I passi in parole', w.passi));
  if (filled(w.dsl)) out.push('\\subsection*{Configurazione del workflow}', verbatim(w.dsl));
  if (filled(w.screenshot)) out.push(campo('Screenshot', w.screenshot));

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

export const PREAMBLE = String.raw`% Preambolo del libro "Agenti al Lavoro" — generato da Dify.
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
\usepackage[hidelinks,bookmarksnumbered]{hyperref}

% Palette di Dify
\definecolor{primario}{HTML}{505DBC}
\definecolor{secondario}{HTML}{97EFD8}
\definecolor{giallo}{HTML}{FFC000}
\definecolor{rosso}{HTML}{E26D5A}
\definecolor{verde}{HTML}{2F9E6F}
\definecolor{linea}{HTML}{C9C9C4}
\definecolor{inchiostro}{HTML}{23243A}

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

/**
 * Il libro come progetto: { 'main.tex': ..., 'preambolo.tex': ..., 'parti/01-....tex': ... }.
 * Va bene sia per lo zip da caricare su Overleaf sia per la compilazione in locale.
 */
export function bookProject(groups, { titolo = 'Agenti al Lavoro', sottotitolo = "Libro dei casi d'uso" } = {}) {
  const ordered = bookOrder(groups).flatMap((x) => x.groups);
  const slugs = uniqueSlugs(ordered);
  const agentLabel = agentLabels(ordered, slugs);
  const files = { 'preambolo.tex': PREAMBLE };
  const inputs = [];
  ordered.forEach((g, i) => {
    const name = `parti/${pad(i + 1)}-${slugs.get(g.id)}.tex`;
    files[name] = groupToLatex(g, { slug: slugs.get(g.id), agentLabel, allGroups: ordered });
    inputs.push(`\\input{${name.replace(/\.tex$/, '')}}`);
  });

  // Indice per settore (pagina dopo il sommario)
  const settori = bookOrder(groups).map(({ settore, groups: gs }) => `\\item[${tex(settore)}] ${gs.map((g) => `Parte~\\ref{part:${slugs.get(g.id)}}: ${tex(filled(g.data?.titolo) ? g.data.titolo.trim() : g.name)} \\textit{(${tex(g.name)})}`).join(' \\newline\n')}`);

  // Appendice A · Registro degli agenti
  const rows = [];
  for (const g of ordered) {
    for (const a of items(g.data?.agents)) {
      const lab = agentLabel(g.id, a.id);
      const src = a.origine ? agentLabel(a.origine.groupId, a.origine.agentId) : null;
      const extra = [
        a.origine ? `riusato da ${src ? `\\hyperref[${src}]{${tex(a.origine.nome || 'agente')}}` : tex(a.origine.nome || 'agente')} di ${tex(a.origine.groupName)}` : null,
        reusers(ordered, a.id).length ? `riusato da ${reusers(ordered, a.id).map(tex).join(', ')}` : null,
      ].filter(Boolean);
      rows.push([
        `\\hyperref[${lab}]{\\textbf{${tex(a.nome || '---')}}}${extra.length ? ` \\newline{\\footnotesize\\itshape ${extra.join('; ')}}` : ''}`,
        tex(g.name), tex(MODELLI[a.modello] || '—'), a.socratico ? 'sì' : 'no', cellTex(a.ruolo),
        `${filled(a.precond) ? tex(a.precond) : '\\dots'} $\\rightarrow$ ${filled(a.effetti) ? tex(a.effetti) : '\\dots'}`,
      ]);
    }
  }
  const lezioni = ordered.map((g) => {
    const c = g.data?.competenze || {};
    return [`\\section{${tex(g.name)}}`, campo('Lezioni', c.lezioni), campo('Raccomandazione per un formatore', c.raccomandazione), campo('Cosa non automatizzeremmo', c.nonauto)].join('\n');
  }).join('\n');

  files['appendici.tex'] = [
    '\\part*{Appendici}\\addcontentsline{toc}{part}{Appendici}',
    '\\appendix',
    '\\chapter{Registro degli agenti}\\label{app:registro}',
    `Tutti gli agenti di tutte le Task Force. Il nome rimanda alla scheda dell'agente.\n`,
    longTable('P{2.8cm}P{2cm}P{1.3cm}P{0.9cm}LL', ['Agente', 'Task Force', 'Modello', 'Socr.', 'Ruolo', 'Precondizioni → effetti'], rows),
    '\\chapter{Lezioni apprese}\\label{app:lezioni}',
    lezioni || '\\textit{Nessuna Task Force.}',
  ].join('\n');

  files['main.tex'] = String.raw`% Libro "Agenti al Lavoro" — progetto LaTeX generato da Dify.
% Su Overleaf: New Project → Upload Project → questo .zip. Compilatore: pdfLaTeX (predefinito).
% Ogni Task Force è un file in parti/: potete correggerlo, riordinarlo o toglierlo da qui sotto.
% Label disponibili: part:<task-force>, cap:<task-force>:<capitolo>, agente:<task-force>:<id>,
% persona:<task-force>:<id>, app:registro, app:lezioni.
\documentclass[11pt,a4paper,openany]{book}
\input{preambolo}
${docTitle(titolo, sottotitolo)}

\begin{document}
\frontmatter
\maketitle
\tableofcontents

\chapter{Come leggere questo libro}
Ogni parte è il lavoro di una Task Force del corso: un caso d'uso progettato, costruito e valutato in due giornate.
Tutte le parti hanno gli stessi ${SECTIONS.length} capitoli: ${SECTIONS.map((s) => tex(s.titolo)).join(', ')}.
In appendice trovate il registro di tutti gli agenti e le lezioni apprese.

\section*{Le parti, per settore}
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

/** Il capitolo di una sola Task Force come progetto autonomo. */
export function groupProject(group) {
  const slug = labelSlug(group.name);
  const titolo = filled(group.data?.titolo) ? group.data.titolo.trim() : group.name;
  return {
    'preambolo.tex': PREAMBLE,
    [`parti/${slug}.tex`]: groupToLatex(group, { slug }),
    'main.tex': String.raw`% Parte di una Task Force (11 capitoli) — generata da Dify.
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
