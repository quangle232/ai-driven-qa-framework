/**
 * Provider factory. Reads `config/ai-provider.config.ts` and returns the
 * right `Provider` instance. Falls back to the noop provider when the
 * Anthropic SDK isn't installed, so commands never hard-crash on a fresh
 * checkout without keys.
 */

import { resolveProvider } from "../config/ai-provider.config";
import { ClaudeProvider } from "./claude-provider";
import { NoopProvider } from "./noop-provider";
import type { Provider } from "./types";

const FAST_MODEL_DEFAULT = "claude-haiku-4-5-20251001";
const SMART_MODEL_DEFAULT = "claude-opus-4-7";

export function makeProvider(env: NodeJS.ProcessEnv = process.env): Provider {
    const cfg = resolveProvider(env);
    if (cfg.name === "claude") {
        return new ClaudeProvider({
            apiKey: env.ANTHROPIC_API_KEY!,
            smartModel: env.AIQA_CLAUDE_SMART_MODEL?.trim() || cfg.model || SMART_MODEL_DEFAULT,
            fastModel: env.AIQA_CLAUDE_FAST_MODEL?.trim() || FAST_MODEL_DEFAULT,
        });
    }
    // OpenAI tier deferred to a later phase; noop covers it for now.
    return new NoopProvider();
}

export type { Provider, CallOptions, CallResult, PromptBlock } from "./types";
