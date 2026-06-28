#!/usr/bin/env node
/**
 * MCP server: `aiqa-memory` — knowledge persistence for a specific project.
 *
 * Stores live under `.aiqa-memory/<store>.json` and are hand-editable.
 * Reads are always allowed. Writes are gated by `AIQA_ALLOW_MEMORY_WRITE`:
 * with the env unset, write tools still appear in the catalogue but every
 * call returns a structured "writes disabled" error. This keeps surprises
 * out of CI while letting humans curate the stores locally.
 *
 * Tools:
 *   - aiqa.mem.get_known_issues          / .add_known_issue        / .match_known_issues
 *   - aiqa.mem.get_flaky_history         / .get_flaky_rate
 *   - aiqa.mem.get_failure_patterns      / .annotate_failure_pattern
 *   - aiqa.mem.get_domain_glossary       / .add_glossary_term      / .find_term
 */

import { McpServerBase, ok, err, type ToolResult } from "../../shared/server-base";
import { writeAllowed } from "../../shared/policy";
import {
    listKnownIssues, addKnownIssue, matchKnownIssues,
    type KnownIssue,
} from "../../../src/ai-qa-agent/memory/known-issues.store";
import {
    listFlakyHistory, getFlakyRate,
} from "../../../src/ai-qa-agent/memory/flaky-history.store";
import {
    listFailurePatterns, annotatePattern,
} from "../../../src/ai-qa-agent/memory/failure-pattern.store";
import {
    listGlossary, addTerm, findTerm,
} from "../../../src/ai-qa-agent/memory/domain-glossary.store";

function requireWrite(): ToolResult | null {
    if (writeAllowed()) return null;
    return err(
        "memory writes are disabled.",
        "Set AIQA_ALLOW_MEMORY_WRITE=true to enable. Reads are always allowed.",
    );
}

export const memoryServer = new McpServerBase({
    name: "aiqa-memory",
    version: "1.0.0",
    tools: [
        // ── Known issues ───────────────────────────────────────────────
        {
            name: "aiqa.mem.get_known_issues",
            description: "Team-curated known bugs / quirks. Use to attribute a failure to an already-tracked issue before deriving a new root cause.",
            inputSchema: { type: "object", properties: { status: { type: "string", enum: ["open", "mitigated", "fixed"] } } },
            handler: (a) => {
                const all = listKnownIssues();
                const status = (a as { status?: string }).status;
                const records = status ? all.filter(i => i.status === status) : all;
                return ok({ count: records.length, records });
            },
        },
        {
            name: "aiqa.mem.match_known_issues",
            description: "Given a failure (title + file + error + tags), return known issues that plausibly match.",
            inputSchema: {
                type: "object",
                properties: {
                    title: { type: "string" }, file: { type: "string" },
                    errorMessage: { type: "string" },
                    tags: { type: "array", items: { type: "string" } },
                },
                required: ["title", "file", "errorMessage"],
            },
            handler: (a) => {
                const args = a as { title: string; file: string; errorMessage: string; tags?: string[] };
                const matches = matchKnownIssues({ ...args, tags: args.tags ?? [] });
                return ok({ count: matches.length, matches });
            },
        },
        {
            name: "aiqa.mem.add_known_issue",
            description: "Record a new known issue. Gated by AIQA_ALLOW_MEMORY_WRITE.",
            inputSchema: {
                type: "object",
                properties: {
                    title: { type: "string" }, description: { type: "string" },
                    status: { type: "string", enum: ["open", "mitigated", "fixed"] },
                    jiraKey: { type: "string" },
                    affects: {
                        type: "object",
                        properties: {
                            features: { type: "array", items: { type: "string" } },
                            tagsContains: { type: "array", items: { type: "string" } },
                            errorContains: { type: "string" },
                        },
                    },
                },
                required: ["title", "description", "status"],
            },
            handler: (a) => {
                const block = requireWrite(); if (block) return block;
                const args = a as Omit<KnownIssue, "id" | "addedAt">;
                return ok(addKnownIssue(args));
            },
        },
        // ── Flaky history ──────────────────────────────────────────────
        {
            name: "aiqa.mem.get_flaky_history",
            description: "All tests with at least one recorded flake. Sorted by flake-rate desc.",
            inputSchema: { type: "object", properties: { minRate: { type: "number", description: "Filter rows whose flake-rate ≥ this (0-1)." } } },
            handler: (a) => {
                const minRate = (a as { minRate?: number }).minRate ?? 0;
                const records = listFlakyHistory()
                    .map(r => ({ ...r, rate: r.runCount === 0 ? 0 : r.flakeCount / r.runCount }))
                    .filter(r => r.rate >= minRate)
                    .sort((a, b) => b.rate - a.rate);
                return ok({ count: records.length, records });
            },
        },
        {
            name: "aiqa.mem.get_flaky_rate",
            description: "Flake rate for a specific testId.",
            inputSchema: { type: "object", properties: { testId: { type: "string" } }, required: ["testId"] },
            handler: (a) => ok(getFlakyRate((a as { testId: string }).testId)),
        },
        // ── Failure patterns ───────────────────────────────────────────
        {
            name: "aiqa.mem.get_failure_patterns",
            description: "Repeated failure fingerprints with the team's resolution history.",
            inputSchema: { type: "object", properties: { minOccurrences: { type: "number" } } },
            handler: (a) => {
                const min = (a as { minOccurrences?: number }).minOccurrences ?? 1;
                const records = listFailurePatterns().filter(p => p.occurrences >= min);
                return ok({ count: records.length, records });
            },
        },
        {
            name: "aiqa.mem.annotate_failure_pattern",
            description: "Attach a root-cause summary or resolution note to a fingerprint. Gated by AIQA_ALLOW_MEMORY_WRITE.",
            inputSchema: {
                type: "object",
                properties: {
                    fingerprint: { type: "string" },
                    rootCauseSummary: { type: "string" },
                    resolutionSummary: { type: "string" },
                    runId: { type: "string" }, commit: { type: "string" },
                },
                required: ["fingerprint"],
            },
            handler: (a) => {
                const block = requireWrite(); if (block) return block;
                const args = a as { fingerprint: string; rootCauseSummary?: string; resolutionSummary?: string; runId?: string; commit?: string };
                const r = annotatePattern(args.fingerprint, args);
                if (!r) return err(`no pattern with fingerprint ${args.fingerprint}`);
                return ok(r);
            },
        },
        // ── Domain glossary ────────────────────────────────────────────
        {
            name: "aiqa.mem.get_domain_glossary",
            description: "Project-specific terms (curated by the team). Used by stakeholder report tooltips.",
            inputSchema: { type: "object", properties: {} },
            handler: () => ok({ count: listGlossary().length, records: listGlossary() }),
        },
        {
            name: "aiqa.mem.find_term",
            description: "Look up a term (case-insensitive). Searches term + aliases.",
            inputSchema: { type: "object", properties: { term: { type: "string" } }, required: ["term"] },
            handler: (a) => {
                const r = findTerm((a as { term: string }).term);
                return ok({ found: !!r, term: r ?? null });
            },
        },
        {
            name: "aiqa.mem.add_glossary_term",
            description: "Add a domain term. Gated by AIQA_ALLOW_MEMORY_WRITE.",
            inputSchema: {
                type: "object",
                properties: {
                    term: { type: "string" }, plainEnglish: { type: "string" },
                    engineeringNotes: { type: "string" },
                    aliases: { type: "array", items: { type: "string" } },
                    relatedFeatures: { type: "array", items: { type: "string" } },
                },
                required: ["term", "plainEnglish"],
            },
            handler: (a) => {
                const block = requireWrite(); if (block) return block;
                const args = a as { term: string; plainEnglish: string; engineeringNotes?: string; aliases?: string[]; relatedFeatures?: string[] };
                return ok(addTerm(args));
            },
        },
    ],
});

if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
    memoryServer.start().catch(e => {
        process.stderr.write(`[aiqa-memory] fatal: ${(e as Error).message}\n`);
        process.exit(1);
    });
}
