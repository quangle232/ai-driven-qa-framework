#!/usr/bin/env node
/**
 * MCP server: `aiqa-qa-report` — exposes the framework's run artifacts.
 *
 * Read-only. Reads `test-output/ai/*.json` + the Playwright JSON report.
 * Every tool returns compact JSON suitable for LLM consumption — never the
 * raw Playwright result.
 *
 * Tools:
 *   - aiqa.qa.get_run_summary           — overall counts + verdict
 *   - aiqa.qa.get_failed_tests          — list final-attempt failures
 *   - aiqa.qa.get_failure_clusters      — clustered failures (after grouping)
 *   - aiqa.qa.get_critical_events       — deterministic critical-pattern hits
 *   - aiqa.qa.get_diagnosis             — per-cluster diagnosis if generated
 *   - aiqa.qa.list_runs                 — historical runIds discovered on disk
 */

import fs from "node:fs";
import path from "node:path";

import { McpServerBase, ok, err, type ToolResult } from "../../shared/server-base";
import { aiqaOutDir, REPO_ROOT } from "../../../src/ai-qa-agent/utils/paths";
import { readPlaywrightReport } from "../../../src/ai-qa-agent/collectors/playwright-report-reader";
import { buildFailureEvents } from "../../../src/ai-qa-agent/collectors/failure-summary-builder";
import { buildRunSummary } from "../../../src/ai-qa-agent/collectors/run-summary";
import { detectCriticalEvents } from "../../../src/ai-qa-agent/watchers/critical-pattern-detector";
import { groupFailures } from "../../../src/ai-qa-agent/analyzers/failure-grouper";
import { resolveRunId } from "../../../src/ai-qa-agent/utils/run-id";
import type { Diagnosis } from "../../../src/ai-qa-agent/schemas/diagnosis.schema";

function getRunId(): string {
    return resolveRunId();
}

function loadFailureEvents() {
    const report = readPlaywrightReport();
    if (!report) return null;
    return { report, events: buildFailureEvents(report, { runId: getRunId(), failuresOnly: true }) };
}

function getRunSummaryTool(): ToolResult {
    const r = loadFailureEvents();
    if (!r) return err("no Playwright report found", "run `aiqa:collect` after Playwright finishes.");
    const summary = buildRunSummary(r.report, getRunId());
    return ok(summary);
}

function getFailedTestsTool(args: { limit?: number; feature?: string; classification?: string }): ToolResult {
    const r = loadFailureEvents();
    if (!r) return err("no Playwright report found");
    let evs = r.events.filter(e => e.isFinalFailure);
    if (args.feature) evs = evs.filter(e => e.file.includes(`/${args.feature}/`) || e.file.includes(`/${args.feature}.`));
    const limit = typeof args.limit === "number" ? args.limit : 50;
    return ok({
        runId: getRunId(),
        count: evs.length,
        events: evs.slice(0, limit).map(e => ({
            testId: e.testId,
            title: e.title,
            file: e.file,
            project: e.project,
            tags: e.tags,
            jiraStoryKey: e.jiraStoryKey,
            durationMs: e.durationMs,
            errorMessage: e.error.message,
            stackTop: e.error.stackTop,
            artifacts: e.artifacts,
        })),
        truncated: evs.length > limit,
    });
}

function getFailureClustersTool(): ToolResult {
    const r = loadFailureEvents();
    if (!r) return err("no Playwright report found");
    const clusters = groupFailures(r.events);
    return ok({
        runId: getRunId(),
        count: clusters.length,
        clusters: clusters.map(c => ({
            fingerprint: c.fingerprint,
            coarseClass: c.coarseClass,
            representativeMessage: c.representativeMessage,
            size: c.events.length,
            affectedTests: c.events.map(e => ({ testId: e.testId, title: e.title, file: e.file })),
        })),
    });
}

function getCriticalEventsTool(): ToolResult {
    const r = loadFailureEvents();
    if (!r) return err("no Playwright report found");
    const criticals = detectCriticalEvents(r.events);
    return ok({ runId: getRunId(), count: criticals.length, criticals });
}

function getDiagnosisTool(args: { fingerprint?: string }): ToolResult {
    const file = path.join(aiqaOutDir(), "diagnosis.json");
    if (!fs.existsSync(file)) return err("no diagnosis recorded", "run `aiqa:diagnose` first.");
    let obj: { runId: string; diagnoses?: Diagnosis[]; criticals?: unknown[] };
    try { obj = JSON.parse(fs.readFileSync(file, "utf8")); } catch { return err("diagnosis.json is not valid JSON"); }
    const diagnoses = Array.isArray(obj.diagnoses) ? obj.diagnoses : [];
    if (args.fingerprint) {
        // Match by testId — the diagnosis records keep testId but not fingerprint.
        const r = loadFailureEvents();
        if (!r) return ok({ runId: obj.runId, fingerprint: args.fingerprint, diagnosis: null });
        const clusters = groupFailures(r.events);
        const target = clusters.find(c => c.fingerprint === args.fingerprint);
        if (!target) return ok({ runId: obj.runId, fingerprint: args.fingerprint, diagnosis: null });
        const ids = new Set(target.events.map(e => e.testId));
        const match = diagnoses.find(d => ids.has(d.testId));
        return ok({ runId: obj.runId, fingerprint: args.fingerprint, diagnosis: match ?? null });
    }
    return ok({ runId: obj.runId, count: diagnoses.length, diagnoses, criticals: obj.criticals ?? [] });
}

function listRunsTool(): ToolResult {
    const dir = path.join(aiqaOutDir(), "decisions");
    if (!fs.existsSync(dir)) return ok({ runs: [] });
    const seen = new Set<string>();
    for (const f of fs.readdirSync(dir)) {
        const m = f.match(/^(.+?)__/);
        if (m) seen.add(m[1]);
    }
    return ok({ runs: [...seen].sort() });
}

export const qaReportServer = new McpServerBase({
    name: "aiqa-qa-report",
    version: "1.0.0",
    tools: [
        {
            name: "aiqa.qa.get_run_summary",
            description: "Pass/fail/flaky/skipped counts + duration for the latest run.",
            inputSchema: { type: "object", properties: {} },
            handler: () => getRunSummaryTool(),
        },
        {
            name: "aiqa.qa.get_failed_tests",
            description: "Final-attempt failures with error message, stack top, and artifact paths. Filter by feature.",
            inputSchema: {
                type: "object",
                properties: {
                    limit: { type: "number", description: "Max events to return (default 50)." },
                    feature: { type: "string", description: "Filter by feature dir name." },
                },
            },
            handler: (a) => getFailedTestsTool(a as { limit?: number; feature?: string }),
        },
        {
            name: "aiqa.qa.get_failure_clusters",
            description: "Failures grouped by normalized error fingerprint. Use this BEFORE asking about individual failures — identical errors collapse to one cluster.",
            inputSchema: { type: "object", properties: {} },
            handler: () => getFailureClustersTool(),
        },
        {
            name: "aiqa.qa.get_critical_events",
            description: "Deterministic critical-pattern hits (smoke fail, login blocked, 5xx, ≥30% same-reason, etc.).",
            inputSchema: { type: "object", properties: {} },
            handler: () => getCriticalEventsTool(),
        },
        {
            name: "aiqa.qa.get_diagnosis",
            description: "AI / deterministic diagnoses recorded during the last `aiqa diagnose` run. Pass `fingerprint` to fetch one cluster's diagnosis only.",
            inputSchema: {
                type: "object",
                properties: { fingerprint: { type: "string" } },
            },
            handler: (a) => getDiagnosisTool(a as { fingerprint?: string }),
        },
        {
            name: "aiqa.qa.list_runs",
            description: "Historical run ids that have produced decision artifacts on disk.",
            inputSchema: { type: "object", properties: {} },
            handler: () => listRunsTool(),
        },
    ],
});

// Mark REPO_ROOT as used for the path-resolver guard in policy.ts (the tools
// only consume absolute repo paths via aiqaOutDir; this keeps tree-shaking
// from dropping the import that other tools may rely on).
void REPO_ROOT;

if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
    qaReportServer.start().catch(e => {
        process.stderr.write(`[aiqa-qa-report] fatal: ${(e as Error).message}\n`);
        process.exit(1);
    });
}
