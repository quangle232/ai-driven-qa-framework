// Export the approved canonical test-case JSON -> Excel (the default
// test-management target). The 11 columns match references/review-and-approval.md.
//
//   node .agents/skills/qa-agent/scripts/export-testcases-excel.mjs \
//     --json docs/ai/testcases.<feature>.json \
//     --out  test-output/ai/TestCases_<feature>.xlsx \
//     [--results test-output/ai/exec-results.json]
//
// --results (optional, post-execution) fills Test Result / Bug ID per tcId:
//   { "TC-001": { "result": "Passed", "bugId": "" }, ... }
//   (`testResult` is accepted as an alias of `result` — the canonical
//   test-case JSON uses that field name, so both spellings must work.)
//
// Requires `exceljs` (devDependency). JSON is the source of truth — never
// hand-edit the xlsx; re-export from JSON.
import { readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import ExcelJS from "exceljs";

function arg(name, def = undefined) {
    const i = process.argv.indexOf(`--${name}`);
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const jsonPath = arg("json");
const outPath = arg("out");
const resultsPath = arg("results");
if (!jsonPath || !outPath) {
    console.error("usage: --json <file> --out <file.xlsx> [--results <file>]");
    process.exit(2);
}

const doc = JSON.parse(readFileSync(jsonPath, "utf8"));
const results = resultsPath ? JSON.parse(readFileSync(resultsPath, "utf8")) : {};
const cases = Array.isArray(doc.testCases) ? doc.testCases : [];

const COLUMNS = [
    { header: "TC ID", key: "tcId", width: 12 },
    { header: "Feature", key: "feature", width: 18 },
    { header: "Sub-feature", key: "subFeature", width: 18 },
    { header: "Summary & Specific pre-condition", key: "summaryPrecondition", width: 40 },
    { header: "Test Description", key: "testDescription", width: 40 },
    { header: "Step details", key: "stepDetails", width: 50 },
    { header: "Element", key: "element", width: 24 },
    { header: "Pr.", key: "priority", width: 6 },
    { header: "Test Result", key: "testResult", width: 12 },
    { header: "Bug ID", key: "bugId", width: 12 },
    { header: "Notes", key: "notes", width: 30 },
];

function renderSteps(steps = []) {
    return steps
        .map((s) => {
            const base = `${s.step}. ${s.detail}`;
            return s.element ? `${base} | element: ${s.element}` : base;
        })
        .join("\n");
}

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Test Cases");
ws.columns = COLUMNS;
ws.getRow(1).font = { bold: true };

for (const tc of cases) {
    const res = results[tc.tcId] || {};
    ws.addRow({
        tcId: tc.tcId ?? "",
        feature: tc.feature ?? doc.meta?.feature ?? "",
        subFeature: tc.subFeature ?? "",
        summaryPrecondition: tc.summaryPrecondition ?? "",
        testDescription: tc.testDescription ?? "",
        stepDetails: renderSteps(tc.stepDetails),
        element: (tc.stepDetails || []).map((s) => s.element).filter(Boolean).join("\n"),
        priority: tc.priority ?? "",
        testResult: res.result ?? res.testResult ?? tc.testResult ?? "",
        bugId: res.bugId ?? tc.bugId ?? "",
        notes: tc.notes ?? "",
    }).alignment = { vertical: "top", wrapText: true };
}

mkdirSync(dirname(outPath), { recursive: true });
await wb.xlsx.writeFile(outPath);
console.log(`[export-excel] ${cases.length} case(s) -> ${outPath}`);
