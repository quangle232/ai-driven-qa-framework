/**
 * Deterministic safety gate for builder patches.
 *
 * Runs after the Builder Agent emits patches and BEFORE anything touches
 * disk. Catches the worst-case violations even when the LLM (or a future
 * jailbreak) tries to slip them past the reviewer:
 *   - writes outside the allowed roots (tests/, page-objects/, test-data/)
 *   - touches secrets / .auth / config / jenkins / helper-test
 *   - imports test/expect from '@playwright/test'
 *   - calls page.waitForTimeout / page.click directly in a page object
 *   - hardcoded credentials
 *
 * Returns `{ accepted, rejected[] }` so the CLI surfaces refusals clearly.
 */

import type { FilePatch } from "../agents/automation-builder-agent";

export interface GuardViolation {
    patch: FilePatch;
    reason: string;
}

const ALLOWED_PREFIXES = [
    // modular layout (this starter)
    "ui/tests/",
    "ui/page-objects/",
    "ui/test-data/",
    "api/rest/tests/",
    "api/grpc/tests/",
    "api/graphql/tests/",
    "mobile/tests/",
    "mobile/screen-objects/",
    // flat layout — kept for consuming repos that keep specs at the root
    "tests/",
    "page-objects/",
    "test-data/",
];

const BLOCKED_PREFIXES = [
    ".auth/",
    "environments/",
    "core/", // shared: test.ts, jira reporter, env, tags — never generated into
    "ui/helpers/global-setup.ts",
    "ui/helpers/authenticate-set-up.ts",
    "ui/helpers/auth-config.ts",
    "config/",
    "ci/",
    "api/grpc/proto/",
    "api/rest/contracts/",
    ".github/",
    ".gitlab-ci.yml",
    "node_modules/",
    ".git/",
];

const SECRET_RX = /(?:password|api[_-]?key|token|secret)\s*[:=]\s*["'][^"']{6,}["']/i;
// Anchor to an actual import statement at the start of a line — avoids
// flagging the comment "(NOT from '@playwright/test')" in the sample spec.
const RAW_PLAYWRIGHT_IMPORT = /^\s*import\s[^;]*from\s+['"]@playwright\/test['"]/m;
const HARD_WAIT = /\.waitForTimeout\s*\(/;
const TEST_SKIP = /\btest\.skip\s*\(/;
const FORCE_PASS = /expect\(\s*true\s*\)\s*\.toBe\(\s*true\s*\)/;
const WEAKENED = /^\s*\/\/\s*(?:await\s+)?expect\b/m;

export function guardPatches(patches: FilePatch[]): { accepted: FilePatch[]; rejected: GuardViolation[] } {
    const accepted: FilePatch[] = [];
    const rejected: GuardViolation[] = [];

    for (const p of patches) {
        const reason = inspect(p);
        if (reason) {
            rejected.push({ patch: p, reason });
        } else {
            accepted.push(p);
        }
    }
    return { accepted, rejected };
}

// The ONE core file patches may touch: the tag == Jira label convention
// requires adding a TAGS entry per new feature, and the builder prompt
// instructs exactly that. Additive and low-risk; the rest of core/ stays
// blocked below.
const TAG_CATALOGUE = "core/test-tags.ts";

function inspect(p: FilePatch): string | null {
    const norm = p.path.replace(/^[./\\]+/, "");

    if (norm !== TAG_CATALOGUE && BLOCKED_PREFIXES.some(b => norm.startsWith(b))) {
        return `path is in the blocked list: ${norm}`;
    }
    if (norm !== TAG_CATALOGUE && !ALLOWED_PREFIXES.some(a => norm.startsWith(a))) {
        return `path is outside the allowed roots (<module>/tests|page-objects|test-data, core/test-tags.ts): ${norm}`;
    }

    // Spec-level checks — match specs in BOTH layouts (ui/tests/… and tests/…)
    if (norm.endsWith(".spec.ts") && (norm.startsWith("tests/") || norm.includes("/tests/"))) {
        if (RAW_PLAYWRIGHT_IMPORT.test(p.content)) {
            return "spec imports from '@playwright/test' — must import from '@core/test'";
        }
        if (!/from\s+['"](?:@core\/test|[^'"]*(?:core|helper)\/test)['"]/.test(p.content)) {
            return "spec missing import { test, expect } from '@core/test'";
        }
        if (TEST_SKIP.test(p.content)) {
            return "spec uses test.skip — forbidden by policy";
        }
        // Every NEW spec MUST opt into the regression suite. Without this the
        // `aiqa:run-regression` / `--grep @regression` selection would silently
        // skip the new test. Scoped to CREATE patches: the repo-wide guard
        // sweep wraps existing files as kind "update", and legacy/utility
        // specs deliberately outside the regression grep must not turn it red.
        if (p.kind === "create" && !/TAGS\.REGRESSION\b/.test(p.content)) {
            return "spec missing TAGS.REGRESSION — regression suite would skip this test";
        }
    }

    // Page/screen object checks — both layouts
    if (norm.startsWith("page-objects/") || norm.includes("/page-objects/") || norm.includes("/screen-objects/")) {
        if (/this\.page\.(?:click|fill|type|press|hover|dblclick|check|uncheck|selectOption)\(/.test(p.content)) {
            return "page object calls this.page.* directly — must go through this.actionKeyword";
        }
    }

    // Universal forbidden patterns
    if (HARD_WAIT.test(p.content)) return "uses page.waitForTimeout — forbidden by policy";
    if (FORCE_PASS.test(p.content)) return "contains expect(true).toBe(true) — forbidden";
    if (WEAKENED.test(p.content)) return "contains a commented-out assertion — forbidden";
    if (SECRET_RX.test(p.content)) return "contains a hardcoded credential / token";

    return null;
}
