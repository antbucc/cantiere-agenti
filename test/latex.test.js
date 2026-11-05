// Test dell'export LaTeX: escape del testo libero, struttura del progetto, zip, PDF.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { tex, texBlock, verbText, labelSlug, groupToLatex, bookProject, groupProject, singleFile } from '../server/latex.js';
import { makeZip, crc32 } from '../server/zip.js';
import { pdfAvailable, compilePdf } from '../server/pdf.js';
import { exampleDoc } from '../scripts/seed.js';
import { reuseAgent } from '../public/js/model.js';

const esempio = { id: 'esempio', name: 'Esempio · Onboarding', data: exampleDoc };

test('tex: escape dei caratteri speciali e dei simboli', () => {
  assert.equal(tex('50% & $x_1$ #2 {a} \\ ~^'), '50\\% \\& \\$x\\_1\\$ \\#2 \\{a\\} \\textbackslash{} \\textasciitilde{}\\textasciicircum{}');
  assert.equal(tex('[nota] → ✓'), '{[}nota{]} $\\rightarrow$ \\checkmark{}');
  assert.equal(tex('«Zoë» àèìòù Łukasz'), '\\guillemotleft{}Zoë\\guillemotright{} àèìòù Łukasz');
  assert.equal(tex('ciao 😀 🚀 mondo'), 'ciao mondo', 'le emoji non bloccano pdfLaTeX');
  assert.equal(tex('"dritte"'), '\\textquotedbl{}dritte\\textquotedbl{}', 'niente " attivo di babel-italian');
});

test('texBlock: paragrafi e a capo', () => {
  assert.equal(texBlock('a\nb\n\nc'), 'a \\newline\nb\n\nc');
  assert.equal(texBlock('a\n\nb', { inCell: true }), 'a \\newline\nb');
  assert.equal(texBlock('  '), '\\textit{---}');
});

test('verbText: il prompt resta letterale ma sicuro', () => {
  assert.equal(verbText('{x} \\n % → …'), '{x} \\n % -> ...');
  assert.equal(verbText('fine\n\\end{Verbatim}\nresto 😀'), 'fine\n\\end {Verbatim}\nresto ?');
});

test('una Task Force è una \\part con 11 capitoli e le label', () => {
  const t = groupToLatex(esempio, { slug: 'esempio' });
  assert.match(t, /\\part\[Il primo mese senza panico\]/);
  assert.match(t, /\\label\{part:esempio\}/);
  assert.equal([...t.matchAll(/\\chapter\{/g)].length, 11);
  for (const k of ['scenario', 'personas', 'stories', 'mockup', 'agents', 'prompt', 'workflow', 'tests', 'analisi', 'etica', 'competenze']) {
    assert.match(t, new RegExp(`\\\\label\\{cap:esempio:${k}\\}`));
  }
  assert.match(t, /\\begin\{Verbatim\}\[[^\]]*breaklines[^\]]*\]\nSei lo Smistatore dello studio\./);
  assert.match(t, /\\colorbox\{giallo!45\}\{\\textbf\{Umano nel ciclo\}\} --- È informato/);
  assert.match(t, /\\item\[\\textcolor\{verde\}\{\\checkmark\}\] Ogni precondizione è coperta/);
});

test('il libro: ordine per settore, appendici, rimandi al registro e alle copie', () => {
  const copia = { ...reuseAgent({ id: 'a_risp', ...exampleDoc.agents.a_risp }, esempio), ord: 1 };
  const altro = { id: 'g2', name: 'Le Sentinelle', data: { titolo: 'Triage', settore: 'Cura e salute', agents: { x: copia } } };
  const files = bookProject([altro, esempio]);
  assert.deepEqual(Object.keys(files).sort(), ['appendici.tex', 'main.tex', 'parti/01-esempio-onboarding.tex', 'parti/02-le-sentinelle.tex', 'preambolo.tex']);
  assert.match(files['main.tex'], /\\input\{parti\/01-esempio-onboarding\}\n\\input\{parti\/02-le-sentinelle\}/);
  assert.match(files['preambolo.tex'], /\\counterwithin\*\{chapter\}\{part\}/);
  assert.match(files['appendici.tex'], /\\appendix/);
  assert.match(files['appendici.tex'], /\\hyperref\[agente:esempio-onboarding:a-smist\]\{\\textbf\{Smistatore\}\}/);
  // la copia rimanda all'agente originale
  assert.match(files['parti/02-le-sentinelle.tex'], /Riusato da \\hyperref\[agente:esempio-onboarding:a-risp\]/);
  const one = singleFile(files);
  assert.doesNotMatch(one, /\\input\{/);
  assert.match(one, /\\documentclass/);
});

test('nomi di Task Force simili non producono label duplicate', () => {
  const a = { id: 'a', name: 'Alfa!', data: {} };
  const b = { id: 'b', name: 'Alfa?', data: {} };
  const files = bookProject([a, b]);
  assert.ok(files['parti/02-alfa-2.tex']);
  assert.equal(labelSlug('Le Sentinelle & Co_#1'), 'le-sentinelle-co-1');
});

test('zip valido (verificato con unzip, se presente)', (t) => {
  const zip = makeZip({ 'main.tex': 'ciao', 'parti/à.tex': 'è' }, { folder: 'progetto' });
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  if (zlib.crc32) assert.equal(crc32(Buffer.from('ciao è')), zlib.crc32(Buffer.from('ciao è'))); // confronto con l'implementazione di Node
  let unzip = true;
  try { execFileSync('unzip', ['-v'], { stdio: 'ignore' }); } catch { unzip = false; }
  if (!unzip) return t.skip('unzip non disponibile');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-test-'));
  const file = path.join(dir, 'p.zip');
  fs.writeFileSync(file, zip);
  const list = execFileSync('unzip', ['-t', file], { encoding: 'utf8' });
  assert.match(list, /No errors detected/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('il libro con i due esempi compila in PDF', { skip: !pdfAvailable() && 'LaTeX non installato', timeout: 240000 }, async () => {
  const { EXAMPLES } = await import('../scripts/seed.js');
  const pdf = await compilePdf(bookProject(EXAMPLES.map(({ id, name, data }) => ({ id, name, data }))));
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 100000);
  const single = await compilePdf(groupProject(esempio));
  assert.equal(single.subarray(0, 5).toString(), '%PDF-');
});
