/**
 * Allure result reader — best-effort index of `test-output/allure-results/`.
 *
 * Allure writes one JSON file per test attempt (`*-result.json`) plus
 * attachments. This reader only indexes file paths so the diagnosis writer
 * can link to them; it does NOT parse the full Allure result body. Heavy
 * parsing is reserved for Phase 4+.
 */

import fs from "node:fs";
import path from "node:path";
import { ALLURE_RESULTS_DIR } from "../utils/paths";

export interface AllureIndexEntry {
    file: string;             // absolute path
    name: string | null;      // test name from the json (best-effort)
    historyId: string | null; // useful for cross-run linkage
    fullName: string | null;
}

export function readAllureIndex(dir = ALLURE_RESULTS_DIR): AllureIndexEntry[] {
    if (!fs.existsSync(dir)) return [];
    const out: AllureIndexEntry[] = [];
    for (const entry of fs.readdirSync(dir)) {
        if (!entry.endsWith("-result.json")) continue;
        const abs = path.join(dir, entry);
        try {
            const data = JSON.parse(fs.readFileSync(abs, "utf8"));
            out.push({
                file: abs,
                name: typeof data?.name === "string" ? data.name : null,
                historyId: typeof data?.historyId === "string" ? data.historyId : null,
                fullName: typeof data?.fullName === "string" ? data.fullName : null,
            });
        } catch {
            // Allure files in flight may be half-written. Skip silently.
        }
    }
    return out;
}

/** Match the closest Allure result to a normalized failure event. Best-effort. */
export function findAllureForTitle(index: AllureIndexEntry[], title: string): AllureIndexEntry | null {
    return index.find(e => e.name === title) ?? index.find(e => e.fullName?.includes(title) ?? false) ?? null;
}
