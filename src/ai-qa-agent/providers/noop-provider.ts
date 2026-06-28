/**
 * Noop provider — returns deterministic placeholder results.
 *
 * Used when no API key is configured. Lets the entire framework (including
 * the recursive runner + every agent) execute end-to-end without making a
 * single network call. Every agent treats the placeholder JSON as "I don't
 * know" — confidence 0, classification `unknown`, no recommended action.
 */

import type { CallOptions, CallResult, PromptBlock, Provider } from "./types";

export class NoopProvider implements Provider {
    readonly name = "noop" as const;

    async call(_blocks: PromptBlock[], opts: CallOptions): Promise<CallResult> {
        const json = opts.json ? {
            note: "noop provider — no LLM available; set ANTHROPIC_API_KEY to enable Claude.",
            confidence: 0,
            classification: "unknown",
            recommendedAction: "Open the trace.zip manually. No LLM run.",
            shouldRefine: false,
            stopReason: "no_provider",
        } : null;
        const text = JSON.stringify(json ?? { note: "noop" }, null, 2);
        return {
            text,
            json,
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            producedBy: "noop",
            model: "noop",
        };
    }
}
