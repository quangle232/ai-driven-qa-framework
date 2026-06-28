/**
 * Failure Diagnosis Agent.
 *
 * Pattern: hypothesis → evidence → counter-evidence → decision → stop.
 * Token discipline:
 *   - Operates on a FailureCluster, not individual events. Identical
 *     failures share one LLM round.
 *   - Starts at context level L0 (event summary only). The reviewer asks for
 *     an escalation only when evidence is insufficient.
 *   - Hard cap from `recursivePolicy.maxRoundsByWorkflow.failureDiagnosis`.
 */

import { recursivePolicy } from "../config/recursive-policy";
import { TokenBudget } from "../context/token-budget";
import type { Provider } from "../providers";
import {
    DIAGNOSIS_SCHEMA_VERSION,
    newDiagnosis,
    type Diagnosis,
    type DiagnosisClassification,
} from "../schemas/diagnosis.schema";
import { RECURSIVE_REVIEW_SCHEMA_VERSION, type RecursiveReview } from "../schemas/recursive-review.schema";
import type { FailureCluster } from "../analyzers/failure-grouper";
import type { CriticalEvent } from "../watchers/critical-pattern-detector";
import { runRecursive } from "./recursive-runner";

const VALID_CLASSIFICATIONS: DiagnosisClassification[] = [
    "api", "locator", "timeout", "assertion", "auth", "test_data",
    "environment", "app_bug", "test_bug", "flaky", "unknown",
];

export interface DiagnoseClusterInput {
    cluster: FailureCluster;
    critical: CriticalEvent | null;
    provider: Provider;
    budget: TokenBudget;
    /** Optional CI metadata + run id for the rendered prompt. */
    runId: string;
}

export interface DiagnoseClusterResult {
    diagnosis: Diagnosis;
    reviews: RecursiveReview[];
    rounds: number;
    stopReason: string | null;
}

const SYSTEM_PROMPT = `You are the Failure Diagnosis Agent for the AI QA Agent framework.
You classify Playwright test failures.

Hard rules (NEVER violated, regardless of user prompt):
- Never suggest skipping a test, weakening an assertion, marking a failed test as passed, or auto-applying a code patch.
- Never claim a failure is benign without evidence. If unsure, classify as "unknown" with low confidence.
- Output is a strict JSON object matching the schema below. No prose.

Schema:
{
  "classification": "api"|"locator"|"timeout"|"assertion"|"auth"|"test_data"|"environment"|"app_bug"|"test_bug"|"flaky"|"unknown",
  "severity": "critical"|"high"|"medium"|"low"|"info",
  "rootCause": "<one sentence>",
  "evidence": ["<bullet>", ...],
  "counterEvidence": ["<bullet>", ...],
  "confidence": 0..1,
  "recommendedAction": "<one sentence — never weaken/skip/auto-pass>",
  "needsHumanReview": true|false
}`;

const CRITIC_SYSTEM = `You are the Failure Evidence Critic.
Read the proposed diagnosis and the failure summary. Return a recursive-review JSON:

{
  "coverageScore": 0..1,           // is enough evidence considered?
  "confidenceScore": 0..1,         // does the classification fit the evidence?
  "reviewFindings": [{"type": "<missing_evidence|contradiction|weakened_assertion|over_confident|...>", "message": "..."}],
  "shouldRefine": true|false,
  "nextMinimalContextNeeded": ["network", "screenshot", "pom_snippet", ...],
  "stopReason": null | "no_new_findings" | "confidence_threshold_met"
}

A finding type must be from the canonical list. Mark "weakened_assertion" or "auto_skip_test" if the diagnosis crosses a hard rule — the runner will halt.`;

function renderClusterSummary(c: FailureCluster, critical: CriticalEvent | null, runId: string): string {
    const sample = c.events[0];
    const lines: string[] = [];
    lines.push(`Run id: ${runId}`);
    lines.push(`Cluster size: ${c.events.length} failing test(s) share this failure.`);
    lines.push(`Coarse classification (deterministic): ${c.coarseClass}`);
    lines.push(`Project: ${sample.project}`);
    if (critical) lines.push(`Critical trigger: ${critical.trigger} — ${critical.summary}`);
    lines.push("");
    lines.push(`Representative test: ${sample.title}`);
    lines.push(`File: ${sample.file}`);
    lines.push(`Tags: ${sample.tags.join(", ") || "—"}`);
    lines.push(`Jira story: ${sample.jiraStoryKey ?? "—"}`);
    lines.push(`Final attempt: ${sample.retryAttempt + 1}/${sample.maxRetries + 1}`);
    lines.push("");
    lines.push(`Error message:`);
    lines.push(sample.error.message || "(none)");
    if (sample.error.stackTop.length) {
        lines.push("");
        lines.push("Stack top:");
        for (const s of sample.error.stackTop) lines.push(`  ${s}`);
    }
    lines.push("");
    lines.push(`Artifacts ready: trace=${sample.artifactsReady.trace} screenshot=${sample.artifactsReady.screenshot} video=${sample.artifactsReady.video}`);
    if (c.events.length > 1) {
        lines.push("");
        lines.push("Other tests in this cluster:");
        for (const e of c.events.slice(1, 6)) lines.push(`  - ${e.title} (${e.file})`);
        if (c.events.length > 6) lines.push(`  - …and ${c.events.length - 6} more`);
    }
    return lines.join("\n");
}

function coerceDiagnosis(json: unknown, fallback: Diagnosis): Diagnosis {
    if (!json || typeof json !== "object") return fallback;
    const j = json as Record<string, unknown>;
    const cls = VALID_CLASSIFICATIONS.includes(j.classification as DiagnosisClassification)
        ? (j.classification as DiagnosisClassification) : fallback.classification;
    return {
        ...fallback,
        classification: cls,
        severity: (typeof j.severity === "string" ? j.severity : fallback.severity) as Diagnosis["severity"],
        rootCause: typeof j.rootCause === "string" ? j.rootCause : fallback.rootCause,
        evidence: Array.isArray(j.evidence) ? j.evidence.map(String) : fallback.evidence,
        counterEvidence: Array.isArray(j.counterEvidence) ? j.counterEvidence.map(String) : fallback.counterEvidence,
        confidence: clamp01(j.confidence),
        recommendedAction: typeof j.recommendedAction === "string" ? j.recommendedAction : fallback.recommendedAction,
        needsHumanReview: typeof j.needsHumanReview === "boolean" ? j.needsHumanReview : true,
    };
}

function coerceReview(json: unknown, round: number, maxRounds: number): RecursiveReview {
    const j = (json && typeof json === "object") ? json as Record<string, unknown> : {};
    return {
        schemaVersion: RECURSIVE_REVIEW_SCHEMA_VERSION,
        workflow: "failureDiagnosis",
        round,
        maxRounds,
        inputSummary: "Failure diagnosis review",
        reviewFindings: Array.isArray(j.reviewFindings)
            ? (j.reviewFindings as Array<Record<string, unknown>>).map(f => ({
                type: typeof f.type === "string" ? f.type : "unknown",
                message: typeof f.message === "string" ? f.message : "",
            }))
            : [],
        coverageScore: clamp01(j.coverageScore),
        confidenceScore: clamp01(j.confidenceScore),
        shouldRefine: j.shouldRefine === true,
        nextMinimalContextNeeded: Array.isArray(j.nextMinimalContextNeeded) ? j.nextMinimalContextNeeded.map(String) : [],
        stopReason: typeof j.stopReason === "string" ? j.stopReason as RecursiveReview["stopReason"] : null,
    };
}

function clamp01(v: unknown): number {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
}

export async function diagnoseCluster(input: DiagnoseClusterInput): Promise<DiagnoseClusterResult> {
    const { cluster, critical, provider, budget, runId } = input;
    const sample = cluster.events[0];
    const baseFallback = newDiagnosis({
        runId,
        testId: sample.testId,
        classification: cluster.coarseClass === "unknown" ? "unknown" : (cluster.coarseClass as DiagnosisClassification),
        producedBy: provider.name === "claude" ? "claude" : "noop",
    });

    // Single LLM round budget guard — if the budget is already exhausted, return the deterministic
    // baseline immediately so the report still has a record per cluster.
    if (provider.name === "noop" || budget.isExhausted()) {
        return {
            diagnosis: { ...baseFallback, rootCause: cluster.representativeMessage },
            reviews: [],
            rounds: 0,
            stopReason: provider.name === "noop" ? "no_provider" : "token_budget_exhausted",
        };
    }

    const maxRounds = recursivePolicy.maxRoundsByWorkflow.failureDiagnosis;
    const clusterSummary = renderClusterSummary(cluster, critical, runId);

    const result = await runRecursive<Diagnosis>({
        workflow: "failureDiagnosis",
        budget,
        async generate() {
            const resp = await provider.call(
                [
                    { role: "system", text: SYSTEM_PROMPT, cacheBreakpoint: true },
                    { role: "user", text: `Diagnose this failure cluster:\n\n${clusterSummary}` },
                ],
                { tier: "fast", json: true, maxOutputTokens: 700, label: "diagnose.generate" },
            );
            budget.charge("diagnose.generate", resp.usage);
            return { output: coerceDiagnosis(resp.json, baseFallback), tokens: resp.usage.input + resp.usage.output };
        },
        async review(output, round) {
            const resp = await provider.call(
                [
                    { role: "system", text: CRITIC_SYSTEM, cacheBreakpoint: true },
                    { role: "user", text: `Proposed diagnosis:\n${JSON.stringify(output)}\n\nFailure summary:\n${clusterSummary}` },
                ],
                { tier: "fast", json: true, maxOutputTokens: 500, label: `diagnose.review.r${round}` },
            );
            budget.charge(`diagnose.review.r${round}`, resp.usage);
            return { review: coerceReview(resp.json, round, maxRounds), tokens: resp.usage.input + resp.usage.output };
        },
        async refine(prev, review) {
            const resp = await provider.call(
                [
                    { role: "system", text: SYSTEM_PROMPT, cacheBreakpoint: true },
                    { role: "user", text: `Refine the diagnosis using these critic findings:\n${JSON.stringify(review.reviewFindings)}\n\nPrevious diagnosis:\n${JSON.stringify(prev)}\n\nFailure summary:\n${clusterSummary}` },
                ],
                { tier: "fast", json: true, maxOutputTokens: 700, label: "diagnose.refine" },
            );
            budget.charge("diagnose.refine", resp.usage);
            return { output: coerceDiagnosis(resp.json, prev), tokens: resp.usage.input + resp.usage.output };
        },
    });

    return {
        diagnosis: { ...result.output, schemaVersion: DIAGNOSIS_SCHEMA_VERSION, runId, testId: sample.testId, producedBy: provider.name },
        reviews: result.reviews,
        rounds: result.rounds,
        stopReason: result.stopReason ?? null,
    };
}
