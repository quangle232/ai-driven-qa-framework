/**
 * Token budget policy — start small, escalate only on missing evidence.
 *
 * Source: policies/token-budget-policy.md.
 */

export type ContextLevel = "L0" | "L1" | "L2" | "L3" | "L4" | "L5";

export const CONTEXT_LEVELS: Record<ContextLevel, { description: string; maxTokens: number }> = {
    L0: { description: "run summary only",                                       maxTokens: 1_500 },
    L1: { description: "failed test metadata + error message",                   maxTokens: 3_000 },
    L2: { description: "failed step + stacktrace top + artifact refs",           maxTokens: 6_000 },
    L3: { description: "screenshot/DOM summary + network/console summary",       maxTokens: 12_000 },
    L4: { description: "related test/POM code snippets + git diff",              maxTokens: 24_000 },
    L5: { description: "full trace deep dive, only when necessary",              maxTokens: 60_000 },
};

export const tokenBudgetPolicy = {
    /** Most workflows start here. */
    defaultStartingLevel: "L0" as ContextLevel,
    /** Cap for a single recursive review session. */
    maxTotalTokensPerSession: 120_000,
    /** A reviewer must justify escalation each time it raises the level. */
    escalationRequiresJustification: true,
    /** Hard rules from policies/token-budget-policy.md. */
    forbidden: [
        "read_full_repo",
        "read_full_log_if_summarized_log_exists",
    ] as const,
    /** Cache reusable summaries by hash to avoid re-paying tokens. */
    cacheSummaries: true,
} as const;

export function nextLevel(level: ContextLevel): ContextLevel | null {
    const order: ContextLevel[] = ["L0", "L1", "L2", "L3", "L4", "L5"];
    const i = order.indexOf(level);
    return i >= 0 && i < order.length - 1 ? order[i + 1] : null;
}
