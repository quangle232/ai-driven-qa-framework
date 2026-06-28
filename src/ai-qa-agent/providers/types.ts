/**
 * Provider-neutral types. The recursive runner + every agent depends only on
 * this surface, never directly on the Anthropic / OpenAI SDKs. That keeps
 * swap-in / swap-out behind a single line in `providers/index.ts`.
 */

import type { TokenUsage } from "../context/token-budget";

/** A message block. The `cached` flag asks the provider to insert a
 *  `cache_control: { type: "ephemeral" }` breakpoint right after this block.
 *  Providers that don't support caching ignore the flag. */
export interface PromptBlock {
    role: "system" | "user" | "assistant";
    text: string;
    /** Hint to the provider to mark this block as a cache write breakpoint. */
    cacheBreakpoint?: boolean;
}

export interface CallOptions {
    /** "fast" → Haiku 4.5; "smart" → Opus 4.7 (provider maps as it sees fit). */
    tier?: "fast" | "smart";
    /** Hard cap on output tokens for this call. */
    maxOutputTokens?: number;
    /** Force JSON output (provider validates / strips fences). */
    json?: boolean;
    /** Label written to the token-budget ledger for attribution. */
    label: string;
    /** Optional stop sequences. */
    stop?: string[];
}

export interface CallResult {
    text: string;
    /** Parsed JSON when `json: true` was requested; null on parse failure. */
    json: unknown;
    usage: TokenUsage;
    /** Provider that actually answered (so noop calls are visible in logs). */
    producedBy: "claude" | "openai" | "noop";
    /** Model id used. */
    model: string;
}

export interface Provider {
    readonly name: "claude" | "openai" | "noop";
    call(blocks: PromptBlock[], opts: CallOptions): Promise<CallResult>;
}
