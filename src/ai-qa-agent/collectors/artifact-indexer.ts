/**
 * Pull the trace / video / screenshot paths out of a Playwright result's
 * `attachments[]`. Playwright writes them under `test-results/<...>/`.
 *
 * Used by `failure-summary-builder.ts` to populate the `artifacts` block on
 * each `FailureEvent`.
 */

import path from "node:path";
import { REPO_ROOT } from "../utils/paths";
import type { PwAttachment } from "./playwright-report-reader";

export interface ArtifactPaths {
    screenshot: string | null;
    trace: string | null;
    video: string | null;
    allureResult: string | null;
}

function findByName(attachments: PwAttachment[], regex: RegExp): string | null {
    const match = attachments.find(a => regex.test(a.name) || regex.test(a.contentType ?? ""));
    if (!match?.path) return null;
    return path.isAbsolute(match.path) ? path.relative(REPO_ROOT, match.path) : match.path;
}

export function indexArtifacts(attachments: PwAttachment[] = []): ArtifactPaths {
    return {
        screenshot: findByName(attachments, /screenshot|image\/png|image\/jpeg/i),
        trace: findByName(attachments, /trace/i),
        video: findByName(attachments, /video|webm|\.mp4$/i),
        allureResult: null,   // filled in by failure-summary-builder when matched
    };
}
