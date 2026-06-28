#!/usr/bin/env node
/**
 * MCP server: `aiqa-framework-context` — exposes the convention block and
 * the existing-code index. The LLM client calls this BEFORE generating code
 * so it picks up the right imports / POM patterns / ActionKeyword methods.
 *
 * Read-only. Tools:
 *   - aiqa.fw.get_conventions         — the framework-conventions prompt block
 *   - aiqa.fw.get_existing_code_index — full structured index (POMs, specs, tags, keywords, test-data)
 *   - aiqa.fw.find_page_object        — by feature OR by class name
 *   - aiqa.fw.list_action_keywords    — the ActionKeyword public methods (so the model can't invent new ones)
 *   - aiqa.fw.search_tests            — tests by tag / story / feature
 *   - aiqa.fw.read_snippet            — bounded read of a file range under allowlist
 */

import { McpServerBase, ok, err, type ToolResult } from "../../shared/server-base";
import { pathAllowed } from "../../shared/policy";
import { loadFrameworkContext } from "../../../src/ai-qa-agent/context/framework-context";
import { loadExistingCodeIndex, renderIndexForPrompt } from "../../../src/ai-qa-agent/context/existing-code-index";
import { readRange } from "../../../src/ai-qa-agent/context/repo-snippet-reader";

function getConventionsTool(args: { format?: "text" | "summary" }): ToolResult {
    const ctx = loadFrameworkContext();
    if (args.format === "summary") {
        return ok({
            cacheKey: ctx.key,
            sourceCount: ctx.sources.length,
            preview: ctx.text.slice(0, 600) + (ctx.text.length > 600 ? " …" : ""),
        });
    }
    return ok({ cacheKey: ctx.key, text: ctx.text });
}

function getIndexTool(args: { format?: "json" | "prompt" }): ToolResult {
    const idx = loadExistingCodeIndex();
    if (args.format === "prompt") {
        return ok({ cacheKey: idx.key, text: renderIndexForPrompt(idx) });
    }
    return ok(idx);
}

function findPageObjectTool(args: { feature?: string; className?: string }): ToolResult {
    const idx = loadExistingCodeIndex();
    const matches = idx.pageObjects.filter(p =>
        (args.feature && p.feature === args.feature)
        || (args.className && p.className === args.className)
    );
    return ok({ count: matches.length, matches });
}

function listActionKeywordsTool(args: { contains?: string }): ToolResult {
    const idx = loadExistingCodeIndex();
    let methods = idx.actionKeywordMethods;
    if (args.contains) {
        const needle = args.contains.toLowerCase();
        methods = methods.filter(m => m.toLowerCase().includes(needle));
    }
    return ok({ count: methods.length, methods });
}

function searchTestsTool(args: { tag?: string; feature?: string; jiraKey?: string }): ToolResult {
    const idx = loadExistingCodeIndex();
    let specs = idx.specs;
    if (args.feature) specs = specs.filter(s => s.feature === args.feature);
    if (args.tag) {
        const t = args.tag.replace(/^TAGS\./i, "").replace(/^@/, "").toUpperCase();
        specs = specs.filter(s => s.tags.includes(t));
    }
    if (args.jiraKey) specs = specs.filter(s => s.jiraStories.includes(args.jiraKey!));
    return ok({ count: specs.length, specs });
}

function readSnippetTool(args: { file?: string; start?: number; end?: number }): ToolResult {
    if (!args.file) return err("missing required argument: file");
    if (!pathAllowed(args.file)) return err(`path is not in the MCP allowlist: ${args.file}`);
    const r = readRange({ file: args.file, start: args.start, end: args.end });
    if (!r) return err(`could not read ${args.file} (blocked, missing, or outside repo)`);
    return ok({ file: args.file, start: args.start ?? 1, end: (args.start ?? 1) + r.content.split("\n").length - 1, truncated: r.truncated, content: r.content });
}

export const frameworkContextServer = new McpServerBase({
    name: "aiqa-framework-context",
    version: "1.0.0",
    tools: [
        {
            name: "aiqa.fw.get_conventions",
            description: "The framework conventions prompt block: imports, POM, tags, storageState, forbidden patterns. CALL THIS BEFORE GENERATING ANY CODE for this repo.",
            inputSchema: { type: "object", properties: { format: { type: "string", enum: ["text", "summary"] } } },
            handler: (a) => getConventionsTool(a as { format?: "text" | "summary" }),
        },
        {
            name: "aiqa.fw.get_existing_code_index",
            description: "Structured index of existing page objects, specs, tags, ActionKeyword methods, and test-data modules. REUSE these instead of duplicating.",
            inputSchema: { type: "object", properties: { format: { type: "string", enum: ["json", "prompt"] } } },
            handler: (a) => getIndexTool(a as { format?: "json" | "prompt" }),
        },
        {
            name: "aiqa.fw.find_page_object",
            description: "Locate a page object by feature directory name OR by exported class name.",
            inputSchema: {
                type: "object",
                properties: {
                    feature: { type: "string" },
                    className: { type: "string" },
                },
            },
            handler: (a) => findPageObjectTool(a as { feature?: string; className?: string }),
        },
        {
            name: "aiqa.fw.list_action_keywords",
            description: "Public methods on the ActionKeyword class. Do NOT invent keyword names outside this list.",
            inputSchema: { type: "object", properties: { contains: { type: "string", description: "Filter substring (case-insensitive)." } } },
            handler: (a) => listActionKeywordsTool(a as { contains?: string }),
        },
        {
            name: "aiqa.fw.search_tests",
            description: "Find existing specs by TAGS.* (REGRESSION, SMOKE, P0...), by feature dir, or by Jira story key.",
            inputSchema: {
                type: "object",
                properties: {
                    tag: { type: "string", description: "TAGS.REGRESSION / TAGS.SMOKE / TAGS.P0 / etc. (accepts @-prefix or TAGS. prefix)." },
                    feature: { type: "string" },
                    jiraKey: { type: "string" },
                },
            },
            handler: (a) => searchTestsTool(a as { tag?: string; feature?: string; jiraKey?: string }),
        },
        {
            name: "aiqa.fw.read_snippet",
            description: "Bounded read of a file range (max 120 lines). Respects the MCP allowlist + blocklist — never returns .env, .auth, storageState, or secrets.",
            inputSchema: {
                type: "object",
                properties: {
                    file: { type: "string", description: "Repo-relative path." },
                    start: { type: "number", description: "1-based line, inclusive." },
                    end: { type: "number", description: "1-based line, inclusive. Clamped to start + 119." },
                },
                required: ["file"],
            },
            handler: (a) => readSnippetTool(a as { file?: string; start?: number; end?: number }),
        },
    ],
});

if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
    frameworkContextServer.start().catch(e => {
        process.stderr.write(`[aiqa-framework-context] fatal: ${(e as Error).message}\n`);
        process.exit(1);
    });
}
