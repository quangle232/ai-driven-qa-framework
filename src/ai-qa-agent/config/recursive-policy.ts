/**
 * Recursive AI policy — bounded review/refinement loops.
 *
 * Allowed patterns:
 *   Generate -> Critique -> Refine -> Validate -> Stop
 *   Hypothesis -> Evidence -> Counter-evidence -> Decision -> Stop
 *   Plan -> Execute safe read-only step -> Review -> Next minimal context -> Stop
 *
 * Forbidden patterns are listed below and ENFORCED at runtime by the recursive
 * runner (src/ai-qa-agent/agents/recursive-runner.ts in Phase 4).
 */

export type RecursiveWorkflow =
    | "requirementAnalysis"
    | "testCaseGeneration"
    | "automationGeneration"
    | "failureDiagnosis"
    | "criticalClassification"
    | "bugReportDraft";

export const recursivePolicy = {
    enabled: true,
    defaultMaxRounds: 2,
    maxRoundsByWorkflow: {
        requirementAnalysis: 2,
        testCaseGeneration: 3,
        automationGeneration: 2,
        failureDiagnosis: 3,
        criticalClassification: 2,
        bugReportDraft: 2,
    } satisfies Record<RecursiveWorkflow, number>,
    stopConditions: {
        minCoverageScore: 0.85,
        minConfidenceScore: 0.75,
        noNewFindings: true,
        maxTokenBudgetReached: true,
        humanApprovalRequired: true,
    },
    forbiddenRecursiveBehaviors: [
        "rerun_until_pass",
        "self_heal_until_pass",
        "auto_skip_test",
        "auto_weaken_assertion",
        "auto_mark_pass",
        "auto_apply_patch_without_approval",
        "infinite_tool_loop",
    ] as const,
} as const;

export function maxRoundsFor(workflow: RecursiveWorkflow): number {
    return recursivePolicy.maxRoundsByWorkflow[workflow] ?? recursivePolicy.defaultMaxRounds;
}
