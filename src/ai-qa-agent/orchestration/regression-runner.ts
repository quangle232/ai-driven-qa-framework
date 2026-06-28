/**
 * `aiqa run-regression` — one command, full cycle.
 *
 * Spawns three concurrent processes:
 *   1. Playwright regression: `npx cross-env test_env=<env> playwright test --grep <tag> -c config/playwright.config.ts`
 *   2. Deterministic watcher (already in watchers/file-watcher.ts) — writes
 *      FailureEvent JSON to `test-output/ai/events/` as Playwright streams
 *      the JSON reporter.
 *   3. **Failure-scanner sub-agent** (this module) — polls the events dir
 *      every `pollMs`, runs failure-grouper + critical-pattern-detector on
 *      the in-flight events, prints critical clusters AS THEY APPEAR.
 *
 * When Playwright exits, the runner triggers the post-run pipeline:
 *   collect → diagnose → finalize → report:html
 * and emits the run's final exit code (Playwright's own status).
 *
 * Token discipline: the sub-agent is FULLY deterministic. LLM calls happen
 * only inside `diagnose`, and only on clusters that survived clustering —
 * i.e. one call per unique root cause. With `AI_PROVIDER=noop` (or no
 * key) the whole run uses zero LLM tokens.
 */

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { aiqaOutDir, aiqaSubdir, ensureDir, relativeToRepo, PLAYWRIGHT_JSON_PATH } from "../utils/paths";
import { resolveRunId } from "../utils/run-id";
import { readPlaywrightReport } from "../collectors/playwright-report-reader";
import { buildFailureEvents } from "../collectors/failure-summary-builder";
import { detectCriticalEvents, type CriticalEvent } from "../watchers/critical-pattern-detector";
import { groupFailures } from "../analyzers/failure-grouper";

export interface RegressionRunOptions {
    /** Override env (default reads test_env or "sandbox"). */
    env?: string;
    /** Override grep pattern (default "@regression"). */
    grep?: string;
    /** Pass-through to playwright `--workers`. */
    workers?: number;
    /** Pass-through to playwright `--retries`. */
    retries?: number;
    /** Poll interval for the sub-agent (ms). */
    pollMs?: number;
    /** If true, refresh storageState before the run (sets `refresh=yes`). */
    refreshStorage?: boolean;
    /** Function used to spawn Playwright. Override in tests. */
    spawnFn?: typeof spawn;
}

export interface RegressionRunResult {
    exitCode: number;
    runId: string;
    durationMs: number;
    criticalAlerts: CriticalEvent[];
    eventsWritten: number;
}

export async function runRegression(opts: RegressionRunOptions = {}): Promise<RegressionRunResult> {
    const env = opts.env ?? process.env.test_env ?? "sandbox";
    const grep = opts.grep ?? "@regression";
    const pollMs = opts.pollMs ?? 2000;
    const runId = resolveRunId();
    const started = Date.now();
    const spawnFn = opts.spawnFn ?? spawn;

    ensureDir(aiqaOutDir());
    aiqaSubdir("events");

    const args = [
        "cross-env",
        `test_env=${env}`,
        opts.refreshStorage ? "refresh=yes" : "refresh=no",
        "playwright", "test",
        "--grep", grep,
        "-c", "config/playwright.config.ts",
    ];
    if (opts.workers) args.push(`--workers=${opts.workers}`);
    if (typeof opts.retries === "number") args.push(`--retries=${opts.retries}`);

    process.stdout.write(`[aiqa:run-regression] runId=${runId} env=${env} grep="${grep}"\n`);
    process.stdout.write(`[aiqa:run-regression] cmd: npx ${args.join(" ")}\n`);

    const pw: ChildProcess = spawnFn("npx", args, { stdio: "inherit", env: { ...process.env, CI: process.env.CI ?? "true" } });

    // ── Sub-agent: scan failures live ───────────────────────────────────
    const reported = new Set<string>();
    const alerts: CriticalEvent[] = [];
    const subAgent = setInterval(() => {
        try {
            const report = readPlaywrightReport(PLAYWRIGHT_JSON_PATH);
            if (!report) return;
            const events = buildFailureEvents(report, { runId, failuresOnly: true });
            const criticals = detectCriticalEvents(events);
            for (const c of criticals) {
                if (reported.has(c.fingerprint)) continue;
                reported.add(c.fingerprint);
                alerts.push(c);
                process.stdout.write(
                    `\n[aiqa:scanner] 🚨 CRITICAL — ${c.trigger}: ${c.summary}\n`
                    + `  affected=${c.affectedTestIds.length} fingerprint=${c.fingerprint.slice(0, 60)}…\n\n`,
                );
            }
        } catch {
            // Mid-write Playwright JSON parse errors are expected — try again next tick.
        }
    }, pollMs);

    // Wait for Playwright to exit (don't reject on non-zero — that's a normal
    // failed run that still needs the post-run pipeline).
    const exitCode = await new Promise<number>(resolve => {
        pw.on("exit", code => resolve(code ?? 1));
        pw.on("error", err => {
            process.stderr.write(`[aiqa:run-regression] spawn error: ${(err as Error).message}\n`);
            resolve(1);
        });
    });
    clearInterval(subAgent);

    // Count events file the watcher wrote (informational only).
    let eventsWritten = 0;
    const evDir = path.join(aiqaOutDir(), "events");
    if (fs.existsSync(evDir)) {
        eventsWritten = fs.readdirSync(evDir).filter(f => f.endsWith(".json")).length;
    }

    process.stdout.write(`\n[aiqa:run-regression] Playwright exited with code ${exitCode}.\n`);
    if (alerts.length > 0) {
        process.stdout.write(`[aiqa:run-regression] ${alerts.length} critical cluster(s) seen during the run:\n`);
        for (const a of alerts) process.stdout.write(`  - ${a.trigger}: ${a.summary}\n`);
    }

    return {
        exitCode,
        runId,
        durationMs: Date.now() - started,
        criticalAlerts: alerts,
        eventsWritten,
    };
}

/** Final view of what the regression produced — used by the CLI summary block. */
export function summarizeRegressionRun(runId: string): {
    finals: number;
    clusters: number;
    criticals: number;
} {
    const report = readPlaywrightReport();
    if (!report) return { finals: 0, clusters: 0, criticals: 0 };
    const events = buildFailureEvents(report, { runId, failuresOnly: true });
    return {
        finals: events.filter(e => e.isFinalFailure).length,
        clusters: groupFailures(events).length,
        criticals: detectCriticalEvents(events).length,
    };
}
