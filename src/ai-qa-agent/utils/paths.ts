/**
 * Path helpers — output roots and CI-safe file resolution.
 *
 * Anchored to `process.cwd()` (the repo root when Playwright/CLI run), so the
 * AI QA Agent agrees with `helper/auth-config.ts` on absolute paths.
 */

import path from "node:path";
import fs from "node:fs";

export const REPO_ROOT = process.cwd();

export function aiqaOutDir(env: NodeJS.ProcessEnv = process.env): string {
    const raw = env.AIQA_OUT_DIR?.trim() || "test-output/ai";
    return path.isAbsolute(raw) ? raw : path.resolve(REPO_ROOT, raw);
}

export const PLAYWRIGHT_JSON_PATH = path.resolve(REPO_ROOT, "test-output/playwright-report.json");
export const ALLURE_RESULTS_DIR = path.resolve(REPO_ROOT, "test-output/allure-results");
export const TEST_RESULTS_DIR = path.resolve(REPO_ROOT, "test-results");

/** Make sure a directory exists. Returns the absolute path. */
export function ensureDir(dir: string): string {
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

/** Subdir under aiqa out — auto-created. */
export function aiqaSubdir(name: string, env: NodeJS.ProcessEnv = process.env): string {
    return ensureDir(path.join(aiqaOutDir(env), name));
}

/** Best-effort relative path for log readability. */
export function relativeToRepo(absPath: string): string {
    return path.relative(REPO_ROOT, absPath) || absPath;
}
