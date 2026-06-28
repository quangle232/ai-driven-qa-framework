/**
 * Build `FailureEvent` records (one per non-passing attempt) from the
 * normalized Playwright + Allure data.
 *
 * Deterministic. No LLM calls. The watcher writes these events to
 * `test-output/ai/events/*.json` and the CLI writes a single
 * `test-output/ai/failures.json` snapshot per run.
 */

import path from "node:path";

import {
    FAILURE_EVENT_SCHEMA_VERSION,
    buildTestId,
    type FailureEvent,
    type TestStatus,
} from "../schemas/failure-event.schema";
import { indexArtifacts } from "./artifact-indexer";
import { findAllureForTitle, readAllureIndex } from "./allure-result-reader";
import { iterAttempts, type NormalizedAttempt, type PwReport } from "./playwright-report-reader";
import { REPO_ROOT } from "../utils/paths";

function normalizeStatus(raw: string | undefined): TestStatus {
    const s = (raw ?? "").toLowerCase();
    if (s === "passed" || s === "expected") return "passed";
    if (s === "failed") return "failed";
    if (s === "timedout") return "timedOut";
    if (s === "interrupted") return "interrupted";
    if (s === "skipped") return "skipped";
    return "failed";
}

function extractJiraStory(test: NormalizedAttempt["test"]): string | null {
    const ann = test.annotations?.find(a => (a.type ?? "").toLowerCase() === "jira-story");
    return ann?.description?.trim() || null;
}

function extractError(attempt: NormalizedAttempt) {
    const result = attempt.result;
    const errSrc = result.error ?? result.errors?.[0];
    const message = (errSrc?.message ?? errSrc?.value ?? "").split("\n")[0] || "";
    const stackTop = (errSrc?.stack ?? "")
        .split("\n")
        .map(l => l.trim())
        .filter(l => l.startsWith("at "))
        .slice(0, 6);
    return {
        message,
        stackTop,
        snippet: null,
    };
}

export interface BuildOptions {
    runId: string;
    /** When true, only emit events for non-passing attempts. */
    failuresOnly?: boolean;
}

export function buildFailureEvents(report: PwReport, opts: BuildOptions): FailureEvent[] {
    const allure = readAllureIndex();
    const out: FailureEvent[] = [];

    for (const attempt of iterAttempts(report)) {
        const status = normalizeStatus(attempt.result.status);
        if (opts.failuresOnly !== false && status === "passed") continue;
        if (status === "skipped" && opts.failuresOnly !== false) continue;

        const tagList = attempt.spec.tags ?? [];
        // Playwright's top suite title is usually the spec file path; dropping
        // it here keeps testIds compact (no `tests-foo-spec-foo-spec-ts-...`
        // duplicate prefix) without losing uniqueness because the file path
        // is the leading segment.
        const file = attempt.file || attempt.spec.file || "unknown";
        const fileBase = file.replace(/\.[tj]sx?$/, "");
        const cleanedSuites = attempt.suiteTitles.filter(t => t && !fileBase.endsWith(t.replace(/\.[tj]sx?$/, "")));
        const titlePath = [...cleanedSuites, attempt.spec.title];
        const testId = buildTestId(file, titlePath);

        const artifacts = indexArtifacts(attempt.result.attachments);
        const allureMatch = findAllureForTitle(allure, attempt.spec.title);
        if (allureMatch) {
            artifacts.allureResult = path.isAbsolute(allureMatch.file)
                ? path.relative(REPO_ROOT, allureMatch.file)
                : allureMatch.file;
        }

        const error = extractError(attempt);
        const isFinalFailure = attempt.isFinalAttempt && status !== "passed" && status !== "skipped";

        const event: FailureEvent = {
            schemaVersion: FAILURE_EVENT_SCHEMA_VERSION,
            eventType: status === "passed" ? "test_recovered_on_retry" : "test_failed_detected",
            runId: opts.runId,
            testId,
            title: attempt.spec.title,
            file: attempt.file || attempt.spec.file || "",
            project: attempt.projectName,
            status,
            retryAttempt: attempt.attempt,
            maxRetries: attempt.maxRetries,
            isFinalFailure,
            durationMs: attempt.result.duration ?? 0,
            tags: tagList.map(t => t.startsWith("@") ? t : `@${t}`),
            jiraStoryKey: extractJiraStory(attempt.test),
            error,
            artifactsReady: {
                screenshot: !!artifacts.screenshot,
                trace: !!artifacts.trace,
                video: !!artifacts.video,
                allureResult: !!artifacts.allureResult,
            },
            artifacts,
            nextAction: isFinalFailure
                ? "ready_for_diagnosis"
                : (status === "skipped" ? "skip" : "wait_for_retry_or_artifacts"),
        };
        out.push(event);
    }

    return out;
}
