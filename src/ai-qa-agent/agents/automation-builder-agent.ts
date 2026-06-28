/**
 * Automation Builder Agent.
 *
 * Generates Playwright TypeScript files (page object + spec + test data) that
 * match the framework conventions exactly. Output is a list of file patches:
 *   { path, kind: "create"|"update", content }
 * The orchestrator writes them under `test-output/ai/patches/<plan-id>/` so a
 * human reviews before anything lands in `tests/` or `page-objects/`.
 *
 * Uses the SMART tier — code generation is the one place Opus 4.7 earns its
 * tokens. One round to generate, one round of critique, one optional refine.
 */

import { recursivePolicy } from "../config/recursive-policy";
import { TokenBudget } from "../context/token-budget";
import { loadFrameworkContext } from "../context/framework-context";
import { loadExistingCodeIndex, renderIndexForPrompt } from "../context/existing-code-index";
import type { Provider } from "../providers";
import type { TestCaseBundle, ParsedTestCase } from "../inputs/test-case-input";
import type { AutomationPlan } from "../schemas/automation-plan.schema";
import { RECURSIVE_REVIEW_SCHEMA_VERSION, type RecursiveReview } from "../schemas/recursive-review.schema";
import { runRecursive } from "./recursive-runner";

export interface FilePatch {
    path: string;
    kind: "create" | "update";
    content: string;
    /** Reason this file was generated/changed (for the human reviewer). */
    rationale: string;
}

export interface BuilderOutput {
    patches: FilePatch[];
    notes: string[];
}

const SYSTEM = `You are the Automation Builder Agent for the AI QA Agent framework.
Generate Playwright TypeScript files following the framework conventions block (next message).

Output schema (strict JSON, no prose, no fences):
{
  "patches": [
    {
      "path": "page-objects/<feature>/<screen>-page.ts" | "tests/<feature>/<scenario>.spec.ts" | "test-data/<feature>-data.ts",
      "kind": "create" | "update",
      "content": "<full file content, NOT a diff>",
      "rationale": "<one sentence>"
    }
  ],
  "notes": ["<optional reviewer hint>", ...]
}

Hard rules:
- Specs MUST import { test, expect } from '../../helper/test'. Never from '@playwright/test'.
- Specs MUST start the body with setJiraStory('<KEY>') if a Jira key is present.
- Specs MUST use tags(TAGS.X, ...) from '../../helper/test-tags'.
- EVERY new spec MUST include TAGS.REGRESSION in its tags() call so the regression suite picks it up. Plus one priority tag (TAGS.P0 / TAGS.P1 / TAGS.P2).
- Page objects MUST extend BasePage and only call this.actionKeyword.* — never this.page.click/fill/etc.
- Locators must use stable data attributes (data-zcqa, data-test-id, data-id, data-title).
- No page.waitForTimeout. No nth(N). No commented-out assertions. No test.skip on failing logic.
- Do NOT touch helper/, .auth/, environments/, jenkins/, config/playwright.config.ts.
- Each "content" must compile as TypeScript under the existing tsconfig (strict OFF in root).

REUSE rules (read the "Existing code in this repo" block carefully):
- If a page object for the target feature ALREADY exists, EMIT a "kind": "update" patch that extends it. Do NOT create a duplicate.
- If a tag for the feature is missing from helper/test-tags.ts, emit an "update" patch that adds it.
- Only call ActionKeyword methods that already exist (listed in the existing-code block). Do not invent new keyword names.
- Reuse test-data exports when their name already matches; otherwise create new ones in test-data/<feature>-data.ts.`;

const CRITIC_SYSTEM = `You are the Automation Code Reviewer.
Review generated Playwright patches against the framework conventions. Return a recursive-review JSON.

Findings types include: weakened_assertion, missing_import_from_helper_test, missing_setJiraStory, raw_playwright_call, unstable_locator, hardcoded_secret, test_skip_on_failure, hardwait, touched_forbidden_path, missing_test_step.

If any of those appear, shouldRefine: true unless the builder already exhausted maxRounds.`;

function renderTestCases(bundle: TestCaseBundle): string {
    return bundle.testCases.map(tc => [
        `## ${tc.tcId} (${tc.priority}) — ${tc.summary}`,
        `Pre-condition: ${tc.preCondition || "—"}`,
        `Steps:`,
        ...tc.steps.map((s, i) => `  ${i + 1}. ${s}`),
        `Expected: ${tc.expected}`,
    ].join("\n")).join("\n\n");
}

function coercePatches(json: unknown): BuilderOutput {
    if (!json || typeof json !== "object") return { patches: [], notes: ["builder returned no parseable JSON"] };
    const j = json as Record<string, unknown>;
    const patches = Array.isArray(j.patches) ? (j.patches as Array<Record<string, unknown>>).map(p => ({
        path: String(p.path ?? ""),
        kind: (p.kind === "update" ? "update" : "create") as FilePatch["kind"],
        content: String(p.content ?? ""),
        rationale: String(p.rationale ?? ""),
    })).filter(p => p.path && p.content) : [];
    const notes = Array.isArray(j.notes) ? j.notes.map(String) : [];
    return { patches, notes };
}

function coerceReview(json: unknown, round: number, maxRounds: number): RecursiveReview {
    const j = (json && typeof json === "object") ? json as Record<string, unknown> : {};
    return {
        schemaVersion: RECURSIVE_REVIEW_SCHEMA_VERSION,
        workflow: "automationGeneration",
        round,
        maxRounds,
        inputSummary: "Automation builder review",
        reviewFindings: Array.isArray(j.reviewFindings)
            ? (j.reviewFindings as Array<Record<string, unknown>>).map(f => ({
                type: typeof f.type === "string" ? f.type : "unknown",
                message: typeof f.message === "string" ? f.message : "",
            }))
            : [],
        coverageScore: clamp01(j.coverageScore),
        confidenceScore: clamp01(j.confidenceScore),
        shouldRefine: j.shouldRefine === true,
        nextMinimalContextNeeded: Array.isArray(j.nextMinimalContextNeeded) ? j.nextMinimalContextNeeded.map(String) : [],
        stopReason: typeof j.stopReason === "string" ? j.stopReason as RecursiveReview["stopReason"] : null,
    };
}

function clamp01(v: unknown): number {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
}

export interface BuildInput {
    bundle: TestCaseBundle;
    plan: AutomationPlan;
    provider: Provider;
    budget: TokenBudget;
}

export interface BuildResult {
    output: BuilderOutput;
    reviews: RecursiveReview[];
    stopReason: string | null;
    rounds: number;
}

export async function buildAutomation(input: BuildInput): Promise<BuildResult> {
    if (input.provider.name === "noop" || input.budget.isExhausted()) {
        return {
            output: {
                patches: [],
                notes: input.provider.name === "noop"
                    ? ["No LLM available — set ANTHROPIC_API_KEY to generate code."]
                    : ["Token budget exhausted before generation."],
            },
            reviews: [],
            stopReason: input.provider.name === "noop" ? "no_provider" : "token_budget_exhausted",
            rounds: 0,
        };
    }

    const fw = loadFrameworkContext();
    const existing = loadExistingCodeIndex();
    const existingBlock = renderIndexForPrompt(existing);

    const userBlock = [
        `Feature: ${input.bundle.feature}`,
        `Jira story: ${input.bundle.jiraStoryKey ?? "(none)"}`,
        `Tags hint: ${input.bundle.tags.join(", ") || "(none)"}`,
        ``,
        `Plan:`,
        JSON.stringify(input.plan, null, 2),
        ``,
        `Test cases:`,
        renderTestCases(input.bundle),
    ].join("\n");

    const maxRounds = recursivePolicy.maxRoundsByWorkflow.automationGeneration;

    const result = await runRecursive<BuilderOutput>({
        workflow: "automationGeneration",
        budget: input.budget,
        async generate() {
            const resp = await input.provider.call(
                [
                    { role: "system", text: SYSTEM, cacheBreakpoint: true },
                    { role: "system", text: fw.text, cacheBreakpoint: true },
                    { role: "system", text: existingBlock, cacheBreakpoint: true },
                    { role: "user", text: userBlock },
                ],
                { tier: "smart", json: true, maxOutputTokens: 4096, label: "build.generate" },
            );
            input.budget.charge("build.generate", resp.usage);
            return { output: postProcess(coercePatches(resp.json)), tokens: resp.usage.input + resp.usage.output };
        },
        async review(output, round) {
            const resp = await input.provider.call(
                [
                    { role: "system", text: CRITIC_SYSTEM, cacheBreakpoint: true },
                    { role: "system", text: fw.text, cacheBreakpoint: true },
                    { role: "system", text: existingBlock, cacheBreakpoint: true },
                    { role: "user", text: `Generated patches:\n${JSON.stringify(output, null, 2)}\n\nOriginal plan:\n${JSON.stringify(input.plan)}` },
                ],
                { tier: "fast", json: true, maxOutputTokens: 700, label: `build.review.r${round}` },
            );
            input.budget.charge(`build.review.r${round}`, resp.usage);
            return { review: coerceReview(resp.json, round, maxRounds), tokens: resp.usage.input + resp.usage.output };
        },
        async refine(prev, review) {
            const resp = await input.provider.call(
                [
                    { role: "system", text: SYSTEM, cacheBreakpoint: true },
                    { role: "system", text: fw.text, cacheBreakpoint: true },
                    { role: "system", text: existingBlock, cacheBreakpoint: true },
                    { role: "user", text: `Fix these reviewer findings and re-emit the FULL patch set:\n${JSON.stringify(review.reviewFindings)}\n\nPrevious patches:\n${JSON.stringify(prev)}\n\n${userBlock}` },
                ],
                { tier: "smart", json: true, maxOutputTokens: 4096, label: "build.refine" },
            );
            input.budget.charge("build.refine", resp.usage);
            return { output: postProcess(coercePatches(resp.json)), tokens: resp.usage.input + resp.usage.output };
        },
    });

    return { output: result.output, reviews: result.reviews, stopReason: result.stopReason ?? null, rounds: result.rounds };
}

/**
 * Auto-inject TAGS.REGRESSION into any spec that's missing it. Acts as a
 * deterministic safety net on top of the prompt — even if the LLM forgets,
 * the spec still lands with the regression tag so `--grep @regression`
 * picks it up.
 *
 * Only operates on the textual tags(...) call. If we can't find one, we
 * leave the content alone and let patch-guard reject it.
 */
function postProcess(out: BuilderOutput): BuilderOutput {
    const tagsRx = /tags\s*\(([^)]*)\)/;
    const patched = out.patches.map(p => {
        if (!p.path.startsWith("tests/")) return p;
        if (!p.path.endsWith(".spec.ts")) return p;
        const m = p.content.match(tagsRx);
        if (!m) return p;
        const inside = m[1];
        if (/TAGS\.REGRESSION/.test(inside)) return p;
        const replacement = `tags(TAGS.REGRESSION, ${inside.trim()})`;
        return { ...p, content: p.content.replace(tagsRx, replacement) };
    });
    const noteAdded = patched.some((p, i) => p.content !== out.patches[i].content);
    return {
        patches: patched,
        notes: noteAdded ? [...out.notes, "auto-injected TAGS.REGRESSION on at least one spec"] : out.notes,
    };
}
