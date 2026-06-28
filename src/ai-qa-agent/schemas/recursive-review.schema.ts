/**
 * Recursive Review — schemaVersion `aiqa.recursive-review.v1`.
 *
 * Emitted by reviewer agents after each bounded round. The recursive runner
 * consults `shouldRefine` + `stopReason` to decide whether to enter another
 * round; it never blindly continues. `maxRounds` is enforced by the runner
 * regardless of what the agent returns.
 */

import type { RecursiveWorkflow } from "../config/recursive-policy";

export const RECURSIVE_REVIEW_SCHEMA_VERSION = "aiqa.recursive-review.v1" as const;

export type StopReason =
    | "max_rounds_reached"
    | "coverage_threshold_met"
    | "confidence_threshold_met"
    | "no_new_findings"
    | "token_budget_exhausted"
    | "human_approval_required"
    | "forbidden_behavior_detected"
    | null;

export interface RecursiveReview {
    schemaVersion: typeof RECURSIVE_REVIEW_SCHEMA_VERSION;
    workflow: RecursiveWorkflow;

    round: number;
    maxRounds: number;

    inputSummary: string;
    reviewFindings: Array<{ type: string; message: string }>;

    coverageScore: number;     // 0..1
    confidenceScore: number;   // 0..1

    shouldRefine: boolean;
    nextMinimalContextNeeded: string[];

    stopReason: StopReason;
}
