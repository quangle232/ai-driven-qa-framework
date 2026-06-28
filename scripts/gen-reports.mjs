/**
 * gen-reports.mjs — framework-agnostic regression + bug report generator.
 *
 * Inputs:
 *   test-output/playwright-report.json   (Playwright `json` reporter — required)
 *   test-output/ai/bugs.json             (curated bug catalogue — OPTIONAL)
 *
 * Outputs (test-output/ai/):
 *   test-report.html   regression catalogue (pass/fail/skip per spec file + @bugs repro cards)
 *   bug-report.html    stakeholder bug guide grouped by feature
 *   bug-report.md      same, markdown
 *
 * bugs.json shape — an object keyed by TC-ID:
 *   {
 *     "TC-LOGIN-001": {
 *       "bug": "BUG-001", "sev": "High", "pri": "P0",
 *       "feature": "Auth",                // optional; else parsed from `summary` "[pri] [feature] …"
 *       "screen": "Login — /login",
 *       "prereq": "…", "steps": ["…","…"], "expected": "…", "actual": "…",
 *       "summary": "[P0] [Auth] [/login] symptom when action"   // optional one-liner
 *     }
 *   }
 * Everything is derived from the data — no project-specific hardcoding.
 */
import fs from 'fs';

const REPO = process.cwd();
const rel = p => (p ? p.replace(REPO + '/', '') : null);
const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const out = 'test-output/ai';
fs.mkdirSync(out, { recursive: true });

// ---- 1) Parse the Playwright run -------------------------------------------------
const reportPath = 'test-output/playwright-report.json';
if (!fs.existsSync(reportPath)) {
  console.error(`[gen-reports] ${reportPath} not found — run the suite with the json reporter first.`);
  process.exit(1);
}
const r = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const TCID = /TC-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d+/;
const specs = []; // { file, id, title, tags, isBug, pri, status, err, ev }
(function walk(s, file) {
  const f = s.file || file;
  for (const sp of s.specs ?? []) {
    const res = sp.tests?.[0]?.results?.slice(-1)[0];
    const skipped = sp.tests?.[0]?.status === 'skipped' || res?.status === 'skipped';
    const status = skipped ? 'skipped' : sp.ok ? 'passed' : 'failed';
    const tags = (sp.title.match(/@[\w-]+/g) || []);
    const ev = {};
    for (const a of res?.attachments ?? []) ev[a.name] = rel(a.path);
    specs.push({
      file: sp.file || f || '(unknown)',
      id: (sp.title.match(TCID) || [])[0] || null,
      title: sp.title.replace(TCID, '').replace(/@[\w-]+/g, '').replace(/[—-]\s*$/, '').trim(),
      tags, isBug: tags.includes('@bugs'),
      pri: (sp.title.match(/@P\d/) || [])[0] || '',
      status,
      err: (res?.error?.message || '').split('\n')[0].replace(/\[[0-9;]*m/g, '').slice(0, 200),
      ev,
    });
  }
  for (const c of s.suites ?? []) walk(c, f);
})({ suites: r.suites });

const byId = {};
for (const s of specs) if (s.id) byId[s.id] = s;
const pass = specs.filter(s => s.status === 'passed').length;
const fail = specs.filter(s => s.status === 'failed').length;
const skip = specs.filter(s => s.status === 'skipped').length;
const total = specs.length;
const stamp = new Date().toISOString().slice(0, 10);

// ---- 2) Optional bug catalogue ---------------------------------------------------
let BUGS = {};
if (fs.existsSync(`${out}/bugs.json`)) {
  try { BUGS = JSON.parse(fs.readFileSync(`${out}/bugs.json`, 'utf8')); } catch { BUGS = {}; }
}
const bugOrder = Object.keys(BUGS);
const featureOf = id =>
  (BUGS[id].feature || BUGS[id].area ||
    BUGS[id].summary?.match(/^\[[^\]]*\]\s*\[([^\]]*)\]/)?.[1] || 'Other').trim();
const reproduced = id => byId[id] && byId[id].status === 'failed'; // @bug test failing == reproduced
const sevRank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const bugReproduced = bugOrder.filter(reproduced).length;
const criticals = bugOrder.filter(id => /critical/i.test(BUGS[id].sev || ''));

// humanize a spec file path -> a feature heading
const featureOfFile = f => (f.split('/').pop() || f)
  .replace(/\.spec\.ts$/, '').replace(/[-_]/g, ' ')
  .replace(/\b\w/g, c => c.toUpperCase());

// ---- 3) test-report.html (regression catalogue) ---------------------------------
const CSS = `:root{--g:#16a34a;--r:#dc2626;--a:#2563eb;--ink:#0f172a;--mut:#64748b;--line:#e2e8f0;--bg:#f8fafc}*{box-sizing:border-box}body{font:14px/1.5 -apple-system,Segoe UI,Roboto,Arial;color:var(--ink);margin:0}.wrap{max-width:980px;margin:0 auto;padding:32px 28px}h1{font-size:24px;margin:0 0 4px}.sub{color:var(--mut);margin-bottom:20px}.cards{display:flex;gap:12px;flex-wrap:wrap;margin:18px 0 8px}.card{flex:1;min-width:110px;border:1px solid var(--line);border-radius:10px;padding:14px;background:var(--bg)}.card .n{font-size:26px;font-weight:700}.card .l{color:var(--mut);font-size:12px;text-transform:uppercase}.card.ok .n{color:var(--g)}.card.no .n{color:var(--r)}.card.cr .n{color:#b45309}h2{font-size:17px;margin:26px 0 10px;padding-bottom:6px;border-bottom:2px solid var(--line)}.fcount{float:right;font-size:12px;color:var(--mut);font-weight:600}.tc{border:1px solid var(--line);border-left:4px solid var(--g);border-radius:8px;padding:10px 12px;margin:8px 0;break-inside:avoid}.tc.tcfail{border-left-color:var(--r);background:#fef2f2}.tc.tcskip{border-left-color:#cbd5e1;background:#f8fafc}.tch{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.b{font-size:11px;font-weight:700;border-radius:5px;padding:2px 7px;color:#fff}.b.pass{background:var(--g)}.b.fail{background:var(--r)}.b.skip{background:#94a3b8}.b.pri{background:#475569}.b.bug{background:#b45309}.tcid{font-weight:700;color:var(--a)}.tctitle{flex:1;min-width:200px}.repro{margin-top:8px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:8px 12px;font-size:13px}.exp{color:#166534}.act{color:#991b1b}.auto{margin-top:6px;font-size:12px;color:var(--mut)}.evid a{color:var(--a)}@media print{.tc,.repro{box-shadow:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
const evLinks = (ev, prefix = '../../') => ['trace', 'video', 'screenshot', 'error-context']
  .filter(k => ev[k]).map(k => `<a href="${prefix}${ev[k]}">${k}</a>`).join(' · ');

const byFile = {};
for (const s of specs) (byFile[s.file] ??= []).push(s);
let gp = '';
for (const file of Object.keys(byFile).sort()) {
  const list = byFile[file];
  const pc = list.filter(s => s.status === 'passed').length;
  const fc = list.filter(s => s.status === 'failed').length;
  const sk = list.filter(s => s.status === 'skipped').length;
  let body = '';
  for (const s of list) {
    const badge = s.status === 'skipped' ? '<span class="b skip">SKIP</span>'
      : s.status === 'passed' ? '<span class="b pass">PASS</span>' : '<span class="b fail">FAIL</span>';
    let extra = '';
    if (s.err && s.status === 'failed') extra += `<div class="auto">Assertion: <code>${esc(s.err)}</code></div>`;
    if (s.isBug && s.id && BUGS[s.id]) {
      const b = BUGS[s.id];
      extra += `<div class="repro"><b>${reproduced(s.id) ? '✅ Reproduced (valid bug)' : '⚠ NOT reproduced'} — ${esc(b.bug || '')}</b>`
        + (b.expected ? `<div class="exp"><b>Expected:</b> ${esc(b.expected)}</div>` : '')
        + (b.actual ? `<div class="act"><b>Actual:</b> ${esc(b.actual)}</div>` : '') + `</div>`;
    }
    if (Object.keys(s.ev).length) extra += `<div class="auto evid">📎 ${evLinks(s.ev)}</div>`;
    body += `<div class="tc ${s.status === 'failed' ? 'tcfail' : s.status === 'skipped' ? 'tcskip' : ''}"><div class="tch">${badge}`
      + `${s.pri ? `<span class="b pri">${s.pri.slice(1)}</span>` : ''}${s.isBug ? '<span class="b bug">@bugs</span>' : ''}`
      + `${s.id ? `<span class="tcid">${s.id}</span>` : ''}<span class="tctitle">${esc(s.title)}</span></div>${extra}</div>`;
  }
  gp += `<section><h2>${esc(featureOfFile(file))} <span class="fcount">${pc}✓ / ${fc}✗${sk ? ` / ${sk}⊘` : ''}</span></h2>${body}</section>`;
}
fs.writeFileSync(`${out}/test-report.html`,
  `<!doctype html><html><head><meta charset="utf-8"><title>Regression Test Report</title><style>${CSS}</style></head><body><div class="wrap">`
  + `<h1>Regression Test Report</h1><div class="sub">env <b>${process.env.test_env || 'test'}</b> · ${stamp} · serial, Chromium</div>`
  + `<div class="cards"><div class="card"><div class="n">${total}</div><div class="l">Total</div></div>`
  + `<div class="card ok"><div class="n">${pass}</div><div class="l">Passed</div></div>`
  + `<div class="card no"><div class="n">${fail}</div><div class="l">Failed</div></div>`
  + `<div class="card"><div class="n">${skip}</div><div class="l">Skipped</div></div>`
  + `<div class="card cr"><div class="n">${bugReproduced}</div><div class="l">Bugs reproduced</div></div></div>${gp}</div></body></html>`);

// ---- 4) bug-report.html + .md (grouped by feature) ------------------------------
const groups = {};
for (const id of bugOrder) (groups[featureOf(id)] ??= []).push(id);
const secNames = Object.keys(groups).sort((a, b) => {
  const ra = Math.min(...groups[a].map(id => sevRank[BUGS[id].sev] ?? 9));
  const rb = Math.min(...groups[b].map(id => sevRank[BUGS[id].sev] ?? 9));
  return ra - rb || a.localeCompare(b);
});
const BUGCSS = `body{font:14px/1.55 -apple-system,Segoe UI,Roboto,Arial;color:#0f172a;margin:0}.wrap{max-width:900px;margin:0 auto;padding:30px 26px}h1{font-size:23px}.sub{color:#64748b;margin-bottom:16px}.summary{background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 14px;margin-bottom:20px;font-size:13px}.bug{border:1px solid #e2e8f0;border-left:4px solid #dc2626;border-radius:9px;padding:14px 16px;margin:14px 0;break-inside:avoid}.bh{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}.sev{font-size:11px;font-weight:700;color:#fff;border-radius:5px;padding:2px 8px}.critical{background:#7f1d1d}.high{background:#dc2626}.medium{background:#d97706}.low{background:#64748b}.bid{font-weight:800;color:#dc2626}.pri{font-size:11px;background:#475569;color:#fff;border-radius:5px;padding:2px 7px}.tcid{color:#2563eb;font-weight:700}.valid{margin-left:auto;font-size:12px;font-weight:700}.real{color:#16a34a}.no{color:#b45309}.ea{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;margin-top:6px}.exp{color:#166534}.act{color:#991b1b}.sec{font-size:16px;margin:26px 0 8px;padding-bottom:6px;border-bottom:2px solid #e2e8f0}code{background:#f1f5f9;padding:1px 5px;border-radius:4px}`;
let cards = '';
for (const sec of secNames) {
  cards += `<h2 class="sec">${esc(sec)} <span style="color:#64748b;font-weight:400;font-size:12px">${groups[sec].length}</span></h2>`;
  for (const id of groups[sec].sort((a, b) => (sevRank[BUGS[a].sev] ?? 9) - (sevRank[BUGS[b].sev] ?? 9))) {
    const b = BUGS[id], rep = reproduced(id);
    cards += `<div class="bug"><div class="bh"><span class="sev ${(b.sev || '').toLowerCase()}">${esc(b.sev || '')}</span>`
      + `<span class="bid">${esc(b.bug || '')}</span><span class="pri">${esc(b.pri || '')}</span><span class="tcid">${esc(id)}</span>`
      + `<span class="valid ${rep ? 'real' : 'no'}">${rep ? '✅ Reproduced (valid)' : '⚠ NOT reproduced'}</span></div>`
      + (b.summary ? `<div style="font-family:monospace;font-size:12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:6px 8px;margin:2px 0 8px">${esc(b.summary)}</div>` : '')
      + (b.screen ? `<div>📍 ${esc(b.screen)}</div>` : '') + (b.prereq ? `<div><b>Pre-req:</b> ${esc(b.prereq)}</div>` : '')
      + (Array.isArray(b.steps) ? `<ol>${b.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : '')
      + `<div class="ea"><div class="exp"><b>Expected:</b> ${esc(b.expected || '')}</div><div class="act"><b>Actual:</b> ${esc(b.actual || '')}</div></div>`
      + (byId[id]?.err ? `<div style="margin-top:6px;font-size:12px;color:#64748b">Automated assertion: <code>${esc(byId[id].err)}</code></div>` : '')
      + `</div>`;
  }
}
const critLine = criticals.length ? ` 🚨 ${criticals.length} critical: <b>${criticals.map(id => esc(BUGS[id].bug || id)).join(', ')}</b>.` : '';
const summaryHtml = bugOrder.length
  ? `<div class="summary"><b>${bugOrder.length} catalogued → ${bugReproduced} reproduced this run</b>.${critLine}</div>`
  : `<div class="summary">No <code>test-output/ai/bugs.json</code> yet — run the qa-agent skill to catalogue bugs, then re-run <code>yarn report:bugs</code>.</div>`;
fs.writeFileSync(`${out}/bug-report.html`,
  `<!doctype html><html><head><meta charset="utf-8"><title>Bug Report</title><style>${BUGCSS}</style></head><body><div class="wrap">`
  + `<h1>Bug Report <span style="font-weight:400;color:#64748b;font-size:15px">(manual reproduce guide)</span></h1>`
  + `<div class="sub">env <b>${process.env.test_env || 'test'}</b> · ${stamp}</div>${summaryHtml}${cards}</div></body></html>`);

let md = `# Bug Report (manual reproduce)\n\nenv **${process.env.test_env || 'test'}** · ${stamp}\n\n`;
md += bugOrder.length ? `**${bugOrder.length} catalogued → ${bugReproduced} reproduced this run.**${criticals.length ? ` ${criticals.length} critical: ${criticals.map(id => BUGS[id].bug || id).join(', ')}.` : ''}\n\n| BUG | TC | Sev | Pri | Feature |\n|---|---|---|---|---|\n`
  : `_No test-output/ai/bugs.json yet._\n`;
for (const sec of secNames) for (const id of groups[sec]) { const b = BUGS[id]; md += `| ${b.bug || ''} | ${id} | ${b.sev || ''} | ${b.pri || ''} | ${sec} |\n`; }
for (const sec of secNames) {
  md += `\n## ${sec}\n`;
  for (const id of groups[sec]) {
    const b = BUGS[id], rep = reproduced(id);
    md += `\n### ${b.bug || ''} — ${id} · ${b.sev || ''} · ${b.pri || ''} ${rep ? '✅ Reproduced' : '⚠ NOT reproduced'}\n\n`
      + (b.summary ? `> ${b.summary}\n\n` : '') + (b.screen ? `**Screen:** ${b.screen}  \n` : '') + (b.prereq ? `**Pre-req:** ${b.prereq}\n\n` : '')
      + (Array.isArray(b.steps) ? `**Steps:**\n\n${b.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n` : '')
      + `**Expected:** ${b.expected || ''}  \n**Actual:** ${b.actual || ''}\n`;
  }
}
fs.writeFileSync(`${out}/bug-report.md`, md);

console.log(`OK · catalogue ${total} (${pass}✓/${fail}✗/${skip}⊘) · bugs ${bugReproduced}/${bugOrder.length} reproduced · files: test-report.html, bug-report.html, bug-report.md`);
