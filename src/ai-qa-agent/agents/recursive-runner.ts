/**
 * Bounded recursive runner.
 *
 * Implements the two allowed patterns from `policies/recursive-policy.md`:
 *   - generate → critique → refine → validate → stop
 *   - hypothesis → evidence → counter-evidence → decision → stop
 *
 * Hard caps are enforced HERE, not inside agents — agents can't accidentally
 * extend a loop by returning `shouldRefine: true` forever. The runner stops
 * when ANY of these is true:
 *   - reached maxRounds for the workflow
 *   - token budget exhausted
 *   - coverageScore ≥ minCoverageScore (when applicable)
 *   - confidenceScore ≥ minConfidenceScore (when applicable)
 *   - reviewer returned `shouldRefine: false`
 *   - reviewer returned a non-null `stopReason`
 *   - any forbidden behavior detected in the review findings
 *
 * The output is the final generation plus the recursive-review trail for
 * audit logging in `test-output/ai/decisions/`.
 */

import { maxRoundsFor, recursivePolicy, type RecursiveWorkflow } from "../config/recursive-policy";
import type { TokenBudget } from "../context/token-budget";
import type { RecursiveReview, StopReason } from "../schemas/recursive-review.schema";
import { RECURSIVE_REVIEW_SCHEMA_VERSION } from "../schemas/recursive-review.schema";

export interface RunnerInput<TGen> {
    workflow: RecursiveWorkflow;
    budget: TokenBudget;
    /** Round 1 generator. */
    generate: () => Promise<{ output: TGen; tokens: number }>;
    /** Reviewer for round N. Receives the round-N output and the running trail. */
    review: (output: TGen, round: number) => Promise<{ review: RecursiveReview; tokens: number }>;
    /** Refiner for round N+1 (skipped when reviewer says stop). */
    refine: (lastOutput: TGen, review: RecursiveReview) => Promise<{ output: TGen; tokens: number }>;
    /** Optional ceiling override. Honoured only if ≤ workflow's policy max. */
    maxRoundsOverride?: number;
}

export interface RunnerResult<TGen> {
    output: TGen;
    rounds: number;
    stopReason: StopReason;
    reviews: RecursiveReview[];
    /** Final budget snapshot at completion. */
    budget: ReturnType<TokenBudget["snapshot"]>;
}

const FORBIDDEN = new Set(recursivePolicy.forbiddenRecursiveBehaviors);

export async function runRecursive<TGen>(input: RunnerInput<TGen>): Promise<RunnerResult<TGen>> {
    const policyMax = maxRoundsFor(input.workflow);
    const maxRounds = Math.min(policyMax, input.maxRoundsOverride ?? policyMax);

    const reviews: RecursiveReview[] = [];
    let { output } = await input.generate();
    let stopReason: StopReason = null;
    let round = 1;

    while (round <= maxRounds) {
        if (input.budget.isExhausted()) {
            stopReason = "token_budget_exhausted";
            break;
        }

        const { review } = await input.review(output, round);
        reviews.push(review);

        const forbidden = review.reviewFindings.find(f => FORBIDDEN.has(f.type as typeof recursivePolicy.forbiddenRecursiveBehaviors[number]));
        if (forbidden) {
            stopReason = "forbidden_behavior_detected";
            break;
        }
        if (review.stopReason) {
            stopReason = review.stopReason;
            break;
        }
        const stopByCoverage = typeof review.coverageScore === "number"
            && review.coverageScore >= recursivePolicy.stopConditions.minCoverageScore;
        const stopByConfidence = typeof review.confidenceScore === "number"
            && review.confidenceScore >= recursivePolicy.stopConditions.minConfidenceScore;
        if (stopByCoverage || stopByConfidence) {
            stopReason = stopByCoverage ? "coverage_threshold_met" : "confidence_threshold_met";
            break;
        }
        if (!review.shouldRefine) {
            stopReason = "no_new_findings";
            break;
        }
        if (round === maxRounds) {
            stopReason = "max_rounds_reached";
            break;
        }

        const refined = await input.refine(output, review);
        output = refined.output;
        round += 1;
    }

    return {
        output,
        rounds: round,
        stopReason: stopReason ?? "max_rounds_reached",
        reviews,
        budget: input.budget.snapshot(),
    };
}

/** Build an inert review the noop provider returns when no LLM is available. */
export function noopReview(workflow: RecursiveWorkflow, round: number, maxRounds: number): RecursiveReview {
    return {
        schemaVersion: RECURSIVE_REVIEW_SCHEMA_VERSION,
        workflow,
        round,
        maxRounds,
        inputSummary: "noop provider — no LLM available",
        reviewFindings: [],
        coverageScore: 0,
        confidenceScore: 0,
        shouldRefine: false,
        nextMinimalContextNeeded: [],
        stopReason: "no_new_findings",
    };
}
