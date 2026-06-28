/**
 * Index existing code so future generations REUSE instead of duplicate.
 *
 * Scans:
 *   - page-objects/**\/*-page.ts   → class names + exported method signatures
 *   - tests/**\/*.spec.ts          → spec titles + tags + parent suite (jira story)
 *   - helper/test-tags.ts          → defined tag constants (TAGS.X)
 *   - helper/action-keywords.ts    → public methods on ActionKeyword
 *   - test-data/*-data.ts          → exported data-record names
 *
 * Deliberately regex-based, not AST-based — fast and pure-TS, no extra dep,
 * and these are the same patterns the convention enforces. Returns a
 * compact JSON object the Builder Agent inlines into its prompt (token cost
 * ≈ 400-1000 depending on repo size).
 *
 * Cached on disk keyed by source mtimes so unchanged repos = same index =
 * Anthropic prompt-cache hits across runs.
 */

import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../utils/paths";
import { cacheKey, getCachedContext, putCachedContext } from "./context-cache";

export interface PageObjectInfo {
    path: string;          // repo-relative
    className: string;
    feature: string;       // first dir segment under page-objects/
    methods: string[];     // public async methods (best-effort regex)
}

export interface SpecInfo {
    path: string;          // repo-relative
    feature: string;       // first dir segment under tests/
    titles: string[];      // test('...') titles
    tags: string[];        // unique tag values referenced via TAGS.X
    jiraStories: string[]; // setJiraStory('...') keys
}

export interface TestDataInfo {
    path: string;
    feature: string;
    exports: string[];     // export const X = ...
}

export interface ExistingCodeIndex {
    schemaVersion: "aiqa.existing-code-index.v1";
    /** Cache key — stable while source files haven't changed. */
    key: string;
    pageObjects: PageObjectInfo[];
    specs: SpecInfo[];
    testData: TestDataInfo[];
    /** TAGS.X identifiers exported from helper/test-tags.ts. */
    declaredTags: string[];
    /** Public method names on the ActionKeyword class. */
    actionKeywordMethods: string[];
    /** Features that already have AT LEAST one page object OR one spec. */
    knownFeatures: string[];
}

const SCHEMA = "aiqa.existing-code-index.v1";

function listFiles(rootRel: string, suffix: RegExp): string[] {
    const root = path.resolve(REPO_ROOT, rootRel);
    if (!fs.existsSync(root)) return [];
    const out: string[] = [];
    const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const abs = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
                walk(abs);
            } else if (entry.isFile() && suffix.test(entry.name)) {
                out.push(path.relative(REPO_ROOT, abs));
            }
        }
    };
    walk(root);
    return out.sort();
}

function readSafe(rel: string): string | null {
    const abs = path.resolve(REPO_ROOT, rel);
    try { return fs.readFileSync(abs, "utf8"); } catch { return null; }
}

function featureFromPath(file: string, root: string): string {
    const after = file.slice(root.length).replace(/^\/+/, "");
    const first = after.split(/[/\\]/)[0];
    return first || "unknown";
}

function parsePageObject(file: string): PageObjectInfo | null {
    const src = readSafe(file);
    if (!src) return null;
    const cm = src.match(/export\s+class\s+(\w+)\s+extends\s+BasePage/);
    if (!cm) return null;
    const methods = [...src.matchAll(/\n\s*(?:public\s+)?async\s+([A-Za-z_][\w$]*)\s*\(/g)]
        .map(m => m[1])
        .filter(n => n !== "constructor");
    return {
        path: file,
        className: cm[1],
        feature: featureFromPath(file, "page-objects"),
        methods: [...new Set(methods)],
    };
}

function parseSpec(file: string): SpecInfo | null {
    const src = readSafe(file);
    if (!src) return null;
    const titles = [...src.matchAll(/\btest\s*\(\s*['"`]([^'"`]+)['"`]/g)].map(m => m[1]);
    const tags = [...new Set([...src.matchAll(/TAGS\.([A-Z_][A-Z0-9_]*)/g)].map(m => m[1]))];
    const stories = [...new Set([...src.matchAll(/setJiraStory\s*\(\s*['"`]([^'"`]+)['"`]/g)].map(m => m[1]))];
    return {
        path: file,
        feature: featureFromPath(file, "tests"),
        titles,
        tags,
        jiraStories: stories,
    };
}

function parseTestData(file: string): TestDataInfo | null {
    const src = readSafe(file);
    if (!src) return null;
    const exports = [...src.matchAll(/export\s+(?:const|let|var|function|class)\s+(\w+)/g)].map(m => m[1]);
    return {
        path: file,
        feature: featureFromPath(file, "test-data").replace(/-data\.ts$/, ""),
        exports: [...new Set(exports)],
    };
}

function parseDeclaredTags(): string[] {
    const src = readSafe("helper/test-tags.ts");
    if (!src) return [];
    // Match `KEY: "@..."` entries inside the TAGS object literal.
    return [...src.matchAll(/^\s*([A-Z_][A-Z0-9_]*)\s*:\s*["'`]@/gm)].map(m => m[1]);
}

function parseActionKeywords(): string[] {
    const src = readSafe("helper/action-keywords.ts");
    if (!src) return [];
    // Public async methods that aren't tagged `private`/`protected`.
    const methods: string[] = [];
    const rx = /(^|\n)([ \t]*)((?:public\s+)?async\s+)?([A-Za-z_][\w$]*)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(src))) {
        const name = m[4];
        // Skip private/protected: look at the line preceding the match.
        const lineStart = src.lastIndexOf("\n", m.index) + 1;
        const lineEnd = src.indexOf("\n", m.index);
        const line = src.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
        if (/\b(private|protected)\b/.test(line)) continue;
        if (name === "constructor" || name === "if" || name === "for" || name === "while") continue;
        methods.push(name);
    }
    return [...new Set(methods)];
}

const SOURCE_MTIME_PATHS = [
    "helper/test-tags.ts",
    "helper/action-keywords.ts",
    "page-objects",
    "tests",
    "test-data",
];

export function loadExistingCodeIndex(): ExistingCodeIndex {
    const stamps = SOURCE_MTIME_PATHS.map(p => path.resolve(REPO_ROOT, p));
    const key = cacheKey(SCHEMA, stamps);
    const cached = getCachedContext(key);
    if (cached) {
        try { return JSON.parse(cached) as ExistingCodeIndex; } catch { /* rebuild */ }
    }

    const pageObjects = listFiles("page-objects", /-page\.ts$/i)
        .map(parsePageObject)
        .filter((x): x is PageObjectInfo => !!x);

    const specs = listFiles("tests", /\.spec\.ts$/i)
        .map(parseSpec)
        .filter((x): x is SpecInfo => !!x);

    const testData = listFiles("test-data", /-data\.ts$/i)
        .map(parseTestData)
        .filter((x): x is TestDataInfo => !!x);

    const features = new Set<string>([
        ...pageObjects.map(p => p.feature),
        ...specs.map(s => s.feature),
    ]);

    const index: ExistingCodeIndex = {
        schemaVersion: SCHEMA,
        key,
        pageObjects,
        specs,
        testData,
        declaredTags: parseDeclaredTags(),
        actionKeywordMethods: parseActionKeywords(),
        knownFeatures: [...features].sort(),
    };

    putCachedContext(key, JSON.stringify(index));
    return index;
}

/** Render the index as a compact prompt block (≈ 400-1000 tokens). */
export function renderIndexForPrompt(index: ExistingCodeIndex): string {
    const lines: string[] = [];
    lines.push("# Existing code in this repo — REUSE these before creating new files.");
    lines.push("");
    if (index.knownFeatures.length === 0) {
        lines.push("(repo is empty — sample/ excluded)");
    } else {
        lines.push(`Known features: ${index.knownFeatures.join(", ")}`);
    }
    lines.push("");
    lines.push("## Existing page objects");
    if (index.pageObjects.length === 0) {
        lines.push("(none yet)");
    } else {
        for (const po of index.pageObjects) {
            lines.push(`- \`${po.path}\` → class \`${po.className}\` — methods: ${po.methods.slice(0, 12).join(", ")}${po.methods.length > 12 ? ", …" : ""}`);
        }
    }
    lines.push("");
    lines.push("## Existing specs");
    if (index.specs.length === 0) {
        lines.push("(none yet)");
    } else {
        for (const s of index.specs) {
            const story = s.jiraStories[0] ?? "—";
            lines.push(`- \`${s.path}\` — story ${story}, tags ${s.tags.map(t => `TAGS.${t}`).join(", ") || "—"}, ${s.titles.length} test(s)`);
        }
    }
    lines.push("");
    lines.push("## Existing test-data modules");
    if (index.testData.length === 0) {
        lines.push("(none yet)");
    } else {
        for (const d of index.testData) {
            lines.push(`- \`${d.path}\` — exports: ${d.exports.join(", ")}`);
        }
    }
    lines.push("");
    lines.push(`## Declared tags (TAGS.X in helper/test-tags.ts): ${index.declaredTags.map(t => `TAGS.${t}`).join(", ") || "(none)"}`);
    lines.push(`## ActionKeyword public methods: ${index.actionKeywordMethods.slice(0, 30).join(", ")}${index.actionKeywordMethods.length > 30 ? ", …" : ""}`);
    lines.push("");
    lines.push("## Reuse rules");
    lines.push("- If a page object for the target feature already exists, EXTEND it (kind: \"update\") instead of creating a new one.");
    lines.push("- If TAGS.<FEATURE> is missing, add it to helper/test-tags.ts (kind: \"update\") so future runs find it.");
    lines.push("- Reuse the ActionKeyword methods above. Do NOT invent new keyword names.");
    lines.push("- New spec files MUST include TAGS.REGRESSION + a priority tag (TAGS.P0/P1/P2) so the regression suite picks them up.");
    return lines.join("\n");
}
