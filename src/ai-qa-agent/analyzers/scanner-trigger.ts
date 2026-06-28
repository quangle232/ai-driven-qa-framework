/**
 * Scanner-trigger gate — decides when the deterministic watcher is allowed
 * to wake an LLM agent. Per master prompt §"Scanner/Watcher rule":
 *
 *   LLM agents are triggered only when:
 *     - run completes
 *     - confirmed failure exists after retry result
 *     - global/critical failure pattern appears
 *     - user explicitly requests analysis
 *
 * Each trigger has a `fingerprint` so the same cluster never wakes the LLM
 * twice in the same run.
 */

import type { FailureEvent } from "../schemas/failure-event.schema";
import { detectCriticalEvents, type CriticalEvent } from "../watchers/critical-pattern-detector";
import { groupFailures, type FailureCluster } from "./failure-grouper";

export type TriggerReason =
    | "run_complete"
    | "confirmed_failure_after_retry"
    | "critical_pattern_detected"
    | "user_requested";

export interface ScannerTrigger {
    reason: TriggerReason;
    fingerprint: string;
    cluster: FailureCluster | null;
    critical: CriticalEvent | null;
}

export interface ScannerState {
    /** Fingerprints already sent to the LLM in this run. */
    sentFingerprints: Set<string>;
}

export function newScannerState(): ScannerState {
    return { sentFingerprints: new Set() };
}

export function computeTriggers(opts: {
    events: FailureEvent[];
    state: ScannerState;
    /** When true, treat every confirmed final-attempt failure as a trigger. */
    runComplete: boolean;
    /** When true, skip the "must be confirmed" check (e.g. user explicit `--force`). */
    userRequested?: boolean;
}): ScannerTrigger[] {
    const triggers: ScannerTrigger[] = [];
    const finals = opts.events.filter(e => e.isFinalFailure);
    const clusters = groupFailures(finals);
    const criticals = detectCriticalEvents(opts.events);

    // 1) Critical patterns always trigger (smoke fail, 5xx, login blocked, ≥30 % same reason)
    for (const c of criticals) {
        if (opts.state.sentFingerprints.has(c.fingerprint)) continue;
        const cluster = clusters.find(cl => cl.events.some(e => c.affectedTestIds.includes(e.testId))) ?? null;
        triggers.push({
            reason: "critical_pattern_detected",
            fingerprint: c.fingerprint,
            cluster,
            critical: c,
        });
    }

    // 2) Confirmed-after-retry failures trigger only when the run is finished
    //    (matches the master prompt: "It must not call Claude/LLM on every file change").
    if (opts.runComplete || opts.userRequested) {
        for (const cl of clusters) {
            if (opts.state.sentFingerprints.has(cl.fingerprint)) continue;
            triggers.push({
                reason: opts.userRequested ? "user_requested" : (opts.runComplete ? "run_complete" : "confirmed_failure_after_retry"),
                fingerprint: cl.fingerprint,
                cluster: cl,
                critical: null,
            });
        }
    }

    return triggers;
}

export function markTriggerHandled(state: ScannerState, trigger: ScannerTrigger): void {
    state.sentFingerprints.add(trigger.fingerprint);
}
