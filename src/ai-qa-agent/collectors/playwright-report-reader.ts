/**
 * Read the Playwright JSON reporter output and normalize specs into a flat
 * list of test attempts. Pure data — no LLM, no side effects.
 *
 * The input shape is Playwright 1.x's JSON reporter format:
 * `{ config, suites: Suite[], stats }` where Suite has `specs[]` and recursive
 * `suites[]`. Each spec has `tests[]`, each test has `results[]` (one per
 * attempt). This reader walks the tree and yields one record per attempt.
 */

import fs from "node:fs";
import path from "node:path";
import { PLAYWRIGHT_JSON_PATH } from "../utils/paths";

export interface PwError {
    message?: string;
    stack?: string;
    value?: string;
}

export interface PwAttachment {
    name: string;
    contentType?: string;
    path?: string;
    body?: string;
}

export interface PwResult {
    status?: string;
    duration?: number;
    retry?: number;
    error?: PwError;
    errors?: PwError[];
    attachments?: PwAttachment[];
    workerIndex?: number;
}

export interface PwTest {
    timeout?: number;
    expectedStatus?: string;
    projectId?: string;
    projectName?: string;
    project?: { name?: string };
    results?: PwResult[];
    status?: string;
    outcome?: string;
    flaky?: boolean;
    retries?: number;
    annotations?: Array<{ type: string; description?: string }>;
}

export interface PwSpec {
    title: string;
    ok?: boolean;
    tags?: string[];
    tests?: PwTest[];
    id?: string;
    file?: string;
    line?: number;
    titlePath?: string[];
}

export interface PwSuite {
    title: string;
    file?: string;
    specs?: PwSpec[];
    suites?: PwSuite[];
}

export interface PwReport {
    config?: { rootDir?: string; projects?: Array<{ name?: string; retries?: number }> };
    suites?: PwSuite[];
    stats?: { startTime?: string; duration?: number };
}

export interface NormalizedAttempt {
    suiteTitles: string[];
    spec: PwSpec;
    test: PwTest;
    result: PwResult;
    attempt: number;
    /** True when this attempt is the LAST attempt for this test. */
    isFinalAttempt: boolean;
    /** Effective max retries (per-test override beats project default). */
    maxRetries: number;
    file: string;
    projectName: string;
}

export function readPlaywrightReport(filePath = PLAYWRIGHT_JSON_PATH): PwReport | null {
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8")) as PwReport;
    } catch {
        return null;
    }
}

export function projectRetries(report: PwReport, projectName: string): number {
    const proj = report.config?.projects?.find(p => p?.name === projectName);
    return proj?.retries ?? 0;
}

export function* iterAttempts(report: PwReport): Generator<NormalizedAttempt> {
    const root = report.suites ?? [];
    for (const suite of root) {
        yield* walk(suite, [], report);
    }
}

function* walk(suite: PwSuite, ancestors: string[], report: PwReport): Generator<NormalizedAttempt> {
    const titles = [...ancestors, suite.title ?? ""];

    for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
            const results = test.results ?? [];
            const projectName = test.projectName ?? test.project?.name ?? "";
            const maxRetries = test.retries ?? projectRetries(report, projectName);
            // `results` is ordered by attempt for normal Playwright JSON.
            for (let idx = 0; idx < results.length; idx++) {
                const result = results[idx];
                const attemptIdx = result.retry ?? idx;
                const isFinalAttempt = idx === results.length - 1;
                const baseFile = spec.file ?? suite.file ?? "";
                const file = baseFile ? normalizeFile(baseFile, report) : "";
                yield {
                    suiteTitles: titles.filter(Boolean),
                    spec,
                    test,
                    result,
                    attempt: attemptIdx,
                    isFinalAttempt,
                    maxRetries,
                    file,
                    projectName,
                };
            }
            // Skipped specs sometimes record no `results[]`; surface a synthetic
            // attempt so the watcher can emit a skip event downstream.
            if (results.length === 0) {
                yield {
                    suiteTitles: titles.filter(Boolean),
                    spec,
                    test,
                    result: { status: test.status ?? "skipped" },
                    attempt: 0,
                    isFinalAttempt: true,
                    maxRetries,
                    file: spec.file ? normalizeFile(spec.file, report) : "",
                    projectName,
                };
            }
        }
    }

    for (const child of suite.suites ?? []) {
        yield* walk(child, titles, report);
    }
}

function normalizeFile(file: string, report: PwReport): string {
    if (path.isAbsolute(file)) {
        const root = report.config?.rootDir ? path.dirname(report.config.rootDir) : process.cwd();
        return path.relative(root, file);
    }
    // Playwright JSON often emits `<dir>/<file>` relative to testDir; prefix
    // with `tests/` only when the path is not already prefixed.
    return file.startsWith("tests/") ? file : `tests/${file}`;
}
