/**
 * AI provider engine selection.
 *
 * The framework name is `AI QA Agent`. Claude / OpenAI / local are engines.
 * Default engine is `claude`, but if `ANTHROPIC_API_KEY` is not set the
 * provider falls back to `noop` — the framework makes ZERO network calls and
 * every agent returns a deterministic placeholder result. This guarantees a
 * fresh checkout runs identically to today without any keys configured.
 */

export type AiProviderName = "claude" | "openai" | "noop";

export interface AiProviderConfig {
    name: AiProviderName;
    model: string;
    /** When true, no SDK call will be made; agents return inert results. */
    dryRun: boolean;
    /** Why this provider/dryRun was selected. Surfaced in logs / diagnosis.md. */
    reason: string;
}

const DEFAULT_CLAUDE_MODEL = "claude-opus-4-7";
const DEFAULT_OPENAI_MODEL = "gpt-4.1";

export function resolveProvider(env: NodeJS.ProcessEnv = process.env): AiProviderConfig {
    const requested = (env.AI_PROVIDER ?? "claude").trim().toLowerCase() as AiProviderName;

    if (requested === "noop") {
        return { name: "noop", model: "noop", dryRun: true, reason: "AI_PROVIDER=noop" };
    }

    if (requested === "openai") {
        const key = env.OPENAI_API_KEY?.trim();
        if (!key) {
            return {
                name: "noop", model: "noop", dryRun: true,
                reason: "AI_PROVIDER=openai but OPENAI_API_KEY is not set — falling back to noop.",
            };
        }
        return {
            name: "openai",
            model: env.AIQA_OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
            dryRun: false,
            reason: "AI_PROVIDER=openai with key present.",
        };
    }

    // Default branch — claude.
    const key = env.ANTHROPIC_API_KEY?.trim();
    if (!key) {
        return {
            name: "noop", model: "noop", dryRun: true,
            reason: "AI_PROVIDER=claude (default) but ANTHROPIC_API_KEY is not set — falling back to noop.",
        };
    }
    return {
        name: "claude",
        model: env.AIQA_CLAUDE_MODEL?.trim() || DEFAULT_CLAUDE_MODEL,
        dryRun: false,
        reason: "AI_PROVIDER=claude with key present.",
    };
}
