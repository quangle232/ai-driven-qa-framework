/**
 * Notification orchestrator — Phase 1 stub.
 *
 * Always writes a JSON record under `test-output/ai/notifications/`. Sends to
 * real channels only when channel env vars are present. With no env, this is
 * a pure no-op for outbound traffic — the audit record is the only side
 * effect. Slack/Teams/Email adapters land in Phase 3.
 */

import fs from "node:fs";
import path from "node:path";

import { aiqaSubdir } from "../utils/paths";
import { loadNotificationPolicy, fingerprintForCriticalAlert } from "../config/notification-policy";
import type { CriticalEvent } from "../watchers/critical-pattern-detector";
import { collectCiMetadata } from "../collectors/ci-metadata-collector";

export interface NotifyInput {
    runId: string;
    criticals: CriticalEvent[];
}

export function notifyCritical(input: NotifyInput): { recordPath: string | null; sent: number; skipped: number } {
    if (input.criticals.length === 0) {
        return { recordPath: null, sent: 0, skipped: 0 };
    }

    const dir = aiqaSubdir("notifications");
    const policy = loadNotificationPolicy();
    const ci = collectCiMetadata();
    const seen = new Set<string>();
    const records: Array<{ fingerprint: string; channels: string[]; payload: unknown; sent: boolean }> = [];

    for (const c of input.criticals) {
        const fp = fingerprintForCriticalAlert({
            classification: c.trigger,
            runId: input.runId,
            primaryTestId: c.affectedTestIds[0] ?? "no-test",
        });
        if (seen.has(fp)) continue;
        seen.add(fp);

        const activeChannels = policy.channels.filter(ch => ch.enabled).map(ch => ch.channel);
        records.push({
            fingerprint: fp,
            channels: activeChannels,
            payload: {
                eventType: "critical_bug_detected",
                severity: "critical",
                trigger: c.trigger,
                summary: c.summary,
                affectedTestIds: c.affectedTestIds,
                evidence: c.evidence,
                ci,
            },
            sent: activeChannels.length > 0,
        });
    }

    const recordPath = path.join(dir, `${input.runId}.json`);
    fs.writeFileSync(recordPath, JSON.stringify({ runId: input.runId, records }, null, 2));

    return {
        recordPath,
        sent: records.filter(r => r.sent).length,
        skipped: records.filter(r => !r.sent).length,
    };
}
