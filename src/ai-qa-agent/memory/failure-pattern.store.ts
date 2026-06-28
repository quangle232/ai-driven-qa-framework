/**
 * Failure patterns — fingerprints with the team's resolution history.
 *
 * When the same cluster fingerprint appears across runs, this store lets
 * the diagnosis agent jump straight to "we've seen this before — last time
 * the cause was X and the fix was Y".
 */

import { appendRecord, loadDoc, saveDoc } from "./store-base";

export const FAILURE_PATTERN_SCHEMA = "aiqa.failure-patterns.v1";

export interface FailurePattern {
    fingerprint: string;
    coarseClass: string;
    representativeMessage: string;
    /** Times this fingerprint has been observed across runs. */
    occurrences: number;
    firstSeenAt: string;
    lastSeenAt: string;
    /** Team annotation — written by humans / Claude Code. */
    rootCauseSummary?: string;
    fixHistory?: Array<{ atRunId: string; resolutionSummary: string; commit?: string }>;
}

export function listFailurePatterns(): FailurePattern[] {
    return loadDoc<FailurePattern>("failure-patterns", FAILURE_PATTERN_SCHEMA).records;
}

export function findFailurePattern(fingerprint: string): FailurePattern | undefined {
    return listFailurePatterns().find(p => p.fingerprint === fingerprint);
}

export function observeFailurePattern(input: {
    fingerprint: string;
    coarseClass: string;
    representativeMessage: string;
}): FailurePattern {
    const doc = loadDoc<FailurePattern>("failure-patterns", FAILURE_PATTERN_SCHEMA);
    const existing = doc.records.find(p => p.fingerprint === input.fingerprint);
    const now = new Date().toISOString();
    if (existing) {
        existing.occurrences += 1;
        existing.lastSeenAt = now;
        saveDoc("failure-patterns", doc);
        return existing;
    }
    const fresh: FailurePattern = {
        ...input,
        occurrences: 1,
        firstSeenAt: now,
        lastSeenAt: now,
    };
    appendRecord("failure-patterns", FAILURE_PATTERN_SCHEMA, fresh);
    return fresh;
}

export function annotatePattern(fingerprint: string, annotation: { rootCauseSummary?: string; resolutionSummary?: string; runId?: string; commit?: string }): FailurePattern | null {
    const doc = loadDoc<FailurePattern>("failure-patterns", FAILURE_PATTERN_SCHEMA);
    const p = doc.records.find(r => r.fingerprint === fingerprint);
    if (!p) return null;
    if (annotation.rootCauseSummary) p.rootCauseSummary = annotation.rootCauseSummary;
    if (annotation.resolutionSummary) {
        p.fixHistory = p.fixHistory ?? [];
        p.fixHistory.push({
            atRunId: annotation.runId ?? "unknown",
            resolutionSummary: annotation.resolutionSummary,
            commit: annotation.commit,
        });
    }
    saveDoc("failure-patterns", doc);
    return p;
}
