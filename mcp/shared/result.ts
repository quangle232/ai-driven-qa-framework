/**
 * Common MCP tool result shape. Truncates oversize payloads to honour
 * `mcpPolicy.maxToolResponseBytes`, with a marker the client can detect.
 */

import { mcpPolicy } from "./policy";

export interface ToolResult {
    /** MCP content blocks. We always emit a single text block of JSON. */
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
}

export function ok(payload: unknown): ToolResult {
    const text = stringifyCapped(payload);
    return { content: [{ type: "text", text }] };
}

export function err(message: string, detail?: unknown): ToolResult {
    return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: message, detail }, null, 2) }],
    };
}

function stringifyCapped(payload: unknown): string {
    const text = JSON.stringify(payload, null, 2);
    if (Buffer.byteLength(text, "utf8") <= mcpPolicy.maxToolResponseBytes) return text;
    // Truncate inside the JSON body so the result remains valid JSON.
    const truncated = JSON.stringify({
        warning: `response truncated to ${mcpPolicy.maxToolResponseBytes} bytes`,
        partial: tryShrink(payload),
    }, null, 2);
    return truncated;
}

function tryShrink(payload: unknown): unknown {
    if (Array.isArray(payload)) return payload.slice(0, 25).concat([`…and ${Math.max(0, payload.length - 25)} more (truncated)`]);
    if (payload && typeof payload === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
            if (Array.isArray(v) && v.length > 25) {
                out[k] = v.slice(0, 25).concat([`…and ${v.length - 25} more (truncated)`]);
            } else {
                out[k] = v;
            }
        }
        return out;
    }
    return payload;
}
