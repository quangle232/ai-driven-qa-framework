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
    "tests/",
    "page-objects/",
    "test-data/",
];

const BLOCKED_PREFIXES = [
    ".auth/",
    "environments/",
    "helper/test.ts",
    "helper/jira-bug-reporter.ts",
    "helper/global-setup.ts",
    "helper/authenticate-set-up.ts",
    "config/",
    "ci/",
    "grpc/proto/",
    "api/contracts/",
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

function inspect(p: FilePatch): string | null {
    const norm = p.path.replace(/^[./\\]+/, "");

    if (BLOCKED_PREFIXES.some(b => norm.startsWith(b))) {
        return `path is in the blocked list: ${norm}`;
    }
    if (!ALLOWED_PREFIXES.some(a => norm.startsWith(a))) {
        return `path is outside the allowed roots (tests/, page-objects/, test-data/): ${norm}`;
    }

    // Spec-level checks
    if (norm.startsWith("tests/") && norm.endsWith(".spec.ts")) {
        if (RAW_PLAYWRIGHT_IMPORT.test(p.content)) {
            return "spec imports from '@playwright/test' — must import from 'helper/test'";
        }
        if (!/from\s+['"][^'"]*helper\/test['"]/.test(p.content)) {
            return "spec missing import { test, expect } from 'helper/test'";
        }
        if (TEST_SKIP.test(p.content)) {
            return "spec uses test.skip — forbidden by policy";
        }
        // Every new spec MUST opt into the regression suite. Without this the
        // `aiqa:run-regression` / `--grep @regression` selection would silently
        // skip the new test.
        if (!/TAGS\.REGRESSION\b/.test(p.content)) {
            return "spec missing TAGS.REGRESSION — regression suite would skip this test";
        }
    }

    // Page object checks
    if (norm.startsWith("page-objects/")) {
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
