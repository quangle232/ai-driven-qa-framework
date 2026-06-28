/**
 * Standalone guard runner. Takes a list of files (or globs), reads them off
 * disk, wraps each as a `FilePatch` with `kind: "update"`, and pushes them
 * through `analyzers/patch-guard.ts`.
 *
 * This is the safety net Claude Code uses to verify code IT generated —
 * since in Mode A the LLM agent never runs, the guard would otherwise be
 * unreachable. Now you can run:
 *
 *   yarn aiqa:guard tests/login/login.spec.ts page-objects/login/login-page.ts
 *
 * to get an immediate accept/reject verdict per file.
 */

import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../utils/paths";
import { guardPatches, type GuardViolation } from "../analyzers/patch-guard";
import type { FilePatch } from "../agents/automation-builder-agent";

export interface GuardRunResult {
    files: string[];
    accepted: FilePatch[];
    rejected: GuardViolation[];
}

export function runGuardOnFiles(files: string[]): GuardRunResult {
    const patches: FilePatch[] = [];
    const missing: string[] = [];

    for (const f of files) {
        const norm = f.replace(/^[./\\]+/, "");
        const abs = path.resolve(REPO_ROOT, norm);
        if (!fs.existsSync(abs)) { missing.push(norm); continue; }
        patches.push({
            path: norm,
            kind: "update",
            content: fs.readFileSync(abs, "utf8"),
            rationale: "standalone guard check",
        });
    }

    const { accepted, rejected } = guardPatches(patches);
    if (missing.length > 0) {
        for (const m of missing) {
            rejected.push({
                patch: { path: m, kind: "update", content: "", rationale: "" },
                reason: "file not found",
            });
        }
    }

    return { files: patches.map(p => p.path), accepted, rejected };
}

/** When no file list is provided, scan every `tests/**\/*.spec.ts` + `page-objects/**\/*-page.ts`. */
export function discoverAllSourceFiles(): string[] {
    const out: string[] = [];
    const walk = (root: string, predicate: (n: string) => boolean) => {
        const abs = path.resolve(REPO_ROOT, root);
        if (!fs.existsSync(abs)) return;
        const stack: string[] = [abs];
        while (stack.length > 0) {
            const dir = stack.pop()!;
            for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, ent.name);
                if (ent.isDirectory()) {
                    if (ent.name === "node_modules" || ent.name.startsWith(".")) continue;
                    stack.push(full);
                } else if (predicate(ent.name)) {
                    out.push(path.relative(REPO_ROOT, full));
                }
            }
        }
    };
    walk("tests", n => n.endsWith(".spec.ts"));
    walk("page-objects", n => n.endsWith("-page.ts"));
    return out.sort();
}
