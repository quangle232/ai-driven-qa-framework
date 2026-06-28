/**
 * Claude provider — wraps `@anthropic-ai/sdk` with the bits the framework
 * actually needs:
 *   - cache_control breakpoints (the `cacheBreakpoint` flag on PromptBlock)
 *   - tier routing (`fast` → Haiku 4.5, `smart` → Opus 4.7)
 *   - JSON output enforcement (strip ```json fences + parse)
 *   - normalized TokenUsage including cache read/write splits
 *
 * The SDK is imported lazily via an indirected specifier so the framework
 * still typechecks before `yarn add @anthropic-ai/sdk` has run. When the
 * SDK is absent the provider throws a friendly error at call-time; the
 * provider factory in `providers/index.ts` catches it and falls back to
 * the noop provider so commands still finish.
 */

import type { CallOptions, CallResult, PromptBlock, Provider } from "./types";

interface AnthropicLike {
    messages: {
        create(req: AnthropicRequest): Promise<AnthropicResponse>;
    };
}

interface AnthropicRequest {
    model: string;
    max_tokens: number;
    system: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> | string;
    messages: Array<{
        role: "user" | "assistant";
        content: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }>;
    }>;
    stop_sequences?: string[];
}

interface AnthropicResponse {
    content: Array<{ type: string; text?: string }>;
    usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
    };
}

interface ClaudeProviderOptions {
    apiKey: string;
    /** Used for "smart" tier — code generation, complex review. */
    smartModel: string;
    /** Used for "fast" tier — classification, short critiques. */
    fastModel: string;
}

export class ClaudeProvider implements Provider {
    readonly name = "claude" as const;
    private client: AnthropicLike | null = null;

    constructor(private readonly opts: ClaudeProviderOptions) {}

    private async getClient(): Promise<AnthropicLike> {
        if (this.client) return this.client;
        try {
            const moduleId = "@anthropic-ai/sdk";
            const mod = await import(moduleId) as unknown as { default: new (config: { apiKey: string }) => AnthropicLike };
            // SDK ships both `default` and named export depending on the runtime;
            // both expose the same constructor shape.
            const Ctor = (mod as unknown as { default?: typeof mod.default; Anthropic?: typeof mod.default }).default
                ?? (mod as unknown as { Anthropic: typeof mod.default }).Anthropic;
            this.client = new Ctor({ apiKey: this.opts.apiKey });
            return this.client;
        } catch (err) {
            const msg = (err as Error)?.message ?? String(err);
            throw new Error(
                `[aiqa] @anthropic-ai/sdk not installed (${msg}). Run \`yarn add -D @anthropic-ai/sdk\` to enable Claude.`,
            );
        }
    }

    async call(blocks: PromptBlock[], opts: CallOptions): Promise<CallResult> {
        const client = await this.getClient();

        // Split into system + conversation. Anthropic's API takes `system` as a
        // separate field (string OR array with cache_control), so we collect
        // all system blocks first and let cache breakpoints land on them.
        const systemBlocks = blocks.filter(b => b.role === "system");
        const convoBlocks = blocks.filter(b => b.role !== "system");

        const system = systemBlocks.length === 0
            ? ""
            : systemBlocks.map(b => ({
                type: "text" as const,
                text: b.text,
                ...(b.cacheBreakpoint ? { cache_control: { type: "ephemeral" as const } } : {}),
            }));

        const messages = convoBlocks.map(b => ({
            role: b.role === "assistant" ? "assistant" as const : "user" as const,
            content: [{
                type: "text" as const,
                text: opts.json ? appendJsonReminder(b.text) : b.text,
                ...(b.cacheBreakpoint ? { cache_control: { type: "ephemeral" as const } } : {}),
            }],
        }));

        const model = opts.tier === "smart" ? this.opts.smartModel : this.opts.fastModel;

        const resp = await client.messages.create({
            model,
            max_tokens: opts.maxOutputTokens ?? 2048,
            system,
            messages,
            stop_sequences: opts.stop,
        });

        const text = resp.content.map(c => c.text ?? "").join("");
        const json = opts.json ? safeParseJson(text) : null;

        return {
            text,
            json,
            usage: {
                input: resp.usage?.input_tokens ?? 0,
                output: resp.usage?.output_tokens ?? 0,
                cacheRead: resp.usage?.cache_read_input_tokens ?? 0,
                cacheWrite: resp.usage?.cache_creation_input_tokens ?? 0,
            },
            producedBy: "claude",
            model,
        };
    }
}

function appendJsonReminder(text: string): string {
    return text + "\n\nReturn ONLY a JSON object — no prose, no markdown fences, no commentary.";
}

function safeParseJson(text: string): unknown {
    // Strip ```json fences if the model added them despite instructions.
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    // Find the first { and last } to defang accidental leading prose.
    const first = stripped.indexOf("{");
    const last = stripped.lastIndexOf("}");
    if (first < 0 || last < 0 || last <= first) return null;
    try {
        return JSON.parse(stripped.slice(first, last + 1));
    } catch {
        return null;
    }
}
