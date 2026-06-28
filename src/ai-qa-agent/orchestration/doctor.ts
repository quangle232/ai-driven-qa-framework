/**
 * `aiqa doctor` — health check before running the framework on a new project.
 *
 * Runs a list of deterministic checks. Each returns one of:
 *   - ok    (everything looks right)
 *   - warn  (works today but you'll hit a problem soon)
 *   - fail  (broken — fix before running)
 *
 * Doctor never modifies anything. It only reads.
 */

import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../utils/paths";
import { SERVERS } from "../../../mcp";
import { resolveProvider } from "../config/ai-provider.config";
import { getActiveMode } from "../config/agent-policy";

export type CheckLevel = "ok" | "warn" | "fail";

export interface DoctorCheck {
    id: string;
    level: CheckLevel;
    message: string;
    hint?: string;
}

export interface DoctorReport {
    overall: CheckLevel;
    checks: DoctorCheck[];
}

function ok(id: string, message: string): DoctorCheck { return { id, level: "ok", message }; }
function warn(id: string, message: string, hint?: string): DoctorCheck { return { id, level: "warn", message, hint }; }
function fail(id: string, message: string, hint?: string): DoctorCheck { return { id, level: "fail", message, hint }; }

function existsRel(rel: string): boolean {
    return fs.existsSync(path.resolve(REPO_ROOT, rel));
}

function readRel(rel: string): string | null {
    const abs = path.resolve(REPO_ROOT, rel);
    return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

function checkNode(): DoctorCheck {
    const major = Number(process.versions.node.split(".")[0]);
    if (major >= 20) return ok("node-version", `Node.js ${process.versions.node} (≥ 20 required for tsx)`);
    return fail("node-version", `Node.js ${process.versions.node} is too old (need ≥ 20).`, "Install Node 20 LTS or newer.");
}

function checkDeps(): DoctorCheck {
    if (!existsRel("node_modules")) {
        return fail("deps", "node_modules missing.", "Run `yarn install`.");
    }
    const expected = ["@playwright/test", "allure-playwright", "tsx", "chokidar", "concurrently"];
    const missing = expected.filter(p => !existsRel(`node_modules/${p}`));
    if (missing.length > 0) {
        return fail("deps", `missing packages: ${missing.join(", ")}`, "Run `yarn install`.");
    }
    return ok("deps", `core deps installed (${expected.length} packages checked)`);
}

function checkPlaywrightBrowsers(): DoctorCheck {
    // Playwright's default browser cache is under ~/Library/Caches/ms-playwright (mac)
    // or %USERPROFILE%\AppData\Local\ms-playwright (win) or ~/.cache/ms-playwright (linux).
    // We use a heuristic: any of those paths existing means at least one browser was downloaded.
    const cands = [
        process.env.PLAYWRIGHT_BROWSERS_PATH,
        process.platform === "darwin" ? `${process.env.HOME}/Library/Caches/ms-playwright` : null,
        process.platform === "linux" ? `${process.env.HOME}/.cache/ms-playwright` : null,
        process.platform === "win32" ? `${process.env.LOCALAPPDATA}\\ms-playwright` : null,
    ].filter((p): p is string => !!p);
    const hit = cands.find(p => fs.existsSync(p));
    if (hit) return ok("playwright-browsers", `Playwright browser cache present at ${hit}`);
    return warn(
        "playwright-browsers",
        "Playwright browser binaries not found.",
        "Run `npx playwright install --with-deps` once per workstation.",
    );
}

function checkAuthStub(): DoctorCheck {
    const src = readRel("helper/authenticate-set-up.ts");
    if (!src) return fail("auth-setup", "helper/authenticate-set-up.ts missing.", "Restore it from the framework starter.");
    // The framework ships a clearly-marked TODO block — if it's still there, the team hasn't filled in login.
    if (/TODO[\s\S]{0,500}replace.*sign-in/i.test(src) || /your\.app\.example\.com|signin\.example\.com/.test(src)) {
        return warn(
            "auth-setup",
            "helper/authenticate-set-up.ts looks like the unfilled starter (still references example URLs).",
            "Replace the TODO block with your product's actual sign-in flow before running tests.",
        );
    }
    return ok("auth-setup", "helper/authenticate-set-up.ts customized");
}

function checkEnv(): DoctorCheck[] {
    const checks: DoctorCheck[] = [];
    const envName = process.env.test_env ?? "test";
    const envFile = `environments/.env.${envName}`;
    if (!existsRel(envFile)) {
        checks.push(fail(
            "env-file",
            `${envFile} missing (test_env=${envName}).`,
            `Run \`yarn aiqa:init-project --env=${envName} --app-url=https://...\` or copy environments/.env.example by hand.`,
        ));
    } else {
        const content = readRel(envFile) ?? "";
        const missing = ["APP_URL"].filter(k => !new RegExp(`^${k}\\s*=`, "m").test(content));
        if (missing.length > 0) {
            checks.push(fail("env-vars", `${envFile} missing keys: ${missing.join(", ")}`, "Add the missing entries."));
        } else {
            checks.push(ok("env-vars", `${envFile} present with APP_URL`));
        }
    }
    // Jira is optional — warn only if .env.jira is missing AND any spec calls setJiraStory.
    const jiraFile = "environments/.env.jira";
    const specsUseJira = existsRel("tests") && fs.readdirSync(path.resolve(REPO_ROOT, "tests")).some(d => {
        const dir = path.resolve(REPO_ROOT, "tests", d);
        if (!fs.statSync(dir).isDirectory()) return false;
        return fs.readdirSync(dir).some(f => f.endsWith(".spec.ts") && /setJiraStory/.test(readRel(path.join("tests", d, f)) ?? ""));
    });
    if (!existsRel(jiraFile) && specsUseJira) {
        checks.push(warn(
            "jira-env",
            "specs call setJiraStory(...) but environments/.env.jira is missing.",
            "Copy environments/.env.jira.example to .env.jira and fill in the Jira API token, OR remove setJiraStory calls.",
        ));
    } else if (existsRel(jiraFile)) {
        checks.push(ok("jira-env", "environments/.env.jira present"));
    }
    return checks;
}

function checkTags(): DoctorCheck {
    const src = readRel("helper/test-tags.ts") ?? "";
    const featureLines = src.match(/^\s+[A-Z_]+\s*:\s*["']@[a-z0-9-]+/gm) ?? [];
    // The starter ships 6 tags. More than 6 = team added feature tags.
    if (featureLines.length > 6) {
        return ok("tag-catalogue", `helper/test-tags.ts has ${featureLines.length} tags (${featureLines.length - 6} feature tag(s) added)`);
    }
    return warn(
        "tag-catalogue",
        "helper/test-tags.ts has only the starter tags (REGRESSION, SMOKE, P0-P2, BUG).",
        "Add a feature tag per Jira label so `yarn aiqa:run-regression --grep=@<feature>` can target subsets.",
    );
}

function checkTests(): DoctorCheck {
    if (!existsRel("tests")) return fail("tests-dir", "tests/ directory missing.");
    const dirs = fs.readdirSync(path.resolve(REPO_ROOT, "tests"), { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name !== "sample");
    if (dirs.length === 0) {
        return warn(
            "test-coverage",
            "only tests/sample/ exists — no real feature specs yet.",
            "Generate code from your manual test cases: `yarn aiqa:generate-automation --test-cases=<file>`.",
        );
    }
    return ok("test-coverage", `tests/ has ${dirs.length} feature dir(s) beyond the sample`);
}

function checkMcpServers(): DoctorCheck {
    const total = SERVERS.reduce((n, s) => n + s.server.listTools().length, 0);
    return ok("mcp-servers", `${SERVERS.length} MCP servers loaded (${total} tools)`);
}

function checkProvider(): DoctorCheck {
    const p = resolveProvider();
    const mode = getActiveMode();
    if (p.name === "noop") {
        return ok("provider", `provider=noop, mode=${mode} — deterministic only (no LLM calls). ${p.reason}`);
    }
    return ok("provider", `provider=${p.name} (model=${p.model}), mode=${mode}`);
}

function checkGitignore(): DoctorCheck {
    const gi = readRel(".gitignore") ?? "";
    const must = [".auth/", "node_modules/", "/test-output/"];
    const missing = must.filter(p => !gi.includes(p));
    if (missing.length > 0) {
        return fail("gitignore", `missing .gitignore entries: ${missing.join(", ")}`, "Restore them — they protect secrets / build artifacts.");
    }
    return ok("gitignore", ".gitignore covers .auth/, node_modules/, test-output/");
}

export function runDoctor(): DoctorReport {
    const checks: DoctorCheck[] = [];
    checks.push(checkNode());
    checks.push(checkDeps());
    checks.push(checkPlaywrightBrowsers());
    checks.push(checkAuthStub());
    checks.push(...checkEnv());
    checks.push(checkTags());
    checks.push(checkTests());
    checks.push(checkMcpServers());
    checks.push(checkProvider());
    checks.push(checkGitignore());

    const overall: CheckLevel = checks.some(c => c.level === "fail") ? "fail"
        : checks.some(c => c.level === "warn") ? "warn"
        : "ok";
    return { overall, checks };
}

export function formatDoctorReport(r: DoctorReport): string {
    const lines: string[] = [];
    lines.push("AI QA Agent — doctor\n");
    for (const c of r.checks) {
        const sym = c.level === "ok" ? "  ✓" : c.level === "warn" ? "  ⚠" : "  ✗";
        lines.push(`${sym} ${c.id.padEnd(22)} ${c.message}`);
        if (c.hint) lines.push(`${" ".repeat(26)} → ${c.hint}`);
    }
    const overallSym = r.overall === "ok" ? "✅" : r.overall === "warn" ? "⚠️" : "❌";
    lines.push("");
    lines.push(`${overallSym}  overall: ${r.overall}`);
    return lines.join("\n");
}
