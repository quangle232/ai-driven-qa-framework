/**
 * Build the cached "framework conventions" block.
 *
 * The Automation Builder Agent and the Code Reviewer Agent both need to
 * understand THIS framework's conventions: POM + ActionKeyword layer +
 * `helper/test.ts` import + setJiraStory + tag catalogue + storageState.
 * They could re-read the same files every call — but those files are large
 * and stable, so this module summarizes them ONCE per session and pins the
 * result via Anthropic prompt caching.
 *
 * Token math: roughly 1.5–2 k tokens after summarization vs. ~12 k if we
 * dumped the helpers + skill reference verbatim. Plus the cache_control
 * breakpoint means 0.1× billing on subsequent calls in the same session.
 */

import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../utils/paths";
import { cacheKey, getCachedContext, putCachedContext } from "./context-cache";

const SOURCES = [
    "helper/test.ts",
    "helper/test-tags.ts",
    "helper/jira-story.ts",
    "helper/auth-config.ts",
    "helper/action-keywords.ts",
    "page-objects/base-page.ts",
    "page-objects/sample/sample-page.ts",
    "tests/sample/sample.spec.ts",
    "test-data/sample-data.ts",
    ".claude/skills/qa-agent/references/framework-conventions.md",
    ".claude/skills/qa-agent/examples/sample-page-object.ts",
    ".claude/skills/qa-agent/examples/sample-spec.ts",
    "config/playwright.config.ts",
];

/** Read up to `headLines` from the top of each file, skipping leading copyright/JSDoc. */
function read(file: string, headLines: number): string | null {
    const abs = path.resolve(REPO_ROOT, file);
    if (!fs.existsSync(abs)) return null;
    const lines = fs.readFileSync(abs, "utf8").split("\n");
    return lines.slice(0, headLines).join("\n");
}

export interface FrameworkContext {
    /** Cache key — identical across runs as long as source mtimes don't change. */
    key: string;
    /** The string an LLM sees. Designed to fit under ~2k tokens. */
    text: string;
    /** Absolute paths actually read (for transparency / debugging). */
    sources: string[];
}

const SCHEMA_VERSION = "framework-context.v1";

export function loadFrameworkContext(): FrameworkContext {
    const sources = SOURCES.map(s => path.resolve(REPO_ROOT, s));
    const key = cacheKey(SCHEMA_VERSION, sources);
    const cached = getCachedContext(key);
    if (cached) return { key, text: cached, sources };

    const text = buildContextBlock();
    putCachedContext(key, text);
    return { key, text, sources };
}

function buildContextBlock(): string {
    const sections: string[] = [];

    sections.push("# Framework conventions — Playwright + TypeScript (this repo)");
    sections.push("");
    sections.push("You are generating tests for the **ai-driven-qa-framework** repo.");
    sections.push("Match these conventions EXACTLY. Do not invent helpers that don't exist.");
    sections.push("");
    sections.push("## Imports — non-negotiable");
    sections.push("- Specs MUST import `{ test, expect }` from `helper/test`, NOT from `@playwright/test`.");
    sections.push("  This is the file that wires the framework-wide failure → Jira-bug auto-fixture.");
    sections.push("- Specs MUST call `setJiraStory('<KEY>')` as the FIRST line of the test body.");
    sections.push("- Specs MUST use `tags(TAGS.X, TAGS.Y)` from `helper/test-tags` — never raw `{ tag: '@x' }`.");
    sections.push("");
    sections.push("## Page Object Model");
    sections.push("- Every page object extends `BasePage` (from `page-objects/base-page`).");
    sections.push("- Page objects use `this.actionKeyword.<verb>(...)` for every Playwright interaction.");
    sections.push("- Page objects MUST NOT call `this.page.click`, `this.page.fill`, etc. directly.");
    sections.push("  The ActionKeyword layer is the only file that touches the raw Playwright API.");
    sections.push("- Locators live as private readonly fields with the `data-zcqa` → `data-test-id` →");
    sections.push("  `data-id` → `data-title` priority. Avoid positional CSS / nth-child / xpath.");
    sections.push("");
    sections.push("## Tag catalogue (from helper/test-tags.ts)");
    sections.push("- Test type: `TAGS.REGRESSION`, `TAGS.SMOKE`");
    sections.push("- Priority:  `TAGS.P0`, `TAGS.P1`, `TAGS.P2`");
    sections.push("- Bugs:      `TAGS.BUG`");
    sections.push("- Feature tags MUST equal the Jira label on the parent story so trigger-jenkins.js works.");
    sections.push("");
    sections.push("## test.step usage");
    sections.push("- Wrap each user-visible action in `await test.step('Sentence-case description', async () => { ... })`.");
    sections.push("- Steps appear in Allure + the HTML report; non-technical stakeholders read them.");
    sections.push("");
    sections.push("## Storage state / auth");
    sections.push("- DO NOT read or write `.auth/storage-state.json`. Auth is set up once in `helper/global-setup.ts`.");
    sections.push("- Tests start already-logged-in via `use.storageState` in config.");
    sections.push("- The initial navigation is `await samplePage.open(process.env.APP_URL ?? '/')`.");
    sections.push("");
    sections.push("## Forbidden patterns");
    sections.push("- No `await page.waitForTimeout(N)` — use locator auto-waiting via ActionKeyword helpers.");
    sections.push("- No `await page.locator('.button').nth(2).click()` — find a stable data-attribute.");
    sections.push("- No `expect(true).toBe(true)` / commented-out assertions / `test.skip()` for failing tests.");
    sections.push("- No hard-coded credentials in specs. Use `process.env.APP_USER` / `APP_PASS` if needed.");
    sections.push("- No new top-level `test()` outside the framework convention — always import from `helper/test`.");
    sections.push("");
    sections.push("## Reference shapes (verbatim from this repo)");
    sections.push("");
    sections.push("### Spec shape");
    sections.push("```ts");
    const specShape = read("tests/sample/sample.spec.ts", 50);
    sections.push(specShape ?? "// tests/sample/sample.spec.ts unavailable");
    sections.push("```");
    sections.push("");
    sections.push("### Page object shape");
    sections.push("```ts");
    const poShape = read("page-objects/sample/sample-page.ts", 60);
    sections.push(poShape ?? "// page-objects/sample/sample-page.ts unavailable");
    sections.push("```");
    sections.push("");
    sections.push("### BasePage");
    sections.push("```ts");
    sections.push(read("page-objects/base-page.ts", 30) ?? "// missing");
    sections.push("```");
    sections.push("");
    sections.push("### Available tags");
    sections.push("```ts");
    sections.push(read("helper/test-tags.ts", 40) ?? "// missing");
    sections.push("```");
    sections.push("");
    sections.push("## What you MUST output");
    sections.push("- New page objects under `page-objects/<feature>/<screen>-page.ts`.");
    sections.push("- New specs under `tests/<feature>/<scenario>.spec.ts`.");
    sections.push("- Test-data under `test-data/<feature>-data.ts` (inputs + expected).");
    sections.push("- Optional new feature tag in `helper/test-tags.ts` — add only when the feature is new.");
    sections.push("");
    sections.push("Return code as unified diff (one hunk per file) so the orchestrator can write it directly.");

    return sections.join("\n");
}
