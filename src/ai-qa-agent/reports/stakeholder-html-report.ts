/**
 * Single self-contained HTML report for stakeholders: manual QA, BA, PM, BO.
 *
 * Design goals:
 *   - Open in a browser, no server, no JS bundle.
 *   - Hero panel with the verdict in plain language: passed / failed / critical.
 *   - Sections sized for non-technical readers — "What happened" before
 *     "Why we think so" before "Where to look".
 *   - Each failure cluster is one collapsible card. Identical failures collapse
 *     into a single card so the report doesn't drown a PM in 30 rows.
 *   - Trace / video / screenshot links use repo-relative paths.
 *   - Glossary at the bottom explains the agent's classifications.
 *   - Filter chips by classification and feature so QAs can scan quickly.
 *
 * Pure render. The caller assembles {ci, diagnoses, clusters, criticals, run}.
 */

import fs from "node:fs";
import path from "node:path";

import { aiqaOutDir, ensureDir } from "../utils/paths";
import type { CiMetadata } from "../schemas/ci-metadata.schema";
import type { Diagnosis } from "../schemas/diagnosis.schema";
import type { FailureCluster } from "../analyzers/failure-grouper";
import type { CriticalEvent } from "../watchers/critical-pattern-detector";

export interface RunSummary {
    runId: string;
    /** Final-attempt verdict counts (from the Playwright JSON). */
    passed: number;
    failed: number;
    flaky: number;
    skipped: number;
    total: number;
    durationMs: number;
}

export interface StakeholderReportInput {
    ci: CiMetadata;
    run: RunSummary;
    clusters: FailureCluster[];
    diagnoses: Map<string, Diagnosis>;       // keyed by cluster fingerprint
    criticals: CriticalEvent[];
    /** Provider name for the "AI verdict" disclaimer in the hero. */
    aiProvider: string;
}

export function writeStakeholderHtml(input: StakeholderReportInput, outDir = aiqaOutDir()): string {
    ensureDir(outDir);
    const html = render(input);
    const filePath = path.join(outDir, "stakeholder-report.html");
    fs.writeFileSync(filePath, html);
    return filePath;
}

function render(input: StakeholderReportInput): string {
    const { ci, run, clusters, diagnoses, criticals, aiProvider } = input;
    const passRate = run.total > 0 ? Math.round((run.passed / run.total) * 1000) / 10 : 0;
    const verdict = criticals.length > 0
        ? { label: "Critical issue detected", color: "#dc2626", emoji: "🚨" }
        : run.failed > 0
            ? { label: "Failures need review", color: "#d97706", emoji: "⚠️" }
            : { label: "All checks passed", color: "#16a34a", emoji: "✅" };

    const features = new Set<string>();
    const classifications = new Set<string>();
    for (const c of clusters) {
        const d = diagnoses.get(c.fingerprint);
        classifications.add(d?.classification ?? c.coarseClass);
        for (const ev of c.events) {
            const feat = featureFromFile(ev.file);
            if (feat) features.add(feat);
        }
    }

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>AI QA Agent — Run ${esc(run.runId)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root {
  --bg: #f7f7f8;
  --card: #ffffff;
  --text: #18181b;
  --muted: #71717a;
  --line: #e4e4e7;
  --accent: #3b82f6;
  --pass: #16a34a;
  --fail: #dc2626;
  --warn: #d97706;
  --info: #2563eb;
}
* { box-sizing: border-box; }
body { margin: 0; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: var(--text); background: var(--bg); }
.wrap { max-width: 1100px; margin: 0 auto; padding: 24px 20px 80px; }
.hero { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 28px 32px; margin-bottom: 24px; }
.hero h1 { margin: 0 0 6px; font-size: 22px; }
.hero .verdict { display: inline-flex; align-items: center; gap: 10px; padding: 8px 16px; border-radius: 999px; color: white; font-weight: 600; margin: 12px 0 18px; }
.hero .meta { color: var(--muted); font-size: 13px; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-top: 18px; }
.kpi { background: #fafafa; border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
.kpi .v { font-size: 24px; font-weight: 700; }
.kpi .l { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
.section { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 24px 28px; margin-bottom: 20px; }
.section h2 { margin: 0 0 12px; font-size: 18px; }
.section .blurb { color: var(--muted); margin: 0 0 16px; }
.crit { border-left: 4px solid var(--fail); background: #fef2f2; padding: 14px 16px; border-radius: 0 12px 12px 0; margin-bottom: 12px; }
.crit b { color: var(--fail); }
.chips { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 16px; }
.chip { font-size: 12px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--line); cursor: pointer; background: #fafafa; }
.chip.active { background: var(--text); color: white; border-color: var(--text); }
details.cluster { border: 1px solid var(--line); border-radius: 12px; padding: 14px 18px; margin-bottom: 10px; background: #fafafa; }
details.cluster[open] { background: var(--card); }
details.cluster summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
details.cluster summary::-webkit-details-marker { display: none; }
.tag { font-size: 11px; padding: 2px 8px; border-radius: 6px; font-weight: 600; }
.tag.api { background: #ede9fe; color: #6d28d9; }
.tag.locator { background: #fef3c7; color: #b45309; }
.tag.timeout { background: #fee2e2; color: #b91c1c; }
.tag.assertion { background: #dbeafe; color: #1d4ed8; }
.tag.auth { background: #ffe4e6; color: #be123c; }
.tag.environment { background: #d1fae5; color: #047857; }
.tag.app_bug { background: #fee2e2; color: #b91c1c; }
.tag.test_bug { background: #f1f5f9; color: #475569; }
.tag.flaky { background: #fff7ed; color: #c2410c; }
.tag.test_data { background: #f5f3ff; color: #6d28d9; }
.tag.unknown { background: #f3f4f6; color: #4b5563; }
.cluster-body { margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--line); }
.cluster-body h4 { margin: 0 0 6px; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
.cluster-body ul { margin: 0 0 12px 18px; padding: 0; }
.cluster-body code { background: #f4f4f5; padding: 1px 6px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; }
.cluster-body pre { background: #18181b; color: #e4e4e7; padding: 12px 16px; border-radius: 8px; overflow-x: auto; font-size: 12px; }
.evidence-link { display: inline-block; margin-right: 8px; padding: 3px 10px; border-radius: 6px; background: #eff6ff; color: #1d4ed8; text-decoration: none; font-size: 12px; }
.glossary { color: var(--muted); font-size: 13px; }
.glossary dt { font-weight: 600; color: var(--text); margin-top: 8px; }
.glossary dd { margin: 2px 0 0 0; }
.footer { color: var(--muted); font-size: 12px; text-align: center; margin-top: 24px; }
.confidence-bar { display: inline-block; width: 80px; height: 8px; background: #e4e4e7; border-radius: 4px; overflow: hidden; vertical-align: middle; margin-left: 6px; }
.confidence-bar > i { display: block; height: 100%; background: var(--info); }
@media print {
  body { background: white; }
  .wrap { max-width: none; padding: 0; }
  details.cluster { page-break-inside: avoid; }
  .chips { display: none; }
}
</style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    <div class="meta">Run id <code>${esc(run.runId)}</code> · ${esc(ci.provider)}${ci.runUrl ? ` · <a href="${esc(ci.runUrl)}">build link</a>` : ""}</div>
    <h1>AI QA Agent — Test Execution Report</h1>
    <span class="verdict" style="background:${verdict.color}">${verdict.emoji} ${esc(verdict.label)}</span>
    <div class="meta">
      ${ci.branch ? `<span>Branch <code>${esc(ci.branch)}</code></span> · ` : ""}
      ${ci.environment ? `<span>Environment <code>${esc(ci.environment)}</code></span> · ` : ""}
      ${ci.commit ? `<span>Commit <code>${esc(ci.commit.slice(0, 12))}</code></span> · ` : ""}
      <span>${esc(ci.startedAt ?? "")}</span>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="v" style="color:var(--pass)">${run.passed}</div><div class="l">Passed</div></div>
      <div class="kpi"><div class="v" style="color:var(--fail)">${run.failed}</div><div class="l">Failed</div></div>
      <div class="kpi"><div class="v" style="color:var(--warn)">${run.flaky}</div><div class="l">Flaky</div></div>
      <div class="kpi"><div class="v" style="color:var(--muted)">${run.skipped}</div><div class="l">Skipped</div></div>
      <div class="kpi"><div class="v">${run.total}</div><div class="l">Total</div></div>
      <div class="kpi"><div class="v">${passRate}%</div><div class="l">Pass rate</div></div>
      <div class="kpi"><div class="v">${formatDuration(run.durationMs)}</div><div class="l">Duration</div></div>
    </div>
  </div>

  ${renderCriticals(criticals)}

  <div class="section">
    <h2>Failure clusters (${clusters.length})</h2>
    <p class="blurb">Identical failures are grouped so the same root cause shows up once. Click a card to expand.</p>
    ${renderFilters(features, classifications)}
    ${clusters.length === 0 ? "<p>✨ No failure clusters.</p>" : clusters.map(c => renderCluster(c, diagnoses.get(c.fingerprint))).join("")}
  </div>

  <div class="section">
    <h2>Glossary</h2>
    <dl class="glossary">
      <dt>locator</dt><dd>The test couldn't find an element on the page. Often a CSS/data-attribute change in the UI.</dd>
      <dt>timeout</dt><dd>An action or expectation waited longer than allowed. Usually a slow API, network, or missing element.</dd>
      <dt>assertion</dt><dd>The page state didn't match what the test expected. This is the most common "real bug" signal.</dd>
      <dt>api</dt><dd>A backend request failed (often a 5xx). The issue is most likely server-side.</dd>
      <dt>auth</dt><dd>Login, storage state, or permission was wrong. Often a stale storageState or expired account.</dd>
      <dt>environment</dt><dd>Configuration, env vars, or the SUT itself was unreachable. The test is fine; the env isn't.</dd>
      <dt>test_data</dt><dd>The test data wasn't prepared (fixture missing, dependent record not created).</dd>
      <dt>app_bug</dt><dd>A real product defect — most actionable for developers.</dd>
      <dt>test_bug</dt><dd>The test itself is wrong (logic error, race, wrong expectation).</dd>
      <dt>flaky</dt><dd>Behaves differently on retry. Investigate but don't ship a fix until you can reproduce.</dd>
      <dt>unknown</dt><dd>Not enough evidence to classify. Needs a human look.</dd>
    </dl>
  </div>

  <div class="footer">
    Generated by AI QA Agent · AI provider: <code>${esc(aiProvider)}</code> · Diagnoses with provider <code>noop</code> are deterministic (no LLM was called).
  </div>
</div>

<script>
(function() {
  var chips = document.querySelectorAll('.chip');
  chips.forEach(function(chip) {
    chip.addEventListener('click', function() {
      var group = chip.dataset.group, value = chip.dataset.value;
      chip.classList.toggle('active');
      applyFilters();
    });
  });
  function applyFilters() {
    var active = {};
    document.querySelectorAll('.chip.active').forEach(function(c) {
      (active[c.dataset.group] = active[c.dataset.group] || []).push(c.dataset.value);
    });
    document.querySelectorAll('details.cluster').forEach(function(d) {
      var keep = true;
      Object.keys(active).forEach(function(g) {
        var values = active[g];
        if (values.length === 0) return;
        var dv = (d.dataset[g] || '').split('|');
        if (!values.some(function(v) { return dv.indexOf(v) >= 0; })) keep = false;
      });
      d.style.display = keep ? '' : 'none';
    });
  }
})();
</script>
</body>
</html>`;
}

function renderCriticals(crits: CriticalEvent[]): string {
    if (crits.length === 0) return "";
    return `<div class="section">
        <h2>🚨 Critical events (${crits.length})</h2>
        <p class="blurb">These patterns block release or strongly suggest a production-impacting issue.</p>
        ${crits.map(c => `
            <div class="crit">
                <b>${esc(c.trigger.replace(/_/g, " "))}</b> — ${esc(c.summary)}
                <ul>${c.evidence.slice(0, 4).map(e => `<li>${esc(e)}</li>`).join("")}</ul>
                <small>Affecting ${c.affectedTestIds.length} test(s).</small>
            </div>`).join("")}
    </div>`;
}

function renderFilters(features: Set<string>, classes: Set<string>): string {
    if (features.size === 0 && classes.size === 0) return "";
    const chip = (group: string, value: string) =>
        `<span class="chip" data-group="${esc(group)}" data-value="${esc(value)}">${esc(value)}</span>`;
    return `<div class="chips">
        ${[...classes].sort().map(c => chip("classification", c)).join("")}
        ${[...features].sort().map(f => chip("feature", f)).join("")}
    </div>`;
}

function renderCluster(c: FailureCluster, d: Diagnosis | undefined): string {
    const cls = d?.classification ?? c.coarseClass;
    const confidence = d?.confidence ?? 0;
    const feats = new Set<string>();
    for (const ev of c.events) {
        const f = featureFromFile(ev.file);
        if (f) feats.add(f);
    }
    const sample = c.events[0];
    return `<details class="cluster" data-classification="${esc(cls)}" data-feature="${esc([...feats].join("|"))}">
        <summary>
            <span class="tag ${esc(cls)}">${esc(cls)}</span>
            <strong>${esc(sample.title)}</strong>
            ${c.events.length > 1 ? `<span style="color:var(--muted)">×${c.events.length}</span>` : ""}
            <span style="margin-left:auto;color:var(--muted);font-size:12px">${esc(sample.project)}</span>
        </summary>
        <div class="cluster-body">
            <h4>What happened</h4>
            <p>${esc((d?.rootCause || sample.error.message || "").slice(0, 600))}</p>

            ${d ? `<h4>Why we think so <span class="confidence-bar"><i style="width:${Math.round(confidence * 100)}%"></i></span> <span style="color:var(--muted);font-size:12px">${Math.round(confidence * 100)}% confidence · ${esc(d.producedBy)}</span></h4>
            <ul>${(d.evidence ?? []).slice(0, 6).map(e => `<li>${esc(e)}</li>`).join("")}</ul>
            ${d.counterEvidence?.length ? `<h4>Counter-evidence</h4><ul>${d.counterEvidence.map(e => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
            <h4>Recommended action</h4>
            <p>${esc(d.recommendedAction)}</p>` : `<p style="color:var(--muted);font-style:italic">No AI analysis recorded for this cluster.</p>`}

            <h4>Affected tests</h4>
            <ul>${c.events.slice(0, 12).map(e => `<li><code>${esc(e.testId)}</code> — ${esc(e.title)} <small style="color:var(--muted)">(${esc(e.file)})</small></li>`).join("")}${c.events.length > 12 ? `<li><i>…and ${c.events.length - 12} more</i></li>` : ""}</ul>

            ${renderEvidenceLinks(sample)}

            ${sample.error.stackTop.length ? `<h4>Stack top</h4><pre>${esc(sample.error.stackTop.join("\n"))}</pre>` : ""}
        </div>
    </details>`;
}

function renderEvidenceLinks(ev: FailureCluster["events"][number]): string {
    const out: string[] = [];
    if (ev.artifacts.trace)       out.push(`<a class="evidence-link" href="${esc(ev.artifacts.trace)}">▶ Trace</a>`);
    if (ev.artifacts.screenshot)  out.push(`<a class="evidence-link" href="${esc(ev.artifacts.screenshot)}">🖼 Screenshot</a>`);
    if (ev.artifacts.video)       out.push(`<a class="evidence-link" href="${esc(ev.artifacts.video)}">🎥 Video</a>`);
    if (ev.artifacts.allureResult)out.push(`<a class="evidence-link" href="${esc(ev.artifacts.allureResult)}">📊 Allure</a>`);
    if (out.length === 0) return "";
    return `<h4>Evidence</h4><p>${out.join("")}</p>`;
}

function featureFromFile(file: string): string | null {
    const m = file.match(/^tests\/([^/]+)\//);
    return m ? m[1] : null;
}

function formatDuration(ms: number): string {
    if (!ms || ms <= 0) return "—";
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

function esc(s: unknown): string {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
