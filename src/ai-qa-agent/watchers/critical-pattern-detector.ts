/**
 * Deterministic critical-pattern detector.
 *
 * Pure rule-based — operates on `FailureEvent[]` and never calls an LLM.
 * Returns zero or more `CriticalEvent`s suitable for the notification layer.
 * Trigger list comes from `config/severity-policy.ts` and the master prompt.
 */

import { severityPolicy, type CriticalTrigger } from "../config/severity-policy";
import type { FailureEvent } from "../schemas/failure-event.schema";

export interface CriticalEvent {
    trigger: CriticalTrigger;
    severity: "critical";
    summary: string;
    affectedTestIds: string[];
    evidence: string[];
    /** Stable fingerprint for once-per-run dedupe. */
    fingerprint: string;
}

function matchesAny(patterns: readonly RegExp[], text: string): boolean {
    return patterns.some(rx => rx.test(text));
}

function smokeFailures(events: FailureEvent[]): FailureEvent[] {
    return events.filter(e => e.isFinalFailure && e.tags.some(t => severityPolicy.smokeTagPattern.test(t)));
}

function loginFailures(events: FailureEvent[]): FailureEvent[] {
    return events.filter(e => e.isFinalFailure && matchesAny(severityPolicy.loginBlockedPatterns, e.error.message));
}

function api5xx(events: FailureEvent[]): FailureEvent[] {
    return events.filter(e => e.isFinalFailure && matchesAny(severityPolicy.api5xxPatterns, e.error.message));
}

function paymentFailures(events: FailureEvent[]): FailureEvent[] {
    return events.filter(e => e.isFinalFailure && (severityPolicy.paymentFlowPattern.test(e.title) || severityPolicy.paymentFlowPattern.test(e.file)));
}

function createOrderFailures(events: FailureEvent[]): FailureEvent[] {
    return events.filter(e => e.isFinalFailure && (severityPolicy.createOrderPattern.test(e.title) || severityPolicy.createOrderPattern.test(e.file)));
}

function permissionFailures(events: FailureEvent[]): FailureEvent[] {
    return events.filter(e => e.isFinalFailure && severityPolicy.permissionPattern.test(e.error.message));
}

function fingerprintFor(trigger: CriticalTrigger, ids: string[]): string {
    return `${trigger}::${ids.sort().join("|").slice(0, 200)}`;
}

function makeEvent(trigger: CriticalTrigger, evs: FailureEvent[], summary: string, extraEvidence: string[] = []): CriticalEvent {
    const ids = evs.map(e => e.testId);
    return {
        trigger,
        severity: "critical",
        summary,
        affectedTestIds: ids,
        evidence: [
            ...extraEvidence,
            ...evs.slice(0, 3).map(e => `${e.title} — ${e.error.message || "no error message"}`),
        ],
        fingerprint: fingerprintFor(trigger, ids),
    };
}

export function detectCriticalEvents(events: FailureEvent[]): CriticalEvent[] {
    const finals = events.filter(e => e.isFinalFailure);
    const out: CriticalEvent[] = [];

    const smoke = smokeFailures(finals);
    if (smoke.length > 0) out.push(makeEvent("smoke_test_failed", smoke, `${smoke.length} smoke test(s) failed on the final attempt.`));

    const logins = loginFailures(finals);
    if (logins.length > 0) out.push(makeEvent("login_blocked", logins, "Login/authentication appears blocked."));

    const apis = api5xx(finals);
    if (apis.length > 0) out.push(makeEvent("api_5xx_on_core_flow", apis, "Backend 5xx errors observed in final-attempt failures."));

    const checkouts = paymentFailures(finals);
    if (checkouts.length > 0) out.push(makeEvent("checkout_or_payment_blocked", checkouts, "Checkout / payment flow failed."));

    const orders = createOrderFailures(finals);
    if (orders.length > 0) out.push(makeEvent("create_order_failed", orders, "Create-order flow failed."));

    const perms = permissionFailures(finals);
    if (perms.length > 0) out.push(makeEvent("permission_or_security_issue", perms, "Permission / security signal in failure output."));

    // "more than 30 % of tests failed for the same reason"
    if (finals.length >= severityPolicy.sameReasonMinimumFailures) {
        const byReason = new Map<string, FailureEvent[]>();
        for (const ev of finals) {
            const reason = (ev.error.message || "no-message").slice(0, 120);
            const bucket = byReason.get(reason) ?? [];
            bucket.push(ev);
            byReason.set(reason, bucket);
        }
        const total = finals.length;
        for (const [reason, bucket] of byReason) {
            if (bucket.length / total >= severityPolicy.sameReasonFailureRatio && bucket.length >= severityPolicy.sameReasonMinimumFailures) {
                out.push(makeEvent(
                    "more_than_30_percent_tests_failed_same_reason",
                    bucket,
                    `${bucket.length}/${total} failing tests share the same error: ${reason}`,
                    [`shared error: ${reason}`],
                ));
            }
        }
    }

    return out;
}
