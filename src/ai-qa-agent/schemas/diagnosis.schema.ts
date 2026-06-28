/**
 * Diagnosis — schemaVersion `aiqa.diagnosis.v1`.
 *
 * Produced by the Failure Diagnosis Agent (or, in Phase 1, by a deterministic
 * rule-based classifier). Carries the verdict + allowed/forbidden actions so
 * downstream consumers cannot accidentally cross a guardrail.
 */

import type { Severity } from "../config/severity-policy";

export const DIAGNOSIS_SCHEMA_VERSION = "aiqa.diagnosis.v1" as const;

export type DiagnosisClassification =
    | "api"
    | "locator"
    | "timeout"
    | "assertion"
    | "auth"
    | "test_data"
    | "environment"
    | "app_bug"
    | "test_bug"
    | "flaky"
    | "unknown";

export type DiagnosisAllowedAction = "report" | "notify" | "suggest_fix" | "draft_bug";
export type DiagnosisForbiddenAction = "mark_pass" | "skip_test" | "auto_apply_patch" | "weaken_assertion";

export interface Diagnosis {
    schemaVersion: typeof DIAGNOSIS_SCHEMA_VERSION;

    runId: string;
    testId: string;

    classification: DiagnosisClassification;
    severity: Severity;

    rootCause: string;
    evidence: string[];
    counterEvidence: string[];

    /** 0..1 inclusive. */
    confidence: number;

    recommendedAction: string;
    needsHumanReview: boolean;

    allowedActions: DiagnosisAllowedAction[];
    forbiddenActions: DiagnosisForbiddenAction[];

    /** Provider that produced this verdict — `deterministic` when no LLM ran. */
    producedBy: "deterministic" | "claude" | "openai" | "noop";
}

export function newDiagnosis(partial: Partial<Diagnosis> & Pick<Diagnosis, "runId" | "testId">): Diagnosis {
    return {
        schemaVersion: DIAGNOSIS_SCHEMA_VERSION,
        classification: "unknown",
        severity: "medium",
        rootCause: "",
        evidence: [],
        counterEvidence: [],
        confidence: 0,
        recommendedAction: "",
        needsHumanReview: true,
        allowedActions: ["report"],
        forbiddenActions: ["mark_pass", "skip_test", "auto_apply_patch", "weaken_assertion"],
        producedBy: "deterministic",
        ...partial,
    };
}
