#!/usr/bin/env node
/**
 * `aiqa` CLI — entrypoint for the AI QA Agent commands.
 *
 * Phase 1 (deterministic):
 *   init, watch, collect, notify-critical, finalize
 *
 * Phase 4 (LLM-backed, token-conscious):
 *   diagnose                 — clusters first, LLM only on confirmed/critical
 *   generate-automation      — test cases (Markdown/JSON) → planning → builder → reviewer → guarded patches
 *   report:html              — single self-contained HTML for stakeholders
 *
 * The CLI never reads `.env`, `.auth/`, or `storageState`. The watcher never
 * calls an LLM. The builder never writes outside `tests/`, `page-objects/`,
 * `test-data/` (enforced by `analyzers/patch-guard.ts`).
 */

import fs from "node:fs";
import path from "node:path";

import { collectCiMetadata } from "../collectors/ci-metadata-collector";
import { readPlaywrightReport } from "../collectors/playwright-report-reader";
import { buildFailureEvents } from "../collectors/failure-summary-builder";
import { buildRunSummary } from "../collectors/run-summary";
import { startWatcher } from "../watchers/file-watcher";
import { detectCriticalEvents } from "../watchers/critical-pattern-detector";
import { writeDiagnosisReport } from "../reports/diagnosis-report-writer";
import { writeCiSummary } from "../reports/ci-summary-writer";
import { writeStakeholderHtml } from "../reports/stakeholder-html-report";
import { notifyCritical } from "../notifications/notification-orchestrator";
import { aiqaOutDir, aiqaSubdir, ensureDir, relativeToRepo } from "../utils/paths";
import { resolveRunId } from "../utils/run-id";
import { resolveProvider } from "../config/ai-provider.config";
import { getActiveMode, FORBIDDEN_BEHAVIORS } from "../config/agent-policy";
import { TokenBudget } from "../context/token-budget";
import { tokenBudgetPolicy } from "../config/token-budget-policy";
import { makeProvider } from "../providers";
import { groupFailures } from "../analyzers/failure-grouper";
import { computeTriggers, newScannerState, markTriggerHandled } from "../analyzers/scanner-trigger";
import { diagnoseCluster } from "../agents/failure-diagnosis-agent";
import { planAutomation } from "../agents/automation-planning-agent";
import { buildAutomation } from "../agents/automation-builder-agent";
import { guardPatches } from "../analyzers/patch-guard";
import { loadTestCaseBundle } from "../inputs/test-case-input";
import { loadExistingCodeIndex, renderIndexForPrompt } from "../context/existing-code-index";
import { applyPatches, formatApplySummary } from "../orchestration/apply-patches";
import { runGuardOnFiles, discoverAllSourceFiles } from "../orchestration/guard-runner";
import { runRegression, summarizeRegressionRun } from "../orchestration/regression-runner";
import { runDoctor, formatDoctorReport } from "../orchestration/doctor";
import { initProject, formatInitSummary, NEXT_STEPS_MESSAGE } from "../orchestration/init-project";
import { SERVERS, findServer } from "../../../mcp";
import type { Diagnosis } from "../schemas/diagnosis.schema";
import type { FailureEvent } from "../schemas/failure-event.schema";

type Command =
    | "init" | "watch" | "collect" | "diagnose"
    | "notify-critical" | "finalize"
    | "generate-automation" | "report:html"
    | "scan" | "guard" | "run-regression"
    | "mcp:list" | "mcp:start" | "mcp:config"
    | "doctor" | "init-project"
    | "help";

interface Flags { [k: string]: string | true; }

function parseArgs(argv: string[]): { command: Command; flags: Flags } {
    const [, , rawCommand = "help", ...rest] = argv;
    const known: Command[] = [
        "init", "watch", "collect", "diagnose",
        "notify-critical", "finalize",
        "generate-automation", "report:html",
        "scan", "guard", "run-regression",
        "mcp:list", "mcp:start", "mcp:config",
        "doctor", "init-project",
        "help",
    ];
    const command = (known.includes(rawCommand as Command) ? rawCommand : "help") as Command;
    const flags: Flags = {};
    for (let i = 0; i < rest.length; i++) {
        const tok = rest[i];
        if (!tok.startsWith("--")) continue;
        const eq = tok.indexOf("=");
        if (eq >= 0) {
            flags[tok.slice(2, eq)] = tok.slice(eq + 1);
        } else {
            const next = rest[i + 1];
            if (next && !next.startsWith("--")) { flags[tok.slice(2)] = next; i++; }
            else flags[tok.slice(2)] = true;
        }
    }
    return { command, flags };
}

function printHelp(): void {
    process.stdout.write([
        "AI QA Agent CLI",
        "",
        "Usage: aiqa <command> [--flag=value]",
        "",
        "Commands:",
        "  init                    Print active config, mode, provider, CI metadata.",
        "  watch                   Deterministic watcher (no LLM); writes FailureEvent JSON.",
        "  collect                 Read Playwright JSON + Allure index; write failures.json.",
        "  diagnose                Cluster + LLM-classify (if provider available) -> diagnosis.md/json.",
        "  notify-critical         Audit + (if channels configured) send critical alerts.",
        "  finalize                Write ci-summary.md from the latest run.",
        "  report:html             Write a single self-contained stakeholder HTML report.",
        "  generate-automation     Generate Playwright code from a test-case file (Markdown or JSON).",
        "  scan                    Index existing page-objects/specs/tags/keywords; print or write JSON.",
        "  guard                   Run safety rules on file(s) — accept/reject per file (works on generated code).",
        "  run-regression          Spawn playwright + watcher + critical-scanner sub-agent; auto-report on exit.",
        "  mcp:list                List the framework's MCP servers and tool counts.",
        "  mcp:start --server=<id> Start a specific MCP server on stdio (qa-report | framework-context | memory | test-runner).",
        "  mcp:config              Print a `mcpServers` JSON snippet for Claude Code / Cursor.",
        "  doctor                  Health-check the install — Node, deps, env files, auth stub, tags, MCP, provider.",
        "  init-project            Scaffold a fresh project: copy .env.<env>, optional .env.jira, seed .aiqa-memory/.",
        "",
        "Common flags:",
        "  --json=<path>            Override Playwright JSON report path.",
        "  --runId=<id>             Override run id.",
        "  --tokenBudget=<n>        Override the per-session token cap (default from policy).",
        "  --test-cases=<file>      Markdown or JSON test-case bundle (for generate-automation).",
        "  --apply                  generate-automation only: write accepted patches to disk.",
        "  --force-overwrite        generate-automation --apply: replace an existing file even if content differs.",
        "  --force                  diagnose only: ask the LLM even when no critical pattern fired.",
        "  --files=a,b,c            guard: explicit file list (otherwise scans tests/ and page-objects/).",
        "  --out=<path>             scan: write JSON to file instead of stdout.",
        "  --grep=<tag>             run-regression: override the default \"@regression\" grep.",
        "  --env=<env>              run-regression: override test_env (default test).",
        "  --workers=<n>            run-regression: pass-through to playwright.",
        "  --retries=<n>            run-regression: pass-through to playwright.",
        "  --refresh-storage        run-regression: regenerate storageState before the run.",
        "  --no-report              run-regression: skip the post-run report:html step.",
        "",
        `Hard guardrails (always on): ${FORBIDDEN_BEHAVIORS.join(", ")}`,
        "",
    ].join("\n"));
}

function makeBudget(flags: Flags): TokenBudget {
    const cap = typeof flags.tokenBudget === "string"
        ? Number(flags.tokenBudget)
        : tokenBudgetPolicy.maxTotalTokensPerSession;
    return new TokenBudget(Number.isFinite(cap) && cap > 0 ? cap : tokenBudgetPolicy.maxTotalTokensPerSession);
}

async function cmdInit(): Promise<number> {
    const ci = collectCiMetadata();
    const provider = resolveProvider();
    const mode = getActiveMode();
    const outDir = aiqaOutDir();
    ensureDir(outDir);
    process.stdout.write(JSON.stringify({
        mode,
        provider,
        ci,
        outDir: relativeToRepo(outDir),
        forbiddenBehaviors: FORBIDDEN_BEHAVIORS,
        phase: "4 (LLM agents + token harness + stakeholder HTML)",
    }, null, 2) + "\n");
    return 0;
}

async function cmdWatch(flags: Flags): Promise<number> {
    const watcher = await startWatcher({
        playwrightJson: typeof flags.json === "string" ? flags.json : undefined,
        runId: typeof flags.runId === "string" ? flags.runId : undefined,
    });
    const shutdown = async () => { await watcher.close(); process.exit(0); };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    return new Promise<number>(() => { /* runs until signalled */ });
}

async function cmdCollect(flags: Flags): Promise<number> {
    const runId = (typeof flags.runId === "string" ? flags.runId : null) ?? resolveRunId();
    const report = readPlaywrightReport(typeof flags.json === "string" ? flags.json : undefined);
    if (!report) {
        process.stderr.write("[aiqa:collect] Playwright JSON report not found.\n");
        return 0;
    }
    const events = buildFailureEvents(report, { runId, failuresOnly: true });
    const outDir = aiqaOutDir();
    ensureDir(outDir);
    const failuresPath = path.join(outDir, "failures.json");
    fs.writeFileSync(failuresPath, JSON.stringify({ runId, events }, null, 2));
    process.stdout.write(`[aiqa:collect] wrote ${events.length} failure event(s) to ${relativeToRepo(failuresPath)}\n`);
    return 0;
}

async function cmdDiagnose(flags: Flags): Promise<number> {
    const runId = (typeof flags.runId === "string" ? flags.runId : null) ?? resolveRunId();
    const report = readPlaywrightReport(typeof flags.json === "string" ? flags.json : undefined);
    if (!report) {
        process.stderr.write("[aiqa:diagnose] Playwright JSON report not found.\n");
        return 0;
    }
    const events = buildFailureEvents(report, { runId, failuresOnly: true });
    const finalDiagnoses = new Map<string, Diagnosis>();
    const decisionsDir = aiqaSubdir("decisions");

    const provider = makeProvider();
    const budget = makeBudget(flags);

    // Cluster → trigger → LLM (only when allowed by the scanner-trigger gate).
    const state = newScannerState();
    const triggers = computeTriggers({
        events,
        state,
        runComplete: true,
        userRequested: flags.force === true,
    });

    for (const trig of triggers) {
        if (!trig.cluster) continue;
        const result = await diagnoseCluster({
            cluster: trig.cluster,
            critical: trig.critical,
            provider,
            budget,
            runId,
        });
        finalDiagnoses.set(trig.cluster.fingerprint, result.diagnosis);
        markTriggerHandled(state, trig);
        // Audit log per cluster.
        fs.writeFileSync(
            path.join(decisionsDir, `${runId}__${trig.cluster.fingerprint.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80)}.json`),
            JSON.stringify({
                runId,
                trigger: trig.reason,
                cluster: { fingerprint: trig.cluster.fingerprint, size: trig.cluster.events.length, coarseClass: trig.cluster.coarseClass },
                diagnosis: result.diagnosis,
                reviews: result.reviews,
                rounds: result.rounds,
                stopReason: result.stopReason,
            }, null, 2),
        );
    }

    // Write the existing markdown + json report (Phase 1 layout) — but with the
    // LLM-classified diagnoses substituted in when available.
    const { markdownPath, jsonPath, criticals, diagnoses: detDiags } = writeDiagnosisReport({
        runId,
        failureEvents: events,
    });

    // For each final failure, prefer the LLM diagnosis if we generated one.
    const merged = detDiags.map(d => {
        const cluster = groupFailures(events).find(c => c.events.some(ev => ev.testId === d.testId));
        return cluster && finalDiagnoses.has(cluster.fingerprint) ? finalDiagnoses.get(cluster.fingerprint)! : d;
    });
    fs.writeFileSync(jsonPath, JSON.stringify({ runId, ci: collectCiMetadata(), diagnoses: merged, criticals, budget: budget.snapshot() }, null, 2));

    const llmCalls = budget.snapshot().calls;
    process.stdout.write(
        `[aiqa:diagnose] clusters=${triggers.length} llmCalls=${llmCalls} tokensSpent=${budget.snapshot().spent}/${budget.snapshot().cap}\n`
        + `  markdown: ${relativeToRepo(markdownPath)}\n`
        + `  json:     ${relativeToRepo(jsonPath)}\n`,
    );
    return 0;
}

async function cmdNotifyCritical(flags: Flags): Promise<number> {
    const runId = (typeof flags.runId === "string" ? flags.runId : null) ?? resolveRunId();
    const report = readPlaywrightReport(typeof flags.json === "string" ? flags.json : undefined);
    if (!report) { process.stdout.write("[aiqa:notify-critical] no report.\n"); return 0; }
    const events = buildFailureEvents(report, { runId, failuresOnly: true });
    const criticals = detectCriticalEvents(events);
    const { recordPath, sent, skipped } = notifyCritical({ runId, criticals });
    if (!recordPath) { process.stdout.write("[aiqa:notify-critical] no critical events.\n"); return 0; }
    process.stdout.write(`[aiqa:notify-critical] critical=${criticals.length} sent=${sent} dry-run=${skipped} record=${relativeToRepo(recordPath)}\n`);
    return 0;
}

async function cmdFinalize(flags: Flags): Promise<number> {
    const runId = (typeof flags.runId === "string" ? flags.runId : null) ?? resolveRunId();
    const report = readPlaywrightReport(typeof flags.json === "string" ? flags.json : undefined);
    if (!report) { process.stdout.write("[aiqa:finalize] no report.\n"); return 0; }
    const events = buildFailureEvents(report, { runId, failuresOnly: true });
    const criticals = detectCriticalEvents(events);
    const filePath = writeCiSummary({ runId, failureEvents: events, criticals });
    process.stdout.write(`[aiqa:finalize] wrote ${relativeToRepo(filePath)}\n`);
    return 0;
}

async function cmdReportHtml(flags: Flags): Promise<number> {
    const runId = (typeof flags.runId === "string" ? flags.runId : null) ?? resolveRunId();
    const report = readPlaywrightReport(typeof flags.json === "string" ? flags.json : undefined);
    if (!report) { process.stderr.write("[aiqa:report:html] no Playwright report.\n"); return 0; }

    const events = buildFailureEvents(report, { runId, failuresOnly: true });
    const clusters = groupFailures(events);
    const criticals = detectCriticalEvents(events);
    const summary = buildRunSummary(report, runId);
    const ci = collectCiMetadata();
    const provider = resolveProvider();

    // Try to reuse LLM diagnoses if `diagnose` was run earlier in this CWD.
    const diagnoses = new Map<string, Diagnosis>();
    const dx = readDiagnosesFromDisk(runId);
    if (dx.length > 0) {
        for (const cluster of clusters) {
            const sampleId = cluster.events[0].testId;
            const match = dx.find(d => d.testId === sampleId);
            if (match) diagnoses.set(cluster.fingerprint, match);
        }
    }

    const file = writeStakeholderHtml({
        ci,
        run: summary,
        clusters,
        diagnoses,
        criticals,
        aiProvider: provider.name,
    });
    process.stdout.write(`[aiqa:report:html] wrote ${relativeToRepo(file)} — open in a browser.\n`);
    return 0;
}

function readDiagnosesFromDisk(_runId: string): Diagnosis[] {
    const f = path.join(aiqaOutDir(), "diagnosis.json");
    if (!fs.existsSync(f)) return [];
    try {
        const obj = JSON.parse(fs.readFileSync(f, "utf8"));
        return Array.isArray(obj?.diagnoses) ? obj.diagnoses as Diagnosis[] : [];
    } catch { return []; }
}

async function cmdGenerateAutomation(flags: Flags): Promise<number> {
    const tcFlag = typeof flags["test-cases"] === "string" ? flags["test-cases"] as string : null;
    if (!tcFlag) {
        process.stderr.write("[aiqa:generate-automation] missing --test-cases=<path-to-md-or-json>\n");
        return 2;
    }
    const bundle = loadTestCaseBundle(tcFlag);
    const provider = makeProvider();
    const budget = makeBudget(flags);

    process.stdout.write(`[aiqa:generate-automation] feature=${bundle.feature} jira=${bundle.jiraStoryKey ?? "—"} tests=${bundle.testCases.length} provider=${provider.name}\n`);

    const plan = await planAutomation({ bundle, provider, budget });
    const planDir = aiqaSubdir("plans");
    const planFile = path.join(planDir, `${slug(bundle.feature)}-plan.json`);
    fs.writeFileSync(planFile, JSON.stringify(plan, null, 2));

    const build = await buildAutomation({ bundle, plan, provider, budget });
    const { accepted, rejected } = guardPatches(build.output.patches);

    const patchesDir = aiqaSubdir(`patches/${slug(bundle.feature)}`);
    for (const p of accepted) {
        const out = path.join(patchesDir, p.path.replace(/[/\\]/g, "__"));
        fs.writeFileSync(out, p.content);
    }
    fs.writeFileSync(path.join(patchesDir, "_manifest.json"), JSON.stringify({
        feature: bundle.feature,
        jiraStoryKey: bundle.jiraStoryKey,
        plan,
        accepted: accepted.map(a => ({ path: a.path, kind: a.kind, rationale: a.rationale })),
        rejected: rejected.map(r => ({ path: r.patch.path, reason: r.reason })),
        reviews: build.reviews,
        rounds: build.rounds,
        stopReason: build.stopReason,
        tokenBudget: budget.snapshot(),
        notes: build.output.notes,
    }, null, 2));

    process.stdout.write(
        `[aiqa:generate-automation] plan=${relativeToRepo(planFile)} patches=${accepted.length} rejected=${rejected.length} rounds=${build.rounds} tokens=${budget.snapshot().spent}\n`
        + `  patch dir: ${relativeToRepo(patchesDir)}\n`,
    );

    if (rejected.length > 0) {
        process.stdout.write(`[aiqa:generate-automation] ${rejected.length} patch(es) refused by the safety gate:\n`);
        for (const r of rejected) process.stdout.write(`  - ${r.patch.path}: ${r.reason}\n`);
    }

    if (flags.apply === true) {
        if (rejected.length > 0) {
            process.stderr.write("[aiqa:generate-automation] --apply blocked: refuse to apply when any patch was rejected by the safety gate.\n");
            return 3;
        }
        const dry = applyPatches(accepted, { forceOverwrite: flags["force-overwrite"] === true, dryRun: true });
        process.stdout.write(`[aiqa:generate-automation] apply plan (dry):\n${formatApplySummary(dry)}\n`);
        if (dry.refused > 0 && flags["force-overwrite"] !== true) {
            process.stderr.write("[aiqa:generate-automation] --apply blocked: at least one file conflicts. Re-run with --force-overwrite to replace existing content.\n");
            return 4;
        }
        const real = applyPatches(accepted, { forceOverwrite: flags["force-overwrite"] === true });
        process.stdout.write(`[aiqa:generate-automation] applied: created=${real.created} updated=${real.updated} skipped=${real.skippedIdentical}\n`);
    } else {
        process.stdout.write("[aiqa:generate-automation] DRY-RUN — re-run with --apply (and --force-overwrite if you intend to replace existing files) once a human has reviewed the patches.\n");
    }

    return 0;
}

async function cmdScan(flags: Flags): Promise<number> {
    const index = loadExistingCodeIndex();
    const summary = {
        knownFeatures: index.knownFeatures,
        pageObjects: index.pageObjects.length,
        specs: index.specs.length,
        testData: index.testData.length,
        declaredTags: index.declaredTags,
        actionKeywordMethodsCount: index.actionKeywordMethods.length,
    };
    if (typeof flags.out === "string") {
        fs.writeFileSync(flags.out, JSON.stringify(index, null, 2));
        process.stdout.write(`[aiqa:scan] wrote full index to ${flags.out}\n`);
        process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
    } else if (flags.full === true) {
        process.stdout.write(JSON.stringify(index, null, 2) + "\n");
    } else if (flags.prompt === true) {
        process.stdout.write(renderIndexForPrompt(index) + "\n");
    } else {
        process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
        process.stdout.write(`[aiqa:scan] use --full for full JSON, --prompt for the agent-ready block, --out=<file> to save.\n`);
    }
    return 0;
}

async function cmdGuard(flags: Flags): Promise<number> {
    const fileFlag = typeof flags.files === "string" ? flags.files : "";
    const files = fileFlag
        ? fileFlag.split(",").map(s => s.trim()).filter(Boolean)
        : discoverAllSourceFiles();
    if (files.length === 0) {
        process.stdout.write("[aiqa:guard] nothing to check (no tests/ or page-objects/ files found).\n");
        return 0;
    }
    const result = runGuardOnFiles(files);
    process.stdout.write(`[aiqa:guard] checked=${files.length} accepted=${result.accepted.length} rejected=${result.rejected.length}\n`);
    for (const a of result.accepted) process.stdout.write(`  ✓ ${a.path}\n`);
    for (const r of result.rejected) process.stdout.write(`  ✗ ${r.patch.path} — ${r.reason}\n`);
    return result.rejected.length > 0 ? 1 : 0;
}

async function cmdRunRegression(flags: Flags): Promise<number> {
    const res = await runRegression({
        env: typeof flags.env === "string" ? flags.env : undefined,
        grep: typeof flags.grep === "string" ? flags.grep : undefined,
        workers: typeof flags.workers === "string" ? Number(flags.workers) : undefined,
        retries: typeof flags.retries === "string" ? Number(flags.retries) : undefined,
        refreshStorage: flags["refresh-storage"] === true,
    });

    // Post-run pipeline — always runs regardless of pass/fail.
    process.stdout.write(`\n[aiqa:run-regression] post-run pipeline…\n`);
    await cmdCollect({});
    await cmdDiagnose({ runId: res.runId });
    await cmdFinalize({ runId: res.runId });
    if (flags["no-report"] !== true) {
        await cmdReportHtml({ runId: res.runId });
    }

    const summary = summarizeRegressionRun(res.runId);
    process.stdout.write(
        `\n[aiqa:run-regression] DONE runId=${res.runId} exitCode=${res.exitCode} `
        + `finals=${summary.finals} clusters=${summary.clusters} criticals=${summary.criticals} duration=${Math.round(res.durationMs / 1000)}s\n`,
    );
    return res.exitCode;
}

function slug(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function cmdMcpList(flags: Flags): Promise<number> {
    if (flags.tools === true || flags.full === true) {
        const out: Record<string, unknown> = {};
        for (const s of SERVERS) out[s.id] = { description: s.description, runner: s.runner, tools: s.server.listTools() };
        process.stdout.write(JSON.stringify(out, null, 2) + "\n");
        return 0;
    }
    process.stdout.write("AI QA Agent — MCP servers:\n\n");
    for (const s of SERVERS) {
        const toolCount = s.server.listTools().length;
        process.stdout.write(`  ${s.id.padEnd(20)} ${toolCount} tools — ${s.description}\n`);
        process.stdout.write(`  ${" ".repeat(20)} runner: ${s.runner}\n\n`);
    }
    process.stdout.write("Run `aiqa mcp:list --tools` for the full tool catalogue, `aiqa mcp:config` for a .claude/mcp.json snippet.\n");
    return 0;
}

async function cmdMcpStart(flags: Flags): Promise<number> {
    const id = typeof flags.server === "string" ? flags.server : null;
    if (!id) { process.stderr.write("[aiqa:mcp:start] --server=<id> required.\n"); return 2; }
    const entry = findServer(id);
    if (!entry) { process.stderr.write(`[aiqa:mcp:start] unknown server: ${id}\n`); return 2; }
    await entry.server.start();
    return 0;
}

async function cmdDoctor(_flags: Flags): Promise<number> {
    const r = runDoctor();
    process.stdout.write(formatDoctorReport(r) + "\n");
    return r.overall === "fail" ? 1 : 0;
}

async function cmdInitProject(flags: Flags): Promise<number> {
    const env = typeof flags.env === "string" ? flags.env : "test";
    const actions = initProject({
        env,
        appUrl: typeof flags["app-url"] === "string" ? flags["app-url"] : undefined,
        authUrl: typeof flags["auth-url"] === "string" ? flags["auth-url"] : undefined,
        jiraProject: typeof flags["jira-project"] === "string" ? flags["jira-project"] : undefined,
        jiraUrl: typeof flags["jira-url"] === "string" ? flags["jira-url"] : undefined,
        force: flags.force === true,
    });
    process.stdout.write(`[aiqa:init-project] env=${env}\n${formatInitSummary(actions)}\n`);
    process.stdout.write(NEXT_STEPS_MESSAGE);
    return 0;
}

async function cmdMcpConfig(flags: Flags): Promise<number> {
    // Snippet for ~/.claude.json or .claude/mcp.json (Claude Code) and
    // Cursor's mcp_servers.json. Uses tsx to run the TS source directly.
    const cwd = process.cwd();
    const config: Record<string, unknown> = {
        mcpServers: Object.fromEntries(SERVERS.map(s => [`aiqa-${s.id}`, {
            command: "npx",
            args: ["tsx", s.runner],
            cwd,
            env: {
                // Memory writes opt-in (default: read-only)
                AIQA_ALLOW_MEMORY_WRITE: "false",
                // Test execution opt-in (default: disabled)
                AIQA_ALLOW_EXEC: "false",
            },
        }])),
    };
    const text = JSON.stringify(config, null, 2);
    if (typeof flags.out === "string") {
        fs.writeFileSync(flags.out, text);
        process.stdout.write(`[aiqa:mcp:config] wrote ${flags.out}\n`);
    } else {
        process.stdout.write(text + "\n");
        process.stdout.write("\nPaste the `mcpServers` block into ~/.claude.json (Claude Code), .cursor/mcp.json (Cursor), or your client's MCP config. Use --out=<path> to write a file directly.\n");
    }
    return 0;
}

async function main(): Promise<void> {
    const { command, flags } = parseArgs(process.argv);
    let code = 0;
    switch (command) {
        case "init":                 code = await cmdInit(); break;
        case "watch":                code = await cmdWatch(flags); break;
        case "collect":              code = await cmdCollect(flags); break;
        case "diagnose":             code = await cmdDiagnose(flags); break;
        case "notify-critical":      code = await cmdNotifyCritical(flags); break;
        case "finalize":             code = await cmdFinalize(flags); break;
        case "report:html":          code = await cmdReportHtml(flags); break;
        case "scan":                 code = await cmdScan(flags); break;
        case "guard":                code = await cmdGuard(flags); break;
        case "run-regression":       code = await cmdRunRegression(flags); break;
        case "generate-automation":  code = await cmdGenerateAutomation(flags); break;
        case "mcp:list":             code = await cmdMcpList(flags); break;
        case "mcp:start":            code = await cmdMcpStart(flags); break;
        case "mcp:config":           code = await cmdMcpConfig(flags); break;
        case "doctor":               code = await cmdDoctor(flags); break;
        case "init-project":         code = await cmdInitProject(flags); break;
        default:                     printHelp();
    }
    process.exit(code);
}

main().catch(err => {
    process.stderr.write(`[aiqa] fatal: ${(err as Error)?.stack ?? String(err)}\n`);
    process.exit(1);
});
