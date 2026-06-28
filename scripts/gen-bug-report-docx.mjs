/**
 * gen-bug-report-docx.mjs — framework-agnostic .docx bug report (stakeholder-friendly).
 * Reads test-output/ai/bugs.json (+ playwright-report.json for repro status) → test-output/ai/bug-report.docx.
 * No-op (exit 0) when bugs.json is absent. Requires the `docx` package (in devDependencies).
 * bugs.json shape: see scripts/gen-reports.mjs header.
 */
import { createRequire } from 'module'; import fs from 'fs';
const require = createRequire(import.meta.url);

const out = 'test-output/ai';
if (!fs.existsSync(`${out}/bugs.json`)) {
  console.log('[gen-bug-report-docx] no test-output/ai/bugs.json — skipping .docx.');
  process.exit(0);
}
let docx;
try { docx = require('docx'); }
catch { console.error('[gen-bug-report-docx] the "docx" package is not installed — run `yarn install`. Skipping.'); process.exit(0); }
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType,
  LevelFormat, HeadingLevel, BorderStyle, WidthType, ShadingType } = docx;

const REPO = process.cwd(); const rel = p => (p ? p.replace(REPO + '/', '') : null);
const byId = {};
if (fs.existsSync('test-output/playwright-report.json')) {
  const r = JSON.parse(fs.readFileSync('test-output/playwright-report.json', 'utf8'));
  (function walk(s) {
    for (const sp of s.specs ?? []) {
      const id = (sp.title.match(/TC-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d+/) || [])[0];
      const res = sp.tests?.[0]?.results?.slice(-1)[0];
      if (id) { const ev = {}; for (const a of res?.attachments ?? []) ev[a.name] = rel(a.path);
        byId[id] = { ok: sp.ok, err: (res?.error?.message || '').split('\n')[0].replace(/\[[0-9;]*m/g, '').slice(0, 170), ev }; }
    }
    for (const c of s.suites ?? []) walk(c);
  })({ suites: r.suites });
}
const BUGS = JSON.parse(fs.readFileSync(`${out}/bugs.json`, 'utf8'));
const bugOrder = Object.keys(BUGS);
const stamp = new Date().toISOString().slice(0, 10);
const sevRank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const sevColor = s => ({ Critical: '7F1D1D', High: 'DC2626', Medium: 'D97706', Low: '64748B' }[s] || '000000');
const featureOf = id => (BUGS[id].feature || BUGS[id].area ||
  BUGS[id].summary?.match(/^\[[^\]]*\]\s*\[([^\]]*)\]/)?.[1] || 'Other').trim();
const reproduced = id => byId[id] && byId[id].ok === false;
const criticals = bugOrder.filter(id => /critical/i.test(BUGS[id].sev || ''));

const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const borders = { top: border, bottom: border, left: border, right: border };
const cell = (txt, w, opts = {}) => new TableCell({ borders, width: { size: w, type: WidthType.DXA },
  shading: { fill: opts.head ? '1F2937' : 'FFFFFF', type: ShadingType.CLEAR },
  margins: { top: 60, bottom: 60, left: 100, right: 100 },
  children: [new Paragraph({ children: [new TextRun({ text: txt, bold: !!opts.head, color: opts.head ? 'FFFFFF' : (opts.color || '000000'), size: 18 })] })] });
const COLW = [1300, 1450, 1050, 700, 4860];

const children = [];
children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Bug Report')] }));
children.push(new Paragraph({ children: [new TextRun({ text: 'Manual reproduce guide for stakeholders & bug filing', italics: true, color: '64748B' })] }));
children.push(new Paragraph({ children: [new TextRun({ text: `env ${process.env.test_env || 'test'}  ·  ${stamp}`, size: 18, color: '64748B' })] }));
const repCount = bugOrder.filter(reproduced).length;
children.push(new Paragraph({ spacing: { before: 120, after: 120 }, children: [
  new TextRun({ text: `${bugOrder.length} catalogued → ${repCount} reproduced this run`, bold: true }),
  ...(criticals.length ? [new TextRun({ text: `  ·  ${criticals.length} critical: ${criticals.map(id => BUGS[id].bug || id).join(', ')}`, bold: true, color: '7F1D1D' })] : []),
] }));

// summary table
children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Summary')] }));
const rows = [new TableRow({ tableHeader: true, children: [cell('BUG', COLW[0], { head: 1 }), cell('Test case', COLW[1], { head: 1 }), cell('Severity', COLW[2], { head: 1 }), cell('Priority', COLW[3], { head: 1 }), cell('Feature', COLW[4], { head: 1 })] })];
for (const id of bugOrder) { const b = BUGS[id]; rows.push(new TableRow({ children: [cell(b.bug || '', COLW[0]), cell(id, COLW[1]), cell(b.sev || '', COLW[2], { color: sevColor(b.sev) }), cell(b.pri || '', COLW[3]), cell(featureOf(id), COLW[4])] })); }
children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: COLW, rows }));

// grouped detail
const groups = {}; for (const id of bugOrder) (groups[featureOf(id)] ??= []).push(id);
const secNames = Object.keys(groups).sort((a, b) =>
  Math.min(...groups[a].map(id => sevRank[BUGS[id].sev] ?? 9)) - Math.min(...groups[b].map(id => sevRank[BUGS[id].sev] ?? 9)) || a.localeCompare(b));
const flat = secNames.flatMap(s => groups[s].sort((a, b) => (sevRank[BUGS[a].sev] ?? 9) - (sevRank[BUGS[b].sev] ?? 9)));
const numbering = { config: flat.map((_, i) => ({ reference: `s${i}`, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 560, hanging: 280 } } } }] })) };

for (const sec of secNames) {
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 260 }, children: [new TextRun(`${sec} (${groups[sec].length})`)] }));
  for (const id of groups[sec]) {
    const i = flat.indexOf(id); const b = BUGS[id]; const st = byId[id] || { ev: {} }; const rep = reproduced(id);
    children.push(new Paragraph({ spacing: { before: 180 }, children: [
      new TextRun({ text: `${b.bug || ''} — ${id}`, bold: true }),
      new TextRun({ text: `   [${b.sev || ''} · ${b.pri || ''}]`, bold: true, color: sevColor(b.sev) }),
      new TextRun({ text: `   ${rep ? '✓ Reproduced (valid bug)' : 'NOT reproduced'}`, bold: true, color: rep ? '16A34A' : 'D97706' }),
    ] }));
    if (b.summary) children.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: b.summary, font: 'Consolas', size: 17 })] }));
    if (b.screen) children.push(new Paragraph({ children: [new TextRun({ text: 'Screen: ', bold: true }), new TextRun(b.screen)] }));
    if (b.prereq) children.push(new Paragraph({ children: [new TextRun({ text: 'Pre-req: ', bold: true }), new TextRun(b.prereq)] }));
    if (Array.isArray(b.steps) && b.steps.length) {
      children.push(new Paragraph({ spacing: { before: 60 }, children: [new TextRun({ text: 'Steps to reproduce:', bold: true })] }));
      for (const s of b.steps) children.push(new Paragraph({ numbering: { reference: `s${i}`, level: 0 }, children: [new TextRun(s)] }));
    }
    if (b.expected) children.push(new Paragraph({ spacing: { before: 60 }, children: [new TextRun({ text: 'Expected: ', bold: true, color: '166534' }), new TextRun({ text: b.expected, color: '166534' })] }));
    if (b.actual) children.push(new Paragraph({ children: [new TextRun({ text: 'Actual: ', bold: true, color: '991B1B' }), new TextRun({ text: b.actual, color: '991B1B' })] }));
    if (st.err) children.push(new Paragraph({ children: [new TextRun({ text: 'Automated assertion: ', bold: true }), new TextRun({ text: st.err, font: 'Consolas', size: 18 })] }));
    const ev = st.ev || {}; const evparts = ['trace', 'video', 'screenshot', 'error-context'].filter(k => ev[k]).map(k => `${k}: ${ev[k]}`);
    if (evparts.length) children.push(new Paragraph({ children: [new TextRun({ text: 'Evidence: ', bold: true }), new TextRun({ text: evparts.join('  |  '), size: 16, color: '475569' })] }));
  }
}

const doc = new Document({
  styles: { default: { document: { run: { font: 'Arial', size: 20 } } }, paragraphStyles: [
    { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 34, bold: true, font: 'Arial' }, paragraph: { spacing: { after: 160 }, outlineLevel: 0 } },
    { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 24, bold: true, font: 'Arial' }, paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 1 } },
  ] },
  numbering,
  sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children }],
});
Packer.toBuffer(doc).then(buf => { fs.writeFileSync(`${out}/bug-report.docx`, buf); console.log(`wrote ${out}/bug-report.docx (${buf.length} bytes)`); });
