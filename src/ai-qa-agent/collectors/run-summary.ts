/**
 * Compute the pass/fail/flaky/skipped counts directly from a Playwright JSON
 * report. We use Playwright's own `stats` when present, but fall back to
 * walking the suites for older reporter versions.
 */

import type { PwReport } from "./playwright-report-reader";
import { iterAttempts } from "./playwright-report-reader";
import type { RunSummary } from "../reports/stakeholder-html-report";

export function buildRunSummary(report: PwReport, runId: string): RunSummary {
    const stats = report.stats ?? {};
    let passed = 0, failed = 0, flaky = 0, skipped = 0, total = 0;

    // Walk attempts: for each test, decide its final outcome.
    const lastByTest = new Map<string, { status: string; flaky: boolean }>();
    for (const a of iterAttempts(report)) {
        const key = `${a.file}::${a.spec.title}::${a.projectName}`;
        const status = (a.result.status ?? "").toLowerCase();
        const prev = lastByTest.get(key);
        const becameFlaky = prev && (prev.status === "failed" || prev.status === "timedout") && status === "passed";
        if (a.isFinalAttempt) {
            lastByTest.set(key, { status, flaky: becameFlaky ?? prev?.flaky ?? false });
        } else {
            lastByTest.set(key, { status, flaky: prev?.flaky ?? false });
        }
    }
    for (const v of lastByTest.values()) {
        total++;
        if (v.flaky) flaky++;
        else if (v.status === "passed" || v.status === "expected") passed++;
        else if (v.status === "skipped") skipped++;
        else failed++;
    }

    return {
        runId,
        passed,
        failed,
        flaky,
        skipped,
        total,
        durationMs: stats.duration ?? 0,
    };
}
