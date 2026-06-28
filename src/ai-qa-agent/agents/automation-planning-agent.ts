/**
 * Automation Planning Agent.
 *
 * Decides which test cases to automate now, what page objects + fixtures the
 * builder needs to touch, the data strategy, and the teardown strategy.
 *
 * One LLM call (no recursive loop) — planning output is short and the
 * builder is what we actually critique. Uses the FAST tier.
 */

import { TokenBudget } from "../context/token-budget";
import { loadFrameworkContext } from "../context/framework-context";
import type { Provider } from "../providers";
import type { TestCaseBundle } from "../inputs/test-case-input";
import {
    AUTOMATION_PLAN_SCHEMA_VERSION,
    type AutomationPlan,
} from "../schemas/automation-plan.schema";

const SYSTEM = `You are the Automation Planning Agent for the AI QA Agent framework.
Output a strict JSON plan, no prose.

Schema:
{
  "automationCandidates": [{"tcId": "...", "reason": "..."}],
  "notRecommendedForAutomation": [{"tcId": "...", "reason": "..."}],
  "requiredPageObjects": ["page-objects/login/login-page.ts"],
  "requiredFixtures": [],
  "requiredTags": ["@regression", "@auth", "@P1"],
  "dataStrategy": "<one sentence>",
  "teardownStrategy": "<one sentence>"
}

Rules:
- Page object paths follow page-objects/<feature>/<screen>-page.ts.
- Tags must match TAGS.* from helper/test-tags.ts. Feature tags equal Jira labels.
- Do not recommend automating tests that require 2FA, captcha, manual approval, or non-deterministic timing.
- Data strategy: prefer test-data/<feature>-data.ts files; never hardcode credentials.
- Teardown: API cleanup is preferred over UI; reset is OK when no API.`;

function fallback(bundle: TestCaseBundle): AutomationPlan {
    return {
        schemaVersion: AUTOMATION_PLAN_SCHEMA_VERSION,
        automationCandidates: bundle.testCases.map(tc => ({ tcId: tc.tcId, reason: "automatable by default" })),
        notRecommendedForAutomation: [],
        requiredPageObjects: [`page-objects/${slug(bundle.feature)}/${slug(bundle.feature)}-page.ts`],
        requiredFixtures: [],
        requiredTags: bundle.tags.length ? bundle.tags : ["@regression"],
        dataStrategy: `Inputs/expected under test-data/${slug(bundle.feature)}-data.ts.`,
        teardownStrategy: "No teardown for read-only paths; API teardown for write paths.",
    };
}

function slug(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function coerce(json: unknown, fb: AutomationPlan): AutomationPlan {
    if (!json || typeof json !== "object") return fb;
    const j = json as Record<string, unknown>;
    return {
        schemaVersion: AUTOMATION_PLAN_SCHEMA_VERSION,
        automationCandidates: arrOfPair(j.automationCandidates, "tcId", "reason", fb.automationCandidates),
        notRecommendedForAutomation: arrOfPair(j.notRecommendedForAutomation, "tcId", "reason", fb.notRecommendedForAutomation),
        requiredPageObjects: arrOfString(j.requiredPageObjects, fb.requiredPageObjects),
        requiredFixtures: arrOfString(j.requiredFixtures, fb.requiredFixtures),
        requiredTags: arrOfString(j.requiredTags, fb.requiredTags),
        dataStrategy: typeof j.dataStrategy === "string" ? j.dataStrategy : fb.dataStrategy,
        teardownStrategy: typeof j.teardownStrategy === "string" ? j.teardownStrategy : fb.teardownStrategy,
    };
}

function arrOfString(v: unknown, fb: string[]): string[] {
    return Array.isArray(v) ? v.map(String) : fb;
}

function arrOfPair(v: unknown, k1: string, k2: string, fb: Array<{ tcId: string; reason: string }>): Array<{ tcId: string; reason: string }> {
    if (!Array.isArray(v)) return fb;
    return v.map(x => {
        const r = (x && typeof x === "object") ? x as Record<string, unknown> : {};
        return { tcId: String(r[k1] ?? ""), reason: String(r[k2] ?? "") };
    }).filter(p => p.tcId);
}

export interface PlanInput {
    bundle: TestCaseBundle;
    provider: Provider;
    budget: TokenBudget;
}

export async function planAutomation(input: PlanInput): Promise<AutomationPlan> {
    const fb = fallback(input.bundle);
    if (input.provider.name === "noop" || input.budget.isExhausted()) return fb;

    const fw = loadFrameworkContext();
    const tcSummary = input.bundle.testCases.map(tc => ({
        tcId: tc.tcId, summary: tc.summary, priority: tc.priority,
    }));

    const resp = await input.provider.call(
        [
            { role: "system", text: SYSTEM, cacheBreakpoint: true },
            { role: "system", text: fw.text, cacheBreakpoint: true },
            { role: "user", text: `Feature: ${input.bundle.feature}\nJira: ${input.bundle.jiraStoryKey ?? "—"}\nTags hint: ${input.bundle.tags.join(", ") || "—"}\n\nTest cases:\n${JSON.stringify(tcSummary, null, 2)}` },
        ],
        { tier: "fast", json: true, maxOutputTokens: 1200, label: "plan.generate" },
    );
    input.budget.charge("plan.generate", resp.usage);
    return coerce(resp.json, fb);
}
