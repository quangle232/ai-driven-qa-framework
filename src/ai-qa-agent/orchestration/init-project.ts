/**
 * `aiqa init-project` — scaffold a fresh project on top of the framework.
 *
 * Non-destructive: refuses to overwrite existing files unless `--force` is
 * passed. Writes:
 *
 *   environments/.env.<env>           (from .env.example, with provided overrides)
 *   environments/.env.jira            (from .env.jira.example, if --jira-project)
 *   .aiqa-memory/domain-glossary.json (seed with placeholder terms)
 *
 * Then prints next-step guidance pointing at the remaining manual steps
 * (login flow, feature tags, first spec).
 */

import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../utils/paths";
import { writesAllowed } from "../memory/store-base";

export interface InitProjectOptions {
    env: string;
    appUrl?: string;
    authUrl?: string;
    jiraProject?: string;
    jiraUrl?: string;
    /** Replace existing files instead of refusing. */
    force?: boolean;
}

export interface InitAction {
    path: string;
    action: "created" | "skipped_exists" | "skipped_template_missing";
    note?: string;
}

export function initProject(opts: InitProjectOptions): InitAction[] {
    const actions: InitAction[] = [];

    // 1) environments/.env.<env>
    const envFile = path.resolve(REPO_ROOT, "environments", `.env.${opts.env}`);
    const envTemplate = path.resolve(REPO_ROOT, "environments", ".env.example");
    if (fs.existsSync(envFile) && !opts.force) {
        actions.push({ path: relPath(envFile), action: "skipped_exists", note: "already exists; pass --force to overwrite" });
    } else if (!fs.existsSync(envTemplate)) {
        actions.push({ path: relPath(envFile), action: "skipped_template_missing", note: "environments/.env.example missing" });
    } else {
        const tpl = fs.readFileSync(envTemplate, "utf8");
        const filled = fillEnv(tpl, {
            APP_URL: opts.appUrl,
            AUTH_URL: opts.authUrl,
        });
        fs.mkdirSync(path.dirname(envFile), { recursive: true });
        fs.writeFileSync(envFile, filled);
        actions.push({ path: relPath(envFile), action: "created" });
    }

    // 2) environments/.env.jira (only if jira args supplied)
    if (opts.jiraProject || opts.jiraUrl) {
        const jiraFile = path.resolve(REPO_ROOT, "environments", ".env.jira");
        const jiraTemplate = path.resolve(REPO_ROOT, "environments", ".env.jira.example");
        if (fs.existsSync(jiraFile) && !opts.force) {
            actions.push({ path: relPath(jiraFile), action: "skipped_exists" });
        } else if (!fs.existsSync(jiraTemplate)) {
            actions.push({ path: relPath(jiraFile), action: "skipped_template_missing" });
        } else {
            const tpl = fs.readFileSync(jiraTemplate, "utf8");
            const filled = fillEnv(tpl, {
                JIRA_URL: opts.jiraUrl,
                JIRA_PROJECT: opts.jiraProject,
            });
            fs.writeFileSync(jiraFile, filled);
            actions.push({ path: relPath(jiraFile), action: "created" });
        }
    }

    // 3) .aiqa-memory/domain-glossary.json seed (only if writes allowed)
    const glossaryFile = path.resolve(REPO_ROOT, ".aiqa-memory", "domain-glossary.json");
    if (fs.existsSync(glossaryFile) && !opts.force) {
        actions.push({ path: relPath(glossaryFile), action: "skipped_exists" });
    } else if (!writesAllowed()) {
        actions.push({
            path: relPath(glossaryFile),
            action: "skipped_template_missing",
            note: "AIQA_ALLOW_MEMORY_WRITE not set — domain-glossary.json not seeded.",
        });
    } else {
        fs.mkdirSync(path.dirname(glossaryFile), { recursive: true });
        const seed = {
            schemaVersion: "aiqa.domain-glossary.v1",
            updatedAt: new Date().toISOString(),
            records: [
                {
                    term: "EXAMPLE-TERM",
                    plainEnglish: "Replace this with a project-specific term — e.g. 'Offer' means a draft sales document.",
                    engineeringNotes: "Optional: backend model / table name.",
                    aliases: ["alias-1", "alias-2"],
                    relatedFeatures: ["b2b", "checkout"],
                    addedAt: new Date().toISOString(),
                },
            ],
        };
        fs.writeFileSync(glossaryFile, JSON.stringify(seed, null, 2));
        actions.push({ path: relPath(glossaryFile), action: "created" });
    }

    return actions;
}

function fillEnv(template: string, overrides: Record<string, string | undefined>): string {
    let out = template;
    for (const [key, value] of Object.entries(overrides)) {
        if (!value) continue;
        // Match either `KEY=...` (live) or `# KEY=...` (commented). Replace with `KEY=<value>` (live).
        const rx = new RegExp(`(^|\\n)#?\\s*${key}\\s*=.*`, "g");
        if (rx.test(out)) {
            out = out.replace(rx, `$1${key}=${value}`);
        } else {
            out += `\n${key}=${value}\n`;
        }
    }
    return out;
}

function relPath(abs: string): string {
    return path.relative(REPO_ROOT, abs);
}

export function formatInitSummary(actions: InitAction[]): string {
    const lines: string[] = [];
    for (const a of actions) {
        const sym = a.action === "created" ? "  ✓" : "  =";
        const note = a.note ? ` — ${a.note}` : "";
        lines.push(`${sym} ${a.action.padEnd(26)} ${a.path}${note}`);
    }
    return lines.join("\n");
}

export const NEXT_STEPS_MESSAGE = [
    "",
    "Next steps (manual — the framework won't guess these for you):",
    "  1. Fill in helper/authenticate-set-up.ts with your product's sign-in flow.",
    "     (The starter ships a stub with a // TODO block.)",
    "  2. Add a feature tag per Jira label in helper/test-tags.ts — e.g. AUTH: \"@auth\".",
    "  3. Generate the first spec:",
    "       yarn aiqa:generate-automation --test-cases=path/to/test-cases.md",
    "  4. Verify the setup:",
    "       yarn aiqa:doctor",
    "  5. Run:",
    "       yarn aiqa:run-regression",
    "",
].join("\n");
