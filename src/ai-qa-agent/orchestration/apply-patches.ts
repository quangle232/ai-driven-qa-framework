/**
 * Apply accepted patches to the real `tests/` / `page-objects/` / `test-data/`
 * paths. Idempotent + safe by default:
 *
 *   - File missing                  → CREATE (write).
 *   - File exists, identical bytes  → SKIP silently.
 *   - File exists, different bytes  → REFUSE unless `forceOverwrite`.
 *   - Path outside the allowed roots → REFUSE (defence in depth; guard
 *     already runs upstream but we never trust a single check).
 *
 * Returns a structured summary the CLI prints so the user sees what
 * actually changed before `git add`.
 */

import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../utils/paths";
import type { FilePatch } from "../agents/automation-builder-agent";

// core/test-tags.ts is the ONE core file patches may touch (additive tag
// entries per the tag == Jira label convention); everything else in core/
// stays off-limits via patch-guard.
const ALLOWED_ROOTS = ["tests/", "page-objects/", "test-data/", "core/test-tags.ts"];

export interface ApplyAction {
    path: string;
    action: "created" | "updated" | "skipped_identical" | "refused_conflict" | "refused_outside_roots";
    reason?: string;
}

export interface ApplyResult {
    actions: ApplyAction[];
    created: number;
    updated: number;
    skippedIdentical: number;
    refused: number;
}

export interface ApplyOptions {
    forceOverwrite?: boolean;
    /** Dry-run: compute the result but don't touch disk. */
    dryRun?: boolean;
}

export function applyPatches(patches: FilePatch[], opts: ApplyOptions = {}): ApplyResult {
    const actions: ApplyAction[] = [];

    for (const p of patches) {
        const norm = p.path.replace(/^[./\\]+/, "");
        if (!ALLOWED_ROOTS.some(r => norm.startsWith(r))) {
            actions.push({ path: norm, action: "refused_outside_roots", reason: "not under tests/, page-objects/, or test-data/" });
            continue;
        }

        const abs = path.resolve(REPO_ROOT, norm);
        // Path-traversal guard: resolved path must remain inside the repo.
        if (!abs.startsWith(REPO_ROOT + path.sep) && abs !== REPO_ROOT) {
            actions.push({ path: norm, action: "refused_outside_roots", reason: "path resolves outside the repo root" });
            continue;
        }

        if (!fs.existsSync(abs)) {
            if (!opts.dryRun) {
                fs.mkdirSync(path.dirname(abs), { recursive: true });
                fs.writeFileSync(abs, p.content);
            }
            actions.push({ path: norm, action: "created" });
            continue;
        }

        const existing = fs.readFileSync(abs, "utf8");
        if (existing === p.content) {
            actions.push({ path: norm, action: "skipped_identical" });
            continue;
        }

        if (!opts.forceOverwrite) {
            actions.push({ path: norm, action: "refused_conflict", reason: "file already exists with different content — re-run with --force-overwrite to replace" });
            continue;
        }

        if (!opts.dryRun) fs.writeFileSync(abs, p.content);
        actions.push({ path: norm, action: "updated" });
    }

    return {
        actions,
        created: actions.filter(a => a.action === "created").length,
        updated: actions.filter(a => a.action === "updated").length,
        skippedIdentical: actions.filter(a => a.action === "skipped_identical").length,
        refused: actions.filter(a => a.action === "refused_conflict" || a.action === "refused_outside_roots").length,
    };
}

export function formatApplySummary(result: ApplyResult): string {
    const lines: string[] = [];
    lines.push(`created=${result.created} updated=${result.updated} skipped=${result.skippedIdentical} refused=${result.refused}`);
    for (const a of result.actions) {
        const sym = a.action === "created" ? "  ✓" : a.action === "updated" ? "  ⟳" : a.action === "skipped_identical" ? "  =" : "  ✗";
        const note = a.reason ? ` — ${a.reason}` : "";
        lines.push(`${sym} ${a.action.padEnd(22)} ${a.path}${note}`);
    }
    return lines.join("\n");
}
