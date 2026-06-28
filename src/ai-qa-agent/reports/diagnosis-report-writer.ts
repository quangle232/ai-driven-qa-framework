/**
 * Write `test-output/ai/diagnosis.md` — a Markdown digest of the run's final
 * failures plus the deterministic critical-pattern verdict.
 *
 * Phase 1 is fully deterministic: no LLM-backed classifier yet. Each failure
 * gets a `Diagnosis` object with `producedBy: "deterministic"` and a coarse
 * classification derived from the error message. Phase 4 wires the
 * Failure Diagnosis Agent in behind `AI_PROVIDER`.
 */

import fs from "node:fs";
import path from "node:path";

import { aiqaOutDir, ensureDir } from "../utils/paths";
import { collectCiMetadata } from "../collectors/ci-metadata-collector";
import { detectCriticalEvents, type CriticalEvent } from "../watchers/critical-pattern-detector";
import { newDiagnosis, type Diagnosis, type DiagnosisClassification } from "../schemas/diagnosis.schema";
import { FORBIDDEN_BEHAVIORS, getActiveMode } from "../config/agent-policy";
import { resolveProvider } from "../config/ai-provider.config";
import type { FailureEvent } from "../schemas/failure-event.schema";

function classifyDeterministic(ev: FailureEvent): DiagnosisClassification {
    const m = (ev.error.message ?? "").toLowerCase();
    if (/timeout/.test(m)) return "timeout";
    if (/locator|selector|not visible|not attached|no element/.test(m)) return "locator";
    if (/expect|assertion|toequal|tohave/.test(m)) return "assertion";
    if (/auth|login|storage.?state|unauthor/.test(m)) return "auth";
    if (/\b5\d{2}\b|http\s+5\d{2}|network/.test(m)) return "api";
    if (/env|environment|unreachable|connection refused/.test(m)) return "environment";
    if (/test data|fixture/.test(m)) return "test_data";
    return "unknown";
}

function deterministicDiagnosis(ev: FailureEvent): Diagnosis {
    const classification = classifyDeterministic(ev);
    return newDiagnosis({
        runId: ev.runId,
        testId: ev.testId,
        classification,
        severity: ev.isFinalFailure ? "high" : "medium",
        rootCause: ev.error.message || "Unknown error",
        evidence: [
            `Status: ${ev.status} on attempt ${ev.retryAttempt + 1}/${ev.maxRetries + 1}`,
            ...(ev.artifacts.trace ? [`Trace: ${ev.artifacts.trace}`] : []),
            ...(ev.artifacts.screenshot ? [`Screenshot: ${ev.artifacts.screenshot}`] : []),
        ],
        counterEvidence: [],
        confidence: 0.4,                       // deterministic baseline; LLM raises this in Phase 4
        recommendedAction: classification === "locator"
            ? "Verify the locator chain in the related page object; do not weaken assertions."
            : classification === "api"
                ? "Inspect backend logs for the 5xx response near the failure timestamp."
                : "Open the trace.zip and the Allure result; correlate with recent commits.",
        needsHumanReview: true,
        allowedActions: ["report", "notify"],
        forbiddenActions: ["mark_pass", "skip_test", "auto_apply_patch", "weaken_assertion"],
        producedBy: "deterministic",
    });
}

export interface DiagnosisWriteOptions {
    runId: string;
    failureEvents: FailureEvent[];
    /** Override the output dir. */
    outDir?: string;
}

export function writeDiagnosisReport(opts: DiagnosisWriteOptions): { markdownPath: string; jsonPath: string; diagnoses: Diagnosis[]; criticals: CriticalEvent[] } {
    const outDir = opts.outDir ?? aiqaOutDir();
    ensureDir(outDir);

    const ci = collectCiMetadata();
    const finals = opts.failureEvents.filter(e => e.isFinalFailure);
    const diagnoses = finals.map(deterministicDiagnosis);
    const criticals = detectCriticalEvents(opts.failureEvents);
    const mode = getActiveMode();
    const provider = resolveProvider();

    const md = renderMarkdown({
        runId: opts.runId,
        ci,
        finals,
        diagnoses,
        criticals,
        mode,
        provider,
    });

    const markdownPath = path.join(outDir, "diagnosis.md");
    const jsonPath = path.join(outDir, "diagnosis.json");
    fs.writeFileSync(markdownPath, md);
    fs.writeFileSync(jsonPath, JSON.stringify({ runId: opts.runId, ci, diagnoses, criticals }, null, 2));

    return { markdownPath, jsonPath, diagnoses, criticals };
}

function renderMarkdown(input: {
    runId: string;
    ci: ReturnType<typeof collectCiMetadata>;
    finals: FailureEvent[];
    diagnoses: Diagnosis[];
    criticals: CriticalEvent[];
    mode: ReturnType<typeof getActiveMode>;
    provider: ReturnType<typeof resolveProvider>;
}): string {
    const { runId, ci, finals, diagnoses, criticals, mode, provider } = input;
    const lines: string[] = [];

    lines.push(`# AI QA Agent — Run Diagnosis`);
    lines.push("");
    lines.push(`- **Run id:** \`${runId}\``);
    lines.push(`- **Provider:** \`${ci.provider}\``);
    if (ci.runUrl) lines.push(`- **Run URL:** ${ci.runUrl}`);
    if (ci.branch) lines.push(`- **Branch:** \`${ci.branch}\``);
    if (ci.commit) lines.push(`- **Commit:** \`${ci.commit}\``);
    if (ci.environment) lines.push(`- **Environment:** \`${ci.environment}\``);
    lines.push(`- **Mode:** \`${mode}\` (default \`diagnose_only\` per master prompt)`);
    lines.push(`- **AI provider:** \`${provider.name}\` — ${provider.reason}`);
    lines.push("");

    lines.push(`## Final-attempt failures (${finals.length})`);
    if (finals.length === 0) {
        lines.push("No final-attempt failures detected. ✅");
    } else {
        lines.push("");
        lines.push("| Test | File | Project | Classification | Confidence | Recommended action |");
        lines.push("|---|---|---|---|---|---|");
        for (let i = 0; i < finals.length; i++) {
            const ev = finals[i];
            const d = diagnoses[i];
            lines.push(
                `| ${escapeMd(ev.title)} | \`${ev.file}\` | ${ev.project} | \`${d.classification}\` | ${d.confidence.toFixed(2)} | ${escapeMd(d.recommendedAction)} |`
            );
        }
    }
    lines.push("");

    lines.push(`## Critical events (${criticals.length})`);
    if (criticals.length === 0) {
        lines.push("No critical patterns detected.");
    } else {
        for (const c of criticals) {
            lines.push("");
            lines.push(`### 🚨 ${c.trigger}`);
            lines.push("");
            lines.push(`- **Summary:** ${escapeMd(c.summary)}`);
            lines.push(`- **Affected tests:** ${c.affectedTestIds.length}`);
            lines.push(`- **Fingerprint:** \`${c.fingerprint}\``);
            lines.push(`- **Evidence:**`);
            for (const e of c.evidence) lines.push(`  - ${escapeMd(e)}`);
        }
    }
    lines.push("");

    lines.push(`## Failure detail`);
    if (finals.length === 0) {
        lines.push("_None._");
    } else {
        for (let i = 0; i < finals.length; i++) {
            const ev = finals[i];
            const d = diagnoses[i];
            lines.push("");
            lines.push(`### ${escapeMd(ev.title)}`);
            lines.push("");
            lines.push(`- **Test id:** \`${ev.testId}\``);
            lines.push(`- **File:** \`${ev.file}\``);
            lines.push(`- **Project:** ${ev.project}`);
            lines.push(`- **Attempt:** ${ev.retryAttempt + 1} of ${ev.maxRetries + 1} (final)`);
            lines.push(`- **Status:** \`${ev.status}\``);
            lines.push(`- **Tags:** ${ev.tags.join(", ") || "—"}`);
            lines.push(`- **Jira story:** ${ev.jiraStoryKey ? `\`${ev.jiraStoryKey}\`` : "—"}`);
            lines.push(`- **Classification (deterministic):** \`${d.classification}\` (confidence ${d.confidence.toFixed(2)})`);
            lines.push(`- **Root-cause hint:** ${escapeMd(d.rootCause)}`);
            lines.push(`- **Recommended action:** ${escapeMd(d.recommendedAction)}`);
            if (ev.artifacts.trace) lines.push(`- **Trace:** \`${ev.artifacts.trace}\``);
            if (ev.artifacts.screenshot) lines.push(`- **Screenshot:** \`${ev.artifacts.screenshot}\``);
            if (ev.artifacts.video) lines.push(`- **Video:** \`${ev.artifacts.video}\``);
            if (ev.artifacts.allureResult) lines.push(`- **Allure result:** \`${ev.artifacts.allureResult}\``);
            if (ev.error.stackTop.length > 0) {
                lines.push(`- **Stack top:**`);
                lines.push("");
                lines.push("```");
                for (const s of ev.error.stackTop) lines.push(s);
                lines.push("```");
            }
        }
    }

    lines.push("");
    lines.push(`---`);
    lines.push("");
    lines.push(`**Hard guardrails active** — the agent will never: ${FORBIDDEN_BEHAVIORS.join(", ")}.`);
    lines.push("");
    return lines.join("\n");
}

function escapeMd(s: string): string {
    return s.replace(/\|/g, "\\|").replace(/\n+/g, " ");
}
