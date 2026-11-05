// Verifica che la TeX Live installata compili il libro (usato nel build Docker).
// Esce con errore, e il nome del pacchetto mancante, se la compilazione fallisce.
import { bookProject } from '../server/latex.js';
import { pdfAvailable, compilePdf } from '../server/pdf.js';
import { exampleDoc } from './seed.js';

if (!pdfAvailable()) {
  console.error('✖ latexmk o pdflatex non trovati');
  process.exit(1);
}
const t0 = Date.now();
try {
  const pdf = await compilePdf(bookProject([{ id: 'esempio', name: 'Esempio · Onboarding', data: exampleDoc }]));
  console.log(`✓ LaTeX pronto: libro di esempio compilato (${Math.round(pdf.length / 1024)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
} catch (e) {
  console.error('✖ ' + e.message);
  process.exit(1);
}
