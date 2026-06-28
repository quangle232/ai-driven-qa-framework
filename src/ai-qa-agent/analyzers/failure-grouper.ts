/**
 * Cluster failures BEFORE calling the LLM. Identical errors share an LLM
 * call — this is the single largest token-saving in the framework when a
 * regression breaks 30 tests for the same reason.
 *
 * Grouping key (in priority order):
 *   1. Same normalized error message + same classification + same project.
 *   2. Same top stack frame + same project.
 *   3. Same file + same classification.
 *
 * Normalization strips:
 *   - timestamps / dates / uuids
 *   - line-number suffixes (`:42:9`)
 *   - data-test-id / data-zcqa attribute values inside `[...]` selectors
 *   - long quoted strings replaced with `<str>`
 */

import type { FailureEvent } from "../schemas/failure-event.schema";

export interface FailureCluster {
    fingerprint: string;
    /** Coarse classification, deterministic — refined later by the LLM. */
    coarseClass: "locator" | "timeout" | "assertion" | "api" | "auth" | "test_data" | "environment" | "unknown";
    representativeMessage: string;
    /** Events in this cluster — first is the representative. */
    events: FailureEvent[];
}

const ATTR_RX = /\[(?:data-(?:zcqa|test-id|id|title)|aria-label|role)="[^"]+"\]/g;
const QUOTED_RX = /"[^"\n]{2,}"/g;
const LINE_NUM_RX = /:\d+(?::\d+)?\b/g;
const UUID_RX = /\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi;
const HEX_RX = /\b0x[0-9a-f]{4,}\b/gi;
const ISO_DATE_RX = /\b\d{4}-\d{2}-\d{2}T[\d:.]+Z?\b/g;
const TIMING_RX = /\b(?:within|after|for) \d+(?:\.\d+)?\s*(?:ms|s|seconds?|minutes?)\b/gi;

function normalize(msg: string): string {
    return (msg ?? "")
        .replace(ISO_DATE_RX, "<date>")
        .replace(UUID_RX, "<uuid>")
        .replace(HEX_RX, "<hex>")
        .replace(LINE_NUM_RX, ":<n>")
        .replace(ATTR_RX, "[attr]")
        .replace(QUOTED_RX, "<str>")
        .replace(TIMING_RX, "<timing>")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240);
}

function coarseClassify(msg: string): FailureCluster["coarseClass"] {
    const m = msg.toLowerCase();
    if (/timeout|exceeded.*ms/.test(m)) return "timeout";
    if (/not (?:visible|attached|enabled)|locator|selector|no element/.test(m)) return "locator";
    if (/expect|assertion|tobe|toequal|tohavetext/.test(m)) return "assertion";
    if (/\b5\d{2}\b|http\s+5\d{2}|network error|econnref|enotfound/.test(m)) return "api";
    if (/auth|login|storage.?state|unauthor/.test(m)) return "auth";
    if (/environment|env var|missing env|unreachable/.test(m)) return "environment";
    if (/fixture|test data|undefined.*data/.test(m)) return "test_data";
    return "unknown";
}

function topFrame(stack: string[]): string {
    const frame = stack[0] ?? "";
    return frame.replace(LINE_NUM_RX, ":<n>");
}

export function groupFailures(events: FailureEvent[]): FailureCluster[] {
    const buckets = new Map<string, FailureEvent[]>();
    for (const ev of events) {
        if (!ev.isFinalFailure) continue;
        const normMsg = normalize(ev.error.message);
        const cls = coarseClassify(ev.error.message);
        const key = `${cls}|${ev.project}|${normMsg}|${topFrame(ev.error.stackTop)}`;
        const list = buckets.get(key) ?? [];
        list.push(ev);
        buckets.set(key, list);
    }
    const clusters: FailureCluster[] = [];
    for (const [key, list] of buckets) {
        clusters.push({
            fingerprint: key,
            coarseClass: coarseClassify(list[0].error.message),
            representativeMessage: list[0].error.message,
            events: list,
        });
    }
    // Sort largest cluster first — most important to diagnose, biggest token savings.
    clusters.sort((a, b) => b.events.length - a.events.length);
    return clusters;
}
