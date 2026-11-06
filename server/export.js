// Export in Markdown: la parte di una Task Force e il libro intero.
// Il libro mette in testa il catalogo di TUTTI gli agenti (Parte I) e i workflow
// che li compongono (Parte II, con il diagramma Mermaid); poi una parte per Task
// Force, che per agenti e workflow rimanda alle prime due.
// Funzioni pure (nessun accesso al DB), testate in test/export.test.js.

import {
  SETTORI, FIELDS, PERSONA_TIPI, MODELLI, PATTERNS, LIVELLI_UMANO, TEST_TIPI, ESITI,
  OUTPUTS, CRITERI, FASCE, SUPERVISIONE, DOMANDE_ETICA, COMPETENZE, LIVELLI_COMP,
  SECTIONS, items, filled, reusers, sectionLabel,
} from '../public/js/model.js';
import {
  workflowsOf, graphCheck, buildCatalog, readingOrder, toMermaid, usedIn, isExternal,
} from '../public/js/grafo-core.js';

const NA = '—';

/** Numero romano (per le parti del libro). */
export const roman = (n) => [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  .reduce((acc, [v, r]) => { while (n >= v) { acc += r; n -= v; } return acc; }, '');

/** Testo libero dentro una cella di tabella: niente pipe né a capo. */
export function cell(v) {
  if (!filled(v)) return NA;
  return String(v).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>').trim();
}

/** Paragrafo di testo libero (vuoto → trattino). */
const para = (v) => (filled(v) ? String(v).trim() : `*${NA}*`);

function table(headers, rows) {
  if (!rows.length) return '*Nessuna riga.*\n';
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
  ].join('\n') + '\n';
}

/** Blocco di codice con un recinto più lungo di qualunque sequenza di backtick nel testo. */
function codeBlock(text, lang = 'text') {
  const t = String(text || '').replace(/\s+$/, '');
  const longest = Math.max(2, ...(t.match(/`+/g) || []).map((m) => m.length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}${lang}\n${t || '(vuoto)'}\n${fence}\n`;
}

/** Elenco "**Etichetta.** valore" per i campi di un oggetto. */
const fieldList = (obj, defs) => defs.map((f) => `**${f.label}.** ${para(obj?.[f.key])}\n`).join('\n');

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : '');

/** La scheda di un agente (catalogo): campi, origine, dove è usato, prompt e versioni. */
function agentCardMd(a, g, H, ctx) {
  const out = [];
  const versioni = Array.isArray(a.versioni) ? a.versioni : [];
  const where = usedIn(ctx.groups, g.id, a.id).map(({ group, wf }) => `«${wf.nome || 'Workflow'}»${group.id === g.id ? '' : ` (${group.name})`}`);
  out.push(`${H} ${a.nome || 'Agente senza nome'}${a.socratico ? ' · socratico' : ''}\n`);
  out.push(`*Task Force ${g.name}*${where.length ? ` · nei workflow: ${where.join(', ')}` : ' · non usato in nessun workflow'}\n`);
  out.push(table(['Campo', 'Valore'], [
    ...FIELDS.agent.map((f) => [f.label, a[f.key]]),
    ['Modello', MODELLI[a.modello] || a.modello],
    ['Temperatura', a.temperatura ?? ''],
    ...(a.socratico ? [['Domande socratiche', a.domande]] : []),
    ...(a.origine ? [['Origine', `riusato da ${a.origine.nome || 'un agente'} di «${a.origine.groupName}»`], ['Cosa abbiamo adattato', a.adattamento]] : []),
    ...(reusers(ctx.groups, a.id).length ? [['Riusato da', reusers(ctx.groups, a.id).join(', ')]] : []),
  ]));
  out.push(`**Prompt** (versione corrente${versioni.length ? `, dopo v${versioni.length}` : ''})\n`, codeBlock(a.prompt));
  if (versioni.length) {
    out.push('**Storia delle versioni**\n');
    versioni.forEach((v) => {
      out.push(`- **v${v.n}** (${fmtDate(v.at)}) — ${cell(v.nota)}\n`);
      out.push(codeBlock(v.prompt).replace(/^/gm, '  ').replace(/ +$/gm, ''));
    });
  }
  return out.join('\n');
}

/** Un workflow: diagramma, come funziona, verifica, risposte alle domande del progettista. */
function workflowMd(wf, g, H, ctx, { withGroup = false } = {}) {
  const c = { doc: g.data, catalog: ctx.catalog, groupId: g.id };
  const out = [];
  out.push(`${H} ${wf.nome || 'Workflow'}${withGroup ? ` · ${g.name}` : ''}\n`);
  out.push(`*Task Force ${g.name} · pattern: ${PATTERNS[wf.pattern] || wf.pattern || NA}*\n`);
  if (filled(wf.motivazione)) out.push(`**Perché questo pattern.** ${wf.motivazione.trim()}\n`);
  out.push(codeBlock(toMermaid(wf, c), 'mermaid'));
  out.push('**Come funziona**\n');
  const steps = readingOrder(wf, c).filter((r) => r.node.tipo !== 'output');
  out.push(steps.length ? steps.map((r, i) => {
    const ext = r.node.tipo === 'agente' && isExternal(r.node.agente) ? ` *(${r.sub})*` : '';
    const who = r.node.tipo === 'umano' ? `👤 **${r.label}** — ${r.sub}` : r.node.tipo === 'input' ? `▶ **${r.label}**` : `🤖 **${r.label}**${ext}`;
    const to = r.to.map((t) => `${t.label}${filled(t.condizione) ? ` se ${t.condizione}` : ''}${t.ritorno ? ' (ritorno)' : ''}`).join('; ');
    return `${i + 1}. ${who}${filled(r.node.nota) ? `: ${cell(r.node.nota)}` : ''}${to ? ` → ${to}` : ''}`;
  }).join('\n') + '\n' : '*Grafo vuoto.*\n');
  out.push('**Verifica del grafo**\n', graphCheck(wf, c).checks.map((k) => `- ${k.ok ? '✅' : '⬜'} ${k.label}${k.detail ? ` (${k.detail})` : ''}`).join('\n') + '\n');
  out.push(fieldList(wf, FIELDS.workflow.slice(1)));
  if (filled(wf.passi)) out.push(`**I passi in parole.** ${wf.passi.trim()}\n`);
  if (filled(wf.dsl)) out.push('**Configurazione del workflow**\n', codeBlock(wf.dsl));
  if (filled(wf.screenshot)) out.push(`**Screenshot.** ${wf.screenshot.trim()}\n`);
  return out.join('\n');
}

/**
 * La parte di una Task Force in Markdown.
 * @param group  riga del DB { name, data, ... }
 * @param opts.depth   livello del titolo (1 = "#"); i capitoli sono un livello sotto
 * @param opts.numero  numero della Parte nel libro (facoltativo)
 * @param opts.inBook  true nel libro: i capitoli 5–7 rimandano al catalogo e ai workflow
 * @param opts.groups  tutte le Task Force (per i riferimenti al catalogo)
 */
export function groupToMarkdown(group, { depth = 1, numero, inBook = false, groups = [group] } = {}) {
  const d = group.data || {};
  const H = (n) => '#'.repeat(Math.min(6, depth + n));
  const out = [];
  const push = (...s) => out.push(...s);
  const ctx = { groups, catalog: buildCatalog(groups) };

  const personas = items(d.personas);
  const personaName = new Map(personas.map((p, i) => [p.id, `P${i + 1} ${p.nome || ''}`.trim()]));
  const agents = items(d.agents);

  const titolo = filled(d.titolo) ? d.titolo.trim() : group.name;
  push(`${H(0)} ${numero ? `Parte ${roman(numero)} · ` : ''}${titolo}\n`);
  push(`**Task Force:** ${group.name}  \n**Settore:** ${d.settore || NA}  \n**Autori:** ${filled(d.membri) ? d.membri.trim() : NA}\n`);
  push(`> **In due frasi.** ${filled(d.sintesi) ? d.sintesi.trim().replace(/\n+/g, ' ') : NA}\n`);

  // 1 · Scenario
  push(`${H(1)} ${sectionLabel('scenario')}\n`, fieldList(d.scenario, FIELDS.scenario));
  if (filled(d.scenario?.foto)) push(`**Foto.** ${d.scenario.foto.trim()}\n`);

  // 2 · Personas
  push(`${H(1)} ${sectionLabel('personas')}\n`);
  if (!personas.length) push('*Nessuna persona.*\n');
  personas.forEach((p, i) => {
    push(`${H(2)} P${i + 1} · ${p.nome || 'Senza nome'} *(${PERSONA_TIPI[p.tipo] || 'tipo non indicato'})*\n`);
    if (filled(p.frase)) push(`> ${p.frase.trim().replace(/\n+/g, ' ')}\n`);
    push(FIELDS.persona.filter((f) => f.key !== 'frase').map((f) => `- **${f.label}:** ${cell(p[f.key])}`).join('\n') + '\n');
    if (p.aiDraft) push(`*Bozza generata con AI. Cosa abbiamo cambiato:* ${para(p.modifiche)}\n`);
  });

  // 3 · User stories
  const stories = items(d.stories);
  push(`${H(1)} ${sectionLabel('stories')}\n`);
  push(table(['#', 'Come…', 'voglio…', 'per…', 'Dato / quando / allora', 'Negativa'], stories.map((s, i) => [
    String(i + 1), personaName.get(s.persona) || NA, s.voglio, s.per,
    `Dato ${s.dato || '…'}; quando ${s.quando || '…'}; allora ${s.allora || '…'}`, s.negativa ? 'sì' : 'no',
  ])));

  // 4 · Mockup
  push(`${H(1)} ${sectionLabel('mockup')}\n`, fieldList(d.mockup, FIELDS.mockup));
  if (filled(d.mockup?.foto)) push(`**Foto del mockup.** ${d.mockup.foto.trim()}\n`);

  // 5 · Agenti e 6 · Prompt (nel libro: rimando al catalogo della Parte I)
  const wfs = workflowsOf(d);
  if (inBook) {
    push(`${H(1)} ${sectionLabel('agents')}\n`);
    push(agents.length ? `Le schede complete sono nella **Parte I · Catalogo degli agenti**.\n\n${agents.map((a) => `- **${a.nome || 'Agente senza nome'}**${a.socratico ? ' (socratico)' : ''} — ${cell(a.ruolo)}`).join('\n')}\n` : '*Nessun agente.*\n');
    push(`${H(1)} ${sectionLabel('prompt')}\n`, agents.length ? 'I prompt, nella versione corrente e con la storia delle versioni, sono nelle schede della **Parte I**.\n' : '*Nessun agente.*\n');
    push(`${H(1)} ${sectionLabel('workflow')}\n`);
    push(wfs.length ? `I diagrammi e la verifica sono nella **Parte II · I workflow**.\n\n${wfs.map((w) => `- **${w.nome || 'Workflow'}** — ${PATTERNS[w.pattern] || w.pattern || 'pattern non indicato'}`).join('\n')}\n` : '*Nessun workflow.*\n');
  } else {
    push(`${H(1)} ${sectionLabel('agents')}\n`);
    if (!agents.length) push('*Nessun agente.*\n');
    agents.forEach((a) => push(agentCardMd(a, group, H(2), ctx)));
    push(`${H(1)} ${sectionLabel('prompt')}\n`, agents.length ? 'I prompt sono nelle schede degli agenti qui sopra, con la storia delle versioni.\n' : '*Nessun agente.*\n');
    push(`${H(1)} ${sectionLabel('workflow')}\n`);
    if (!wfs.length) push('*Nessun workflow.*\n');
    wfs.forEach((wf) => push(workflowMd(wf, group, H(2), ctx)));
  }

  // 8 · Test
  const tests = items(d.tests);
  const count = (k, v) => tests.filter((t) => t[k] === v).length;
  push(`${H(1)} ${sectionLabel('tests')}\n`);
  push(`Casi: ${tests.length} · ${Object.entries(TEST_TIPI).map(([k, l]) => `${l.toLowerCase()} ${count('tipo', k)}`).join(', ')}  \n`
    + `Esiti: ${Object.entries(ESITI).map(([k, l]) => `${l.toLowerCase()} ${count('esito', k)}`).join(', ')}\n`);
  push(table(['#', 'Tipo', 'Input', 'Atteso', 'Ottenuto', 'Esito', 'Chiamate', 'Note'], tests.map((t, i) => [
    String(i + 1), TEST_TIPI[t.tipo] || t.tipo, t.input, t.atteso, t.ottenuto, ESITI[t.esito] || t.esito, t.chiamate ?? '', t.note,
  ])));
  push(`**Correzioni dopo i test.** ${para(d.testsNote?.correzioni)}\n`);

  // 9 · Analisi critica
  const an = d.analisi || {};
  push(`${H(1)} ${sectionLabel('analisi')}\n`);
  push(table(['Criterio', ...OUTPUTS.map((o) => o.label)], [
    ['Caso', ...OUTPUTS.map((o) => an[o.key]?.caso)],
    ...CRITERI.map((c) => [c.label, ...OUTPUTS.map((o) => an[o.key]?.[c.key])]),
  ]));
  push(`**Se andasse in produzione domani, quale sarebbe il danno peggiore?** ${para(an.danno)}\n`);
  push(`**Domanda del Consiglio.** ${para(an.consiglioDomanda)}\n`);
  push(`**La nostra risposta.** ${para(an.consiglio)}\n`);
  push(`**Cosa abbiamo cambiato.** ${para(an.cambiato)}\n`);

  // 10 · Etica e sostenibilità
  const e = d.etica || {};
  push(`${H(1)} ${sectionLabel('etica')}\n`);
  push(table(['#', 'Domanda', 'Previsto (venerdì)', 'Osservato (sabato)', 'Cosa cambiamo'], DOMANDE_ETICA.map((q, i) => {
    const r = e['q' + (i + 1)] || {};
    return [String(i + 1), q, r.previsto, r.osservato, r.cambiamo];
  })));
  push(`**Fascia AI Act.** ${FASCE[e.fascia] || NA}. ${filled(e.fasciaMotivo) ? e.fasciaMotivo.trim() : ''}\n`);
  push(`**Supervisione.** ${SUPERVISIONE[e.supervisione] || NA}\n`);
  push(`**Rischi residui.** ${para(e.rischi)}\n`);
  push(`**Bilancio di sobrietà**\n`, table(['Voce', 'Valore'], FIELDS.bilancio.map((f) => [f.label, e.bilancio?.[f.key]])));

  // 11 · Competenze e lezioni
  const c = d.competenze || {};
  push(`${H(1)} ${sectionLabel('competenze')}\n`);
  push(table(['Competenza', 'Venerdì', 'Sabato', 'Dove', 'Prova'], COMPETENZE.map((k) => {
    const r = c[k.key] || {};
    return [k.label, LIVELLI_COMP[r.prima] || NA, LIVELLI_COMP[r.livello] || NA, r.dove, r.prova];
  })));
  push(fieldList(c, FIELDS.competenzeFinali));

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** Ordine delle Task Force nel libro: per settore (nell'ordine dell'elenco), poi per data di creazione. */
export function bookOrder(groups) {
  const settoreOf = (g) => (SETTORI.includes(g.data?.settore) ? g.data.settore : 'Altro');
  return SETTORI.map((settore) => ({ settore, groups: groups.filter((g) => settoreOf(g) === settore) }))
    .filter((x) => x.groups.length);
}

/**
 * Il libro intero: Parte I catalogo di tutti gli agenti, Parte II i workflow,
 * poi una parte per Task Force (in ordine di settore); appendici con registro e lezioni.
 */
export function bookToMarkdown(groups, { titolo = 'Agenti al Lavoro · Libro dei casi d\'uso' } = {}) {
  const out = [];
  const bySettore = bookOrder(groups);
  const ordered = bySettore.flatMap((x) => x.groups);
  const ctx = { groups: ordered, catalog: buildCatalog(ordered) };
  const nAgents = ordered.reduce((n, g) => n + items(g.data?.agents).length, 0);
  const nWf = ordered.reduce((n, g) => n + workflowsOf(g.data).length, 0);
  out.push(`# ${titolo}\n`);
  out.push(`*Generato il ${new Date().toLocaleDateString('it-IT', { dateStyle: 'long' })} · ${ordered.length} Task Force · ${nAgents} agenti · ${nWf} workflow*\n`);

  out.push('## Indice\n');
  out.push('- Parte I · Catalogo degli agenti', '- Parte II · I workflow');
  let n = 2;
  bySettore.forEach(({ settore, groups: gs }) => {
    out.push(`- **${settore}**`);
    gs.forEach((g) => { n += 1; out.push(`  - Parte ${roman(n)} · ${filled(g.data?.titolo) ? g.data.titolo.trim() : g.name} *(${g.name})*`); });
  });
  out.push('- Appendice A · Registro degli agenti', '- Appendice B · Lezioni apprese\n');

  // Parte I · Catalogo degli agenti
  out.push('---\n', '# Parte I · Catalogo degli agenti\n');
  out.push('Tutti gli agenti progettati nel corso, raggruppati per Task Force. Ogni scheda dice dove l\'agente è usato: anche nei workflow di altre Task Force, che lo prendono dal catalogo.\n');
  for (const g of ordered) {
    const list = items(g.data?.agents);
    if (!list.length) continue;
    out.push(`## Gli agenti di «${g.name}»\n`);
    list.forEach((a) => out.push(agentCardMd(a, g, '###', ctx)));
  }

  // Parte II · I workflow
  out.push('---\n', '# Parte II · I workflow\n');
  out.push('Come gli agenti sono composti in grafi: ogni freccia dice che gli effetti di un nodo coprono le precondizioni del successivo.\n');
  for (const g of ordered) for (const wf of workflowsOf(g.data)) out.push(workflowMd(wf, g, '##', ctx, { withGroup: true }));

  // Le Task Force
  ordered.forEach((g, i) => out.push('---\n', groupToMarkdown(g, { depth: 1, numero: i + 3, inBook: true, groups: ordered })));

  out.push('---\n', '# Appendice A · Registro degli agenti\n');
  const rows = [];
  for (const g of ordered) {
    for (const a of items(g.data?.agents)) {
      rows.push([a.nome, a.ruolo, g.name, MODELLI[a.modello] || a.modello, a.socratico ? 'sì' : 'no', `${a.precond || '…'} → ${a.effetti || '…'}`,
        usedIn(ordered, g.id, a.id).map(({ group, wf }) => `${wf.nome || 'Workflow'}${group.id === g.id ? '' : ` (${group.name})`}`).join(', '),
        a.origine ? `da ${a.origine.nome || 'agente'} di ${a.origine.groupName}` : '', reusers(ordered, a.id).join(', ')]);
    }
  }
  out.push(table(['Agente', 'Ruolo', 'Task Force', 'Modello', 'Socratico', 'Precondizioni → effetti', 'Nei workflow', 'Origine', 'Riusato da'], rows));

  out.push('# Appendice B · Lezioni apprese\n');
  for (const g of ordered) {
    const c = g.data?.competenze || {};
    out.push(`## ${g.name}\n`);
    out.push(`**Lezioni.** ${para(c.lezioni)}\n`);
    out.push(`**Raccomandazione per un formatore.** ${para(c.raccomandazione)}\n`);
    out.push(`**Cosa non automatizzeremmo.** ${para(c.nonauto)}\n`);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
