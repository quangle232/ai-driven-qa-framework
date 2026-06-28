/**
 * Flaky history — track tests that have failed-then-passed-on-retry.
 * Updated automatically by `aiqa:collect` (Phase 6 — for now writes are
 * tool-driven). Used by the diagnosis agent to mark "this test has a
 * flakiness history, lower the confidence on a new flake classification".
 */

import { appendRecord, loadDoc, saveDoc, type MemoryDoc } from "./store-base";

export const FLAKY_HISTORY_SCHEMA = "aiqa.flaky-history.v1";

export interface FlakyRecord {
    testId: string;
    title: string;
    file: string;
    flakeCount: number;        // total flakes ever recorded
    runCount: number;          // total runs that observed this test
    lastFlakeAt: string | null;
    lastRunAt: string;
}

export function listFlakyHistory(): FlakyRecord[] {
    return loadDoc<FlakyRecord>("flaky-history", FLAKY_HISTORY_SCHEMA).records;
}

export function getFlakyRate(testId: string): { flakeCount: number; runCount: number; rate: number } {
    const rec = listFlakyHistory().find(r => r.testId === testId);
    if (!rec || rec.runCount === 0) return { flakeCount: 0, runCount: 0, rate: 0 };
    return { flakeCount: rec.flakeCount, runCount: rec.runCount, rate: rec.flakeCount / rec.runCount };
}

export function recordFlakeObservation(input: {
    testId: string;
    title: string;
    file: string;
    flakedThisRun: boolean;
}): FlakyRecord {
    const doc = loadDoc<FlakyRecord>("flaky-history", FLAKY_HISTORY_SCHEMA);
    const existing = doc.records.find(r => r.testId === input.testId);
    const now = new Date().toISOString();
    if (existing) {
        existing.runCount += 1;
        existing.lastRunAt = now;
        if (input.flakedThisRun) {
            existing.flakeCount += 1;
            existing.lastFlakeAt = now;
        }
        saveDoc("flaky-history", doc);
        return existing;
    }
    const fresh: FlakyRecord = {
        testId: input.testId,
        title: input.title,
        file: input.file,
        flakeCount: input.flakedThisRun ? 1 : 0,
        runCount: 1,
        lastFlakeAt: input.flakedThisRun ? now : null,
        lastRunAt: now,
    };
    appendRecord("flaky-history", FLAKY_HISTORY_SCHEMA, fresh);
    return fresh;
}
