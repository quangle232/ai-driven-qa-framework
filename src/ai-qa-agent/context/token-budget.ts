/**
 * Runtime token budget tracker.
 *
 * Every LLM call must go through `budget.charge(usage)` after it returns.
 * Before making a call, callers ask `budget.canAfford(estimate)` — if the
 * cap would be exceeded, the recursive runner stops with
 * `stopReason: "token_budget_exhausted"`.
 *
 * This is deliberately framework-agnostic: it doesn't know about Claude or
 * OpenAI. Providers just translate their usage shape to `{input, output,
 * cacheRead, cacheWrite}` and the budget tallies them.
 *
 * The budget tracks BILLED tokens. Cache reads are charged at 0.1× to
 * reflect Anthropic's pricing — this incentivises agents to keep the
 * cached prefix stable across calls so subsequent rounds are nearly free.
 */

export interface TokenUsage {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
}

export interface TokenBudgetSnapshot {
    spent: number;
    cap: number;
    remaining: number;
    calls: number;
    /** Per-callsite ledger so the diagnosis report can show where tokens went. */
    ledger: Array<{ label: string; usage: TokenUsage; billed: number }>;
}

export class TokenBudget {
    private spent = 0;
    private calls = 0;
    private readonly ledger: TokenBudgetSnapshot["ledger"] = [];

    constructor(private readonly cap: number) {}

    /** Anthropic-style weighting: input 1×, output 1×, cache write 1.25×, cache read 0.1×. */
    private static billed(usage: TokenUsage): number {
        return usage.input + usage.output + Math.ceil(usage.cacheWrite * 1.25) + Math.ceil(usage.cacheRead * 0.1);
    }

    canAfford(estimateInput: number, estimateOutput: number): boolean {
        return this.spent + estimateInput + estimateOutput <= this.cap;
    }

    charge(label: string, usage: TokenUsage): number {
        const billed = TokenBudget.billed(usage);
        this.spent += billed;
        this.calls += 1;
        this.ledger.push({ label, usage, billed });
        return billed;
    }

    snapshot(): TokenBudgetSnapshot {
        return {
            spent: this.spent,
            cap: this.cap,
            remaining: Math.max(0, this.cap - this.spent),
            calls: this.calls,
            ledger: [...this.ledger],
        };
    }

    isExhausted(): boolean {
        return this.spent >= this.cap;
    }
}
