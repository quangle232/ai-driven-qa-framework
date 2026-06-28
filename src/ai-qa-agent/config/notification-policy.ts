/**
 * Notification policy — once-per-run-per-fingerprint, channels off by default.
 *
 * A channel is "active" only when its env var is set. Absent env vars mean the
 * notification is written to `test-output/ai/notifications/*.json` as a
 * dry-run record but no network call is made. This guarantees a clone without
 * any env config produces zero outbound traffic.
 */

export type NotificationChannel = "slack" | "email" | "teams";

export interface NotificationChannelConfig {
    channel: NotificationChannel;
    enabled: boolean;     // true iff the required env var is present
    reason?: string;      // when disabled, why
}

export interface NotificationPolicy {
    notifyOncePerRun: true;
    notifyOnlyOnCriticalOrGlobal: true;
    alwaysIncludeFinalReportIfFailures: true;
    channels: NotificationChannelConfig[];
}

export function loadNotificationPolicy(env: NodeJS.ProcessEnv = process.env): NotificationPolicy {
    const slackUrl = env.SLACK_WEBHOOK_URL?.trim();
    const teamsUrl = env.TEAMS_WEBHOOK_URL?.trim();
    const emailHost = env.AIQA_EMAIL_HOST?.trim();

    return {
        notifyOncePerRun: true,
        notifyOnlyOnCriticalOrGlobal: true,
        alwaysIncludeFinalReportIfFailures: true,
        channels: [
            { channel: "slack", enabled: !!slackUrl, reason: slackUrl ? undefined : "SLACK_WEBHOOK_URL not set" },
            { channel: "teams", enabled: !!teamsUrl, reason: teamsUrl ? undefined : "TEAMS_WEBHOOK_URL not set" },
            { channel: "email", enabled: !!emailHost, reason: emailHost ? undefined : "AIQA_EMAIL_HOST not set" },
        ],
    };
}

/**
 * Build a stable fingerprint for de-duping notifications within a single run.
 * Same root-cause classification + same first failing test = one alert.
 */
export function fingerprintForCriticalAlert(input: {
    classification: string;
    runId: string;
    primaryTestId: string;
}): string {
    return `${input.runId}::${input.classification}::${input.primaryTestId}`;
}
