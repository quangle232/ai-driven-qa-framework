#!/usr/bin/env node
/**
 * find-related-tests.js
 *
 * Detect existing spec files that carry a given tag (== Jira label), so the
 * qa-agent skill (Phase 4) can run new tests together with related existing ones.
 *
 * Specs reference tags through the TAGS map (e.g. tags(TAGS.SERVICE_REQUEST)),
 * not the literal "@service-request" string. This script reads
 * helper/test-tags.ts, resolves the tag value to its TAGS key, then scans
 * tests/ for that key.
 *
 * Usage:
 *   node .agents/skills/qa-agent/scripts/find-related-tests.js @service-request
 *   node .agents/skills/qa-agent/scripts/find-related-tests.js service-request
 *   node .agents/skills/qa-agent/scripts/find-related-tests.js SERVICE_REQUEST
 *
 * Exit codes: 0 = matches found, 1 = no matches, 2 = usage / parse error.
 *
 * ESM module — the framework's package.json sets "type": "module".
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Walk up from `start` until a directory containing helper/test-tags.ts is found. */
function findRepoRoot(start) {
    let dir = start;
    while (dir !== dirname(dir)) {
        if (existsSync(join(dir, 'helper', 'test-tags.ts'))) return dir;
        dir = dirname(dir);
    }
    return null;
}

/** Parse helper/test-tags.ts into { valueToKey, keyToValue } maps. */
function parseTagsMap(tagsFile) {
    const src = readFileSync(tagsFile, 'utf8');
    const valueToKey = {};
    const keyToValue = {};
    const re = /(\w+)\s*:\s*["'`](@[\w-]+)["'`]/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        keyToValue[m[1]] = m[2];
        valueToKey[m[2]] = m[1];
    }
    return { valueToKey, keyToValue };
}

/** Resolve a CLI arg (TAGS key, "@value" or bare "value") to { key, value }. */
function resolveTag(arg, maps) {
    const { valueToKey, keyToValue } = maps;
    if (keyToValue[arg]) return { key: arg, value: keyToValue[arg] };
    if (valueToKey[arg]) return { key: valueToKey[arg], value: arg };
    const withAt = '@' + arg.replace(/^@/, '');
    if (valueToKey[withAt]) return { key: valueToKey[withAt], value: withAt };
    return null;
}

/** Recursively collect every *.spec.ts file under `dir`. */
function walkSpecs(dir, acc) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walkSpecs(full, acc);
        else if (entry.isFile() && entry.name.endsWith('.spec.ts')) acc.push(full);
    }
    return acc;
}

/**
 * Extract the title of every test() / test.describe() / test.only() ... call.
 * `test.step(...)` is excluded — only test and suite titles are reported. The
 * capture honours the opening quote so a title may contain the other quote types.
 */
function extractTitles(src) {
    const titles = [];
    const re = /\btest(?:\.(?!step\b)\w+)?\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
    let m;
    while ((m = re.exec(src)) !== null) titles.push(m[2]);
    return titles;
}

function main() {
    const arg = process.argv[2];
    if (!arg) {
        console.error('Usage: find-related-tests.js <tag>   (e.g. @service-request)');
        process.exit(2);
    }

    const repoRoot = findRepoRoot(__dirname) || findRepoRoot(process.cwd());
    if (!repoRoot) {
        console.error('Error: could not locate the repo root (helper/test-tags.ts not found).');
        process.exit(2);
    }

    const maps = parseTagsMap(join(repoRoot, 'helper', 'test-tags.ts'));
    const tag = resolveTag(arg, maps);
    if (!tag) {
        console.error(`Error: "${arg}" is not a known tag.`);
        console.error(`Known tags: ${Object.keys(maps.valueToKey).join(', ')}`);
        process.exit(2);
    }

    const testsDir = join(repoRoot, 'tests');
    if (!existsSync(testsDir)) {
        console.error('Error: tests/ directory not found.');
        process.exit(2);
    }

    const specs = walkSpecs(testsDir, []);
    const needle = new RegExp(`TAGS\\.${tag.key}\\b`);
    const matches = [];

    for (const spec of specs) {
        const src = readFileSync(spec, 'utf8');
        if (needle.test(src)) {
            matches.push({ file: relative(repoRoot, spec), titles: extractTitles(src) });
        }
    }

    console.log(`Tag: ${tag.value}  (TAGS.${tag.key})`);
    console.log(`Scanned ${specs.length} spec file(s) under tests/.`);

    if (matches.length === 0) {
        console.log('No existing tests carry this tag.');
        process.exit(1);
    }

    console.log(`\n${matches.length} related spec file(s) (file-level match):\n`);
    for (const match of matches) {
        console.log(`  ${match.file}`);
        for (const title of match.titles) console.log(`    - ${title}`);
    }
    console.log('\nRun the related tests with:');
    console.log(`  npx cross-env test_env=test playwright test -c config/playwright.config.ts --grep ${tag.value}`);
    process.exit(0);
}

main();
