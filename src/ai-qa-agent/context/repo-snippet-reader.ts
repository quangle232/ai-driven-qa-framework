/**
 * Bounded file/range reader for agents that need a "look at this specific
 * locator in context" hop. Honours the MCP-style allowlist + blocklist so
 * agents can never read secrets even if a prompt told them to.
 */

import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../utils/paths";

const ALLOW = [
    "tests/",
    "page-objects/",
    "helper/",
    "test-data/",
    "config/playwright.config.ts",
    "package.json",
    "tsconfig.json",
    ".claude/skills/qa-agent/",
    ".agents/skills/qa-agent/",
];

const BLOCK = [
    ".env",
    ".auth/",
    "storage-state",
    "secrets/",
    "credentials/",
    ".git/",
    "node_modules/",
    "yarn.lock",
];

const MAX_LINES = 120;

export interface ReadRangeOptions {
    /** Path relative to repo root. */
    file: string;
    /** 1-based start line, inclusive. */
    start?: number;
    /** 1-based end line, inclusive. Clamped to start + MAX_LINES. */
    end?: number;
}

export function isAllowed(file: string): boolean {
    const norm = file.replace(/^[./\\]+/, "");
    if (BLOCK.some(b => norm.includes(b))) return false;
    return ALLOW.some(a => norm.startsWith(a) || norm === a);
}

export function readRange(opts: ReadRangeOptions): { content: string; truncated: boolean } | null {
    if (!isAllowed(opts.file)) return null;
    const abs = path.resolve(REPO_ROOT, opts.file);
    if (!abs.startsWith(REPO_ROOT)) return null; // path traversal guard
    if (!fs.existsSync(abs)) return null;

    const lines = fs.readFileSync(abs, "utf8").split("\n");
    const start = Math.max(1, opts.start ?? 1);
    const requestedEnd = opts.end ?? lines.length;
    const end = Math.min(requestedEnd, start + MAX_LINES - 1, lines.length);
    const truncated = (opts.end ?? lines.length) > end;
    return { content: lines.slice(start - 1, end).join("\n"), truncated };
}
