#!/usr/bin/env node
/**
 * MCP server: `aiqa-test-runner` — read-only by default, with an opt-in
 * execution tool behind `AIQA_ALLOW_EXEC=true`.
 *
 * Read-only tools always available:
 *   - aiqa.run.list_available_tests     — what specs the suite has, filtered by tag/feature
 *   - aiqa.run.get_last_run_status      — verdict + duration + counts from the last Playwright JSON
 *
 * Gated tool (only when AIQA_ALLOW_EXEC=true):
 *   - aiqa.run.trigger_targeted_run     — runs `playwright test --grep <X>` with bounded args
 *
 * Spec discovery deliberately delegates to the existing-code index — the
 * LLM client can compose: `aiqa.fw.search_tests` → `aiqa.run.list_available_tests`
 * → (after approval) `aiqa.run.trigger_targeted_run`.
 */

import { spawn } from "node:child_process";

import { McpServerBase, ok, err, type ToolResult } from "../../shared/server-base";
import { executionAllowed } from "../../shared/policy";
import { loadExistingCodeIndex } from "../../../src/ai-qa-agent/context/existing-code-index";
import { readPlaywrightReport } from "../../../src/ai-qa-agent/collectors/playwright-report-reader";
import { buildRunSummary } from "../../../src/ai-qa-agent/collectors/run-summary";
import { resolveRunId } from "../../../src/ai-qa-agent/utils/run-id";

function listAvailableTestsTool(args: { tag?: string; feature?: string }): ToolResult {
    const idx = loadExistingCodeIndex();
    let specs = idx.specs;
    if (args.feature) specs = specs.filter(s => s.feature === args.feature);
    if (args.tag) {
        const t = args.tag.replace(/^TAGS\./i, "").replace(/^@/, "").toUpperCase();
        specs = specs.filter(s => s.tags.includes(t));
    }
    return ok({
        count: specs.length,
        specs: specs.map(s => ({ path: s.path, feature: s.feature, tags: s.tags, jiraStories: s.jiraStories, titles: s.titles })),
    });
}

function getLastRunStatusTool(): ToolResult {
    const report = readPlaywrightReport();
    if (!report) return err("no Playwright report found", "run a Playwright run first.");
    return ok(buildRunSummary(report, resolveRunId()));
}

function triggerTargetedRunTool(args: { grep?: string; env?: string; workers?: number; retries?: number; refreshStorage?: boolean }): ToolResult {
    if (!executionAllowed()) {
        return err(
            "test execution is disabled.",
            "Set AIQA_ALLOW_EXEC=true to enable. This is a deliberate guardrail — execution from an LLM should be an explicit human approval.",
        );
    }
    const grep = args.grep ?? "@regression";
    const env = args.env ?? process.env.test_env ?? "test";
    const cmdArgs = [
        "cross-env", `test_env=${env}`, args.refreshStorage ? "refresh=yes" : "refresh=no",
        "playwright", "test", "--grep", grep, "-c", "config/playwright.config.ts",
    ];
    if (typeof args.workers === "number") cmdArgs.push(`--workers=${args.workers}`);
    if (typeof args.retries === "number") cmdArgs.push(`--retries=${args.retries}`);
    // Detach so the MCP server doesn't block. The actual results come back via
    // qa-report after the run completes — this tool just kicks the run off.
    const proc = spawn("npx", cmdArgs, { stdio: "ignore", detached: true });
    proc.unref();
    return ok({
        spawned: true,
        pid: proc.pid,
        command: `npx ${cmdArgs.join(" ")}`,
        note: "Use aiqa.qa.get_run_summary / get_failed_tests after the run completes (Playwright writes test-output/playwright-report.json at the end).",
    });
}

export const testRunnerServer = new McpServerBase({
    name: "aiqa-test-runner",
    version: "1.0.0",
    tools: [
        {
            name: "aiqa.run.list_available_tests",
            description: "Specs in the suite, optionally filtered by tag or feature. Use this to decide what subset to run.",
            inputSchema: {
                type: "object",
                properties: {
                    tag: { type: "string", description: "TAGS.REGRESSION / TAGS.SMOKE / TAGS.P0 / etc." },
                    feature: { type: "string" },
                },
            },
            handler: (a) => listAvailableTestsTool(a as { tag?: string; feature?: string }),
        },
        {
            name: "aiqa.run.get_last_run_status",
            description: "Pass/fail counts and duration from the most recent Playwright JSON report.",
            inputSchema: { type: "object", properties: {} },
            handler: () => getLastRunStatusTool(),
        },
        {
            name: "aiqa.run.trigger_targeted_run",
            description: "Spawn `playwright test --grep <X>` detached. Returns immediately; query qa-report after the run finishes. DISABLED unless AIQA_ALLOW_EXEC=true.",
            inputSchema: {
                type: "object",
                properties: {
                    grep: { type: "string", description: "Tag filter (default @regression)." },
                    env: { type: "string", description: "test_env (default test)." },
                    workers: { type: "number" },
                    retries: { type: "number" },
                    refreshStorage: { type: "boolean" },
                },
            },
            handler: (a) => triggerTargetedRunTool(a as { grep?: string; env?: string; workers?: number; retries?: number; refreshStorage?: boolean }),
        },
    ],
});

if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
    testRunnerServer.start().catch(e => {
        process.stderr.write(`[aiqa-test-runner] fatal: ${(e as Error).message}\n`);
        process.exit(1);
    });
}
