/**
 * Bug Report Draft — schemaVersion `aiqa.bug-report.v1`.
 *
 * Drafted by the Bug Reporter Agent (Phase 8). The framework NEVER creates a
 * Jira ticket from this directly — that is the job of `helper/jira-bug-reporter.ts`
 * (which already runs on final test failures via the auto-fixture). This draft
 * is human-reviewed Markdown / JSON output stored under `test-output/ai/bug-drafts/`.
 */

import type { Severity } from "../config/severity-policy";

export const BUG_REPORT_SCHEMA_VERSION = "aiqa.bug-report.v1" as const;

export interface BugReportDraft {
    schemaVersion: typeof BUG_REPORT_SCHEMA_VERSION;

    title: string;
    environment: string;
    build: string;
    branch: string;
    commit: string;

    preconditions: string[];
    stepsToReproduce: string[];
    actualResult: string;
    expectedResult: string;

    evidence: Array<{ kind: "screenshot" | "trace" | "video" | "log" | "url"; path: string }>;

    suggestedSeverity: Severity;
    suggestedPriority: "P0" | "P1" | "P2" | "P3";
    impact: string;
    notes: string;

    /** Parent user story this draft should be linked to once approved. */
    parentStoryKey: string | null;
    /** Did a reviewer agent pass this draft? */
    reviewed: boolean;
}
