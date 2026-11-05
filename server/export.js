// Export in Markdown: un capitolo per gruppo e il libro intero.
// Funzioni pure (nessun accesso al DB), testate in test/export.test.js.

import {
  SETTORI, FIELDS, PERSONA_TIPI, MODELLI, PATTERNS, LIVELLI_UMANO, TEST_TIPI, ESITI,
  OUTPUTS, CRITERI, FASCE, SUPERVISIONE, DOMANDE_ETICA, COMPETENZE, LIVELLI_COMP,
  SECTIONS, items, filled, planCheck, reusers, sectionLabel,
} from '../public/js/model.js';

const NA = '—';

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

/**
 * Un capitolo in Markdown.
 * @param group  riga del DB { name, data, ... }
 * @param opts.depth  livello del titolo (1 = "#"); i capitoli sono un livello sotto
 * @param opts.numero numero della Parte nel libro (facoltativo)
 */
export function groupToMarkdown(group, { depth = 1, numero } = {}) {
  const d = group.data || {};
  const H = (n) => '#'.repeat(Math.min(6, depth + n));
  const out = [];
  const push = (...s) => out.push(...s);

  const personas = items(d.personas);
  const personaName = new Map(personas.map((p, i) => [p.id, `P${i + 1} ${p.nome || ''}`.trim()]));
  const agents = items(d.agents);
  const agentName = new Map(agents.map((a) => [a.id, a.nome || 'Agente senza nome']));

  const titolo = filled(d.titolo) ? d.titolo.trim() : group.name;
  push(`${H(0)} ${numero ? `Parte ${numero} · ` : ''}${titolo}\n`);
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

  // 5 · Agenti
  push(`${H(1)} ${sectionLabel('agents')}\n`);
  if (!agents.length) push('*Nessun agente.*\n');
  agents.forEach((a) => {
    push(`${H(2)} ${a.nome || 'Agente senza nome'}${a.socratico ? ' · socratico' : ''}\n`);
    push(table(['Campo', 'Valore'], [
      ...FIELDS.agent.map((f) => [f.label, a[f.key]]),
      ['Modello', MODELLI[a.modello] || a.modello],
      ['Temperatura', a.temperatura ?? ''],
      ...(a.socratico ? [['Domande socratiche', a.domande]] : []),
      ...(a.origine ? [['Origine', `riusato da ${a.origine.nome || 'un agente'} di «${a.origine.groupName}»`], ['Cosa abbiamo adattato', a.adattamento]] : []),
    ]));
  });

  // 6 · Prompt e versioni
  push(`${H(1)} ${sectionLabel('prompt')}\n`);
  agents.forEach((a) => {
    const versioni = Array.isArray(a.versioni) ? a.versioni : [];
    push(`${H(2)} Prompt di ${a.nome || 'agente senza nome'} (versione corrente${versioni.length ? `, dopo v${versioni.length}` : ''})\n`);
    push(codeBlock(a.prompt));
    if (versioni.length) {
      push(`**Storia delle versioni**\n`);
      versioni.forEach((v) => {
        push(`- **v${v.n}** (${fmtDate(v.at)}) — ${cell(v.nota)}\n`);
        push(codeBlock(v.prompt).replace(/^/gm, '  ').replace(/ +$/gm, ''));
      });
    }
  });

  // 7 · Workflow
  const w = d.workflow || {};
  const steps = items(w.steps);
  const stepPos = new Map(steps.map((s, i) => [s.id, i + 1]));
  push(`${H(1)} ${sectionLabel('workflow')}\n`);
  push(`**Pattern.** ${PATTERNS[w.pattern] || para(w.pattern)}\n`);
  push(fieldList(w, FIELDS.workflow));
  push(`**Passi**\n`);
  if (!steps.length) push('*Nessun passo.*\n');
  else push(steps.map((s, i) => {
    if (s.tipo === 'umano') return `${i + 1}. 👤 **Umano nel ciclo** — ${LIVELLI_UMANO[s.livello] || 'livello non indicato'}${filled(s.nota) ? ': ' + cell(s.nota) : ''}`;
    const by = s.soddisfatta === 'input' ? 'input umano iniziale' : stepPos.has(s.soddisfatta) ? `passo ${stepPos.get(s.soddisfatta)}` : 'non indicato';
    return `${i + 1}. 🤖 **${agentName.get(s.agente) || 'agente non scelto'}** — precondizioni da: ${by}${filled(s.nota) ? '. ' + cell(s.nota) : ''}`;
  }).join('\n') + '\n');
  push(`**Verifica del piano**\n`, planCheck(d).checks.map((c) => `- ${c.ok ? '✅' : '⬜'} ${c.label}${c.detail ? ` (${c.detail})` : ''}`).join('\n') + '\n');
  if (filled(w.passi)) push(`**I passi in parole.** ${w.passi.trim()}\n`);
  if (filled(w.dsl)) push(`**Configurazione del workflow**\n`, codeBlock(w.dsl));
  if (filled(w.screenshot)) push(`**Screenshot.** ${w.screenshot.trim()}\n`);

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
 * Il libro intero: una Parte per Task Force (raggruppate per settore), ognuna con
 * i suoi 11 capitoli; in appendice il registro degli agenti e le lezioni apprese.
 */
export function bookToMarkdown(groups, { titolo = 'Agenti al Lavoro · Libro dei casi d\'uso' } = {}) {
  const out = [];
  const bySettore = bookOrder(groups);
  out.push(`# ${titolo}\n`);
  out.push(`*Generato il ${new Date().toLocaleDateString('it-IT', { dateStyle: 'long' })} · ${groups.length} parti, una per Task Force*\n`);

  out.push('## Indice\n');
  const numbered = [];
  bySettore.forEach(({ settore, groups: gs }) => {
    out.push(`- **${settore}**`);
    gs.forEach((g) => {
      numbered.push(g);
      out.push(`  - Parte ${numbered.length} · ${filled(g.data?.titolo) ? g.data.titolo.trim() : g.name} *(${g.name})*`);
    });
  });
  out.push('- Appendice A · Registro degli agenti', '- Appendice B · Lezioni apprese\n');
  out.push(`Ogni parte ha gli stessi ${SECTIONS.length} capitoli: ${SECTIONS.map((s) => s.titolo).join(', ')}.\n`);

  numbered.forEach((g, i) => out.push('---\n', groupToMarkdown(g, { depth: 1, numero: i + 1 })));

  out.push('---\n', '# Appendice A · Registro degli agenti\n');
  const rows = [];
  for (const g of numbered) {
    for (const a of items(g.data?.agents)) {
      rows.push([a.nome, a.ruolo, g.name, MODELLI[a.modello] || a.modello, a.socratico ? 'sì' : 'no', `${a.precond || '…'} → ${a.effetti || '…'}`,
        a.origine ? `da ${a.origine.nome || 'agente'} di ${a.origine.groupName}` : '', reusers(groups, a.id).join(', ')]);
    }
  }
  out.push(table(['Agente', 'Ruolo', 'Task Force', 'Modello', 'Socratico', 'Precondizioni → effetti', 'Origine', 'Riusato da'], rows));

  out.push('# Appendice B · Lezioni apprese\n');
  for (const g of numbered) {
    const c = g.data?.competenze || {};
    out.push(`## ${g.name}\n`);
    out.push(`**Lezioni.** ${para(c.lezioni)}\n`);
    out.push(`**Raccomandazione per un formatore.** ${para(c.raccomandazione)}\n`);
    out.push(`**Cosa non automatizzeremmo.** ${para(c.nonauto)}\n`);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
