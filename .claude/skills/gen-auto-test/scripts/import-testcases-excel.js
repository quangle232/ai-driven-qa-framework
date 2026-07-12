#!/usr/bin/env node
/**
 * import-testcases-excel.js — Excel test cases → canonical JSON
 * (the reverse of ../../qa-agent/scripts/export-testcases-excel.mjs).
 *
 * Reads the first worksheet, matches columns BY HEADER NAME (the 11 review
 * columns; extra columns are ignored, missing ones reported), and writes the
 * canonical test-case JSON the gen-auto-test / qa-agent flows consume.
 *
 * Usage:
 *   node .claude/skills/gen-auto-test/scripts/import-testcases-excel.js \
 *     --xlsx TestCases_search.xlsx \
 *     --out  test-output/ai/testcases-search.json \
 *     [--feature "Search"] [--story EAST-123]
 *
 * Step parsing: the "Step details" cell is split back into stepDetails —
 * one step per line, "N. action | element: <selector>" (the exporter's
 * format) or plain "N. action" / free lines.
 *
 * Exit codes: 0 = written, 2 = usage / file error.
 * Requires `exceljs` (devDependency). ESM — package.json sets "type": "module".
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import ExcelJS from 'exceljs';

function arg(name, def = undefined) {
    const i = process.argv.indexOf(`--${name}`);
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const xlsxPath = arg('xlsx');
const outPath = arg('out');
if (!xlsxPath || !outPath) {
    console.error('usage: import-testcases-excel.js --xlsx <file> --out <file.json> [--feature <name>] [--story <KEY>]');
    process.exit(2);
}
if (!existsSync(resolve(xlsxPath))) {
    console.error(`Error: file not found: ${resolve(xlsxPath)}`);
    process.exit(2);
}

/** Header text (lowercased, trimmed) → canonical field. */
const HEADER_MAP = {
    'tc id': 'tcId',
    'feature': 'feature',
    'sub-feature': 'subFeature',
    'summary & specific pre-condition': 'summaryPrecondition',
    'summary & pre-condition': 'summaryPrecondition',
    'summary': 'summaryPrecondition',
    'test description': 'testDescription',
    'step details': 'stepDetails',
    'steps': 'stepDetails',
    'element': 'element',
    'pr.': 'priority',
    'priority': 'priority',
    'test result': 'testResult',
    'bug id': 'bugId',
    'notes': 'notes',
};

function parseSteps(cellText) {
    if (!cellText) return [];
    return String(cellText)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => {
            const numbered = line.match(/^(\d+)[.)]\s*(.*)$/);
            const body = numbered ? numbered[2] : line;
            const [detail, elementPart] = body.split('| element:').map((s) => s.trim());
            return {
                step: numbered ? Number(numbered[1]) : index + 1,
                detail: detail || body,
                element: elementPart || '',
            };
        });
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(resolve(xlsxPath));
const ws = wb.worksheets[0];
if (!ws) {
    console.error('Error: workbook has no worksheets.');
    process.exit(2);
}

// Map header row → column index.
const columns = {};
ws.getRow(1).eachCell((cell, col) => {
    const key = HEADER_MAP[String(cell.value ?? '').trim().toLowerCase()];
    if (key) columns[key] = col;
});
const missing = ['tcId', 'stepDetails'].filter((k) => !columns[k]);
if (missing.length) {
    console.error(`Error: required column(s) not found by header: ${missing.join(', ')}. ` +
        `Found headers: ${ws.getRow(1).values?.slice(1).join(' | ')}`);
    process.exit(2);
}

const feature = arg('feature', '');
const story = arg('story', '');
const testCases = [];
ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const get = (key) => (columns[key] ? String(row.getCell(columns[key]).value ?? '').trim() : '');
    const tcId = get('tcId');
    if (!tcId) return; // skip empty rows
    testCases.push({
        tcId,
        feature: get('feature') || feature,
        subFeature: get('subFeature'),
        summaryPrecondition: get('summaryPrecondition'),
        testDescription: get('testDescription'),
        stepDetails: parseSteps(get('stepDetails')),
        priority: get('priority') || 'P2',
        priorityReason: '',
        duplicateStatus: 'none',
        acIds: [],
        // The agent reviews/infers these in Phase 1 — imported sheets rarely carry them.
        automatable: 'Y',
        surface: 'ui',
        coverageType: '',
        tags: [],
        testResult: get('testResult'),
        bugId: get('bugId'),
        notes: get('notes'),
        specFile: '',
    });
});

if (testCases.length === 0) {
    console.error('Error: no test-case rows found under the header row.');
    process.exit(2);
}

const doc = {
    schemaVersion: 'aiqa.qa.testcases.v1',
    meta: {
        feature: feature || testCases[0].feature || '',
        userStoryKey: story,
        figmaDesignLink: '',
        generatedAt: new Date().toISOString().slice(0, 10),
        testMgmt: 'excel',
        approvalRequired: true,
        approvalStatus: 'draft',
        importedFrom: resolve(xlsxPath),
    },
    testCases,
    assumptions: [],
    openQuestions: [],
};

mkdirSync(dirname(resolve(outPath)), { recursive: true });
writeFileSync(resolve(outPath), JSON.stringify(doc, null, 2));
console.log(`[import-excel] ${testCases.length} case(s) -> ${outPath}`);
console.log('[import-excel] review needed: automatable/surface/coverageType/tags default to Y/ui/(empty)/[] — the agent infers and marks them in Phase 1.');
