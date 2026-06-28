/**
 * Parse a test-case input file into a structured list.
 *
 * Supports two formats:
 *
 * 1. Markdown with YAML-ish front matter and a pipe table:
 *      ---
 *      feature: Login
 *      jiraStoryKey: PROJ-42
 *      tags: ["@regression", "@auth", "@P1"]
 *      ---
 *      | TC ID | Summary | Pre-condition | Steps | Expected | Priority |
 *      |---|---|---|---|---|---|
 *      | TC-1 | ... | ... | 1. step\n2. step | ... | P0 |
 *
 * 2. JSON object: `{ feature, jiraStoryKey, tags, testCases: [{tcId, summary, preCondition, steps[], expected, priority}] }`
 */

import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../utils/paths";

export interface ParsedTestCase {
    tcId: string;
    summary: string;
    preCondition: string;
    steps: string[];
    expected: string;
    priority: "P0" | "P1" | "P2" | "P3";
}

export interface TestCaseBundle {
    feature: string;
    jiraStoryKey: string | null;
    tags: string[];
    testCases: ParsedTestCase[];
    /** Path the bundle was read from, for traceability. */
    sourcePath: string;
}

export function loadTestCaseBundle(file: string): TestCaseBundle {
    const abs = path.isAbsolute(file) ? file : path.resolve(REPO_ROOT, file);
    if (!fs.existsSync(abs)) throw new Error(`[aiqa] test-case input not found: ${file}`);
    const raw = fs.readFileSync(abs, "utf8");
    if (abs.endsWith(".json")) return parseJson(raw, abs);
    return parseMarkdown(raw, abs);
}

function parseJson(raw: string, sourcePath: string): TestCaseBundle {
    const data = JSON.parse(raw);
    return {
        feature: String(data.feature ?? "Unknown"),
        jiraStoryKey: data.jiraStoryKey ? String(data.jiraStoryKey) : null,
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        testCases: Array.isArray(data.testCases) ? data.testCases.map(normalizeTc) : [],
        sourcePath,
    };
}

function parseMarkdown(raw: string, sourcePath: string): TestCaseBundle {
    const { meta, body } = splitFrontMatter(raw);
    const feature = String(meta.feature ?? "Unknown");
    const jiraStoryKey = meta.jiraStoryKey ? String(meta.jiraStoryKey) : null;
    const tags = parseTagsField(meta.tags);
    const testCases = parsePipeTable(body);
    return { feature, jiraStoryKey, tags, testCases, sourcePath };
}

function splitFrontMatter(raw: string): { meta: Record<string, unknown>; body: string } {
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) return { meta: {}, body: raw };
    const metaLines = m[1].split("\n");
    const meta: Record<string, unknown> = {};
    for (const line of metaLines) {
        const km = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
        if (!km) continue;
        const key = km[1];
        const val = km[2].trim();
        if (val.startsWith("[")) {
            try { meta[key] = JSON.parse(val); } catch { meta[key] = val; }
        } else if (val.startsWith("\"") || val.startsWith("'")) {
            meta[key] = val.slice(1, -1);
        } else {
            meta[key] = val;
        }
    }
    return { meta, body: m[2] };
}

function parseTagsField(v: unknown): string[] {
    if (Array.isArray(v)) return v.map(String);
    if (typeof v === "string") {
        if (v.startsWith("[")) {
            try { const arr = JSON.parse(v); return Array.isArray(arr) ? arr.map(String) : []; } catch { /* fall through */ }
        }
        return v.split(",").map(s => s.trim()).filter(Boolean);
    }
    return [];
}

function parsePipeTable(body: string): ParsedTestCase[] {
    const lines = body.split("\n");
    let headerIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trim();
        if (l.startsWith("|") && /\bTC[\s-]?ID\b/i.test(l)) {
            headerIdx = i;
            break;
        }
    }
    if (headerIdx < 0) return [];

    const header = splitRow(lines[headerIdx]);
    // Skip the separator row.
    const rows: ParsedTestCase[] = [];
    for (let i = headerIdx + 2; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim().startsWith("|")) break;
        const cells = splitRow(line);
        if (cells.length < 2) continue;
        const get = (name: RegExp) => {
            const idx = header.findIndex(h => name.test(h));
            return idx >= 0 ? cells[idx] ?? "" : "";
        };
        const stepsRaw = get(/^steps?$/i) || get(/^description$/i) || get(/test\s*description/i);
        const steps = stepsRaw.split(/\\n|<br\s*\/?>|\n/).map(s => s.replace(/^\s*\d+\.\s*/, "").trim()).filter(Boolean);
        rows.push({
            tcId: get(/^tc[\s-]?id$/i) || `TC-${rows.length + 1}`,
            summary: get(/^summary$/i) || get(/test case/i) || "",
            preCondition: get(/pre[\s-]?condition/i) || "",
            steps,
            expected: get(/^expected/i) || get(/expected result/i) || "",
            priority: (["P0","P1","P2","P3"].includes(get(/^pr(\.|iority)?$/i)) ? get(/^pr(\.|iority)?$/i) : "P2") as ParsedTestCase["priority"],
        });
    }
    return rows;
}

function splitRow(line: string): string[] {
    const parts = line.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
    return parts;
}

function normalizeTc(raw: unknown): ParsedTestCase {
    const r = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
    return {
        tcId: String(r.tcId ?? r.id ?? "TC-?"),
        summary: String(r.summary ?? r.title ?? ""),
        preCondition: String(r.preCondition ?? r.preconditions ?? ""),
        steps: Array.isArray(r.steps) ? r.steps.map(String) : typeof r.steps === "string" ? String(r.steps).split("\n") : [],
        expected: String(r.expected ?? r.expectedResult ?? ""),
        priority: (["P0","P1","P2","P3"].includes(String(r.priority)) ? r.priority : "P2") as ParsedTestCase["priority"],
    };
}
