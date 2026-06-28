/**
 * Severity policy — when a failure is considered critical and a notification
 * should be sent. Used by `watchers/critical-pattern-detector.ts` and
 * `notifications/notification-orchestrator.ts`.
 *
 * Source: prompts/00-master-build-prompt.md + policies/severity-policy.md.
 */

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export const CRITICAL_TRIGGERS = [
    "smoke_test_failed",
    "login_blocked",
    "checkout_or_payment_blocked",
    "create_order_failed",
    "data_loss_risk",
    "permission_or_security_issue",
    "api_5xx_on_core_flow",
    "more_than_30_percent_tests_failed_same_reason",
    "production_environment_down",
    "storage_state_expired_affects_entire_suite",
] as const;

export type CriticalTrigger = typeof CRITICAL_TRIGGERS[number];

export const severityPolicy = {
    /** A diagnosis must clear this confidence to be promoted to critical. */
    minConfidenceForCritical: 0.75,
    /** Threshold for "more than 30 % of tests failed for the same reason". */
    sameReasonFailureRatio: 0.30,
    /** Minimum number of failing tests before the ratio rule activates. */
    sameReasonMinimumFailures: 3,
    /** Skip a critical alert when the failure is already known to be flaky. */
    suppressForFlakyOnly: true,
    /** Honour Playwright retries — only fire after the FINAL attempt fails. */
    requireFinalAttempt: true,
    /** Patterns matched against the normalized error message (case-insensitive). */
    api5xxPatterns: [/\b5\d{2}\b\s+(?:status|response)/i, /returned\s+5\d{2}/i, /HTTP\s+5\d{2}/i],
    loginBlockedPatterns: [/login[^\n]*(?:blocked|failed|timeout)/i, /storage.?state.*expired/i, /authentication failed/i],
    smokeTagPattern: /@smoke\b/i,
    paymentFlowPattern: /\b(checkout|payment|stripe|paypal|billing)\b/i,
    createOrderPattern: /\b(create[\s-]?order|place[\s-]?order|new[\s-]?order)\b/i,
    permissionPattern: /\b(permission|unauthorized|forbidden|access denied|403)\b/i,
} as const;
