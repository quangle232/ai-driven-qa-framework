/**
 * Known issues — team-curated bugs / quirks that explain why a test fails.
 * Lets the diagnosis agent (or Claude Code) link a failure to a known root
 * cause instead of re-deriving it every run.
 */

import { appendRecord, loadDoc } from "./store-base";

export const KNOWN_ISSUES_SCHEMA = "aiqa.known-issues.v1";

export interface KnownIssue {
    id: string;                 // e.g. "KI-12"
    title: string;
    description: string;
    /** Features / tags / patterns this issue affects. */
    affects: { features?: string[]; tagsContains?: string[]; errorContains?: string };
    /** "open" — still bites. "mitigated" — workaround exists. "fixed" — keep for trend analysis. */
    status: "open" | "mitigated" | "fixed";
    jiraKey?: string;
    addedAt: string;
}

export function listKnownIssues(): KnownIssue[] {
    return loadDoc<KnownIssue>("known-issues", KNOWN_ISSUES_SCHEMA).records;
}

export function addKnownIssue(input: Omit<KnownIssue, "id" | "addedAt"> & { id?: string }): KnownIssue {
    const id = input.id ?? `KI-${Date.now().toString(36)}`;
    const record: KnownIssue = { ...input, id, addedAt: new Date().toISOString() };
    appendRecord("known-issues", KNOWN_ISSUES_SCHEMA, record);
    return record;
}

/** Find issues that plausibly match a failure (title text / file / tags). */
export function matchKnownIssues(input: {
    title: string;
    file: string;
    errorMessage: string;
    tags: string[];
}): KnownIssue[] {
    const all = listKnownIssues().filter(i => i.status !== "fixed");
    const feat = input.file.match(/^tests\/([^/]+)\//)?.[1] ?? "";
    return all.filter(ki => {
        const featOk = !ki.affects.features?.length || ki.affects.features.includes(feat);
        const tagOk = !ki.affects.tagsContains?.length || ki.affects.tagsContains.some(t => input.tags.some(it => it.includes(t)));
        const errOk = !ki.affects.errorContains || input.errorMessage.includes(ki.affects.errorContains);
        return featOk && tagOk && errOk;
    });
}
