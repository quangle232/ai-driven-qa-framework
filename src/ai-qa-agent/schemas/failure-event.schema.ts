/**
 * Failure Event — schemaVersion `aiqa.failure-event.v1`.
 *
 * Emitted by the deterministic watcher when a Playwright spec reports a
 * non-passing status. One event per test attempt. Critical: this schema is
 * the boundary between the deterministic side (scanner/collectors) and the
 * LLM side (agents). The LLM never sees raw Playwright JSON — it only sees
 * normalized events of this shape.
 */

export const FAILURE_EVENT_SCHEMA_VERSION = "aiqa.failure-event.v1" as const;

export type FailureEventType = "test_failed_detected" | "test_recovered_on_retry";

export type TestStatus = "failed" | "timedOut" | "interrupted" | "skipped" | "passed";

export interface FailureEvent {
    schemaVersion: typeof FAILURE_EVENT_SCHEMA_VERSION;
    eventType: FailureEventType;

    /** Stable run id (CI build id, or local timestamp run id). */
    runId: string;
    /** Deterministic id derived from file + title path, kebab-cased. */
    testId: string;

    title: string;
    file: string;
    project: string;

    status: TestStatus;
    /** Zero-based; `retryAttempt === project.retries` means final attempt. */
    retryAttempt: number;
    /** Effective max retries for this test (project-level OR per-test override). */
    maxRetries: number;
    /** True once this is the final attempt and the result is non-passing. */
    isFinalFailure: boolean;

    durationMs: number;
    tags: string[];
    jiraStoryKey: string | null;

    error: {
        message: string;
        stackTop: string[];
        snippet: string | null;
    };

    artifactsReady: {
        screenshot: boolean;
        trace: boolean;
        video: boolean;
        allureResult: boolean;
    };

    artifacts: {
        screenshot: string | null;
        trace: string | null;
        video: string | null;
        allureResult: string | null;
    };

    nextAction: "wait_for_retry_or_artifacts" | "ready_for_diagnosis" | "skip";
}

/** Build a deterministic kebab-case test id from a Playwright spec record. */
export function buildTestId(file: string, titlePath: string[]): string {
    const parts = [file.replace(/^[./\\]+/, "").replace(/\.[tj]sx?$/, ""), ...titlePath];
    return parts
        .join("-")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

export function isFailureEvent(value: unknown): value is FailureEvent {
    if (!value || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;
    return v.schemaVersion === FAILURE_EVENT_SCHEMA_VERSION
        && typeof v.runId === "string"
        && typeof v.testId === "string"
        && typeof v.title === "string"
        && typeof v.file === "string";
}
