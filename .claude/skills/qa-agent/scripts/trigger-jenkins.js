#!/usr/bin/env node
/**
 * trigger-jenkins.js
 *
 * Trigger the Jenkins regression job for a given tag and wait for the result.
 * qa-agent Phase 4 uses this to run tests on CI by the Jira label (tag == label).
 *
 * Config — read from env vars, or from `environments/.env.jenkins` (gitignored;
 * env vars win). NEVER hard-code credentials in this file:
 *   JENKINS_URL    e.g. http://localhost:8080
 *   JENKINS_USER   Jenkins username
 *   JENKINS_TOKEN  Jenkins API token (preferred) or password
 *   JENKINS_JOB    job name (default: web-regression-job)
 *
 * Usage:
 *   node trigger-jenkins.js <tag>
 *   node trigger-jenkins.js @crm --env=sandbox --folder=sample --branch=main
 *   node trigger-jenkins.js @crm --check     (auth/connectivity check only)
 *
 * Exit codes: 0 = build SUCCESS / check ok, 1 = build not SUCCESS,
 *             2 = config / usage / trigger error.
 *
 * Plain .js ESM — the framework's package.json sets "type": "module", and
 * standalone node-run scripts in this repo are .js (see framework-conventions).
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Walk up to the repo root (the dir with package.json + helper/). */
function findRepoRoot(start) {
    let dir = start;
    while (dir !== dirname(dir)) {
        if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'helper'))) return dir;
        dir = dirname(dir);
    }
    return process.cwd();
}

/** Config: env vars take priority; fall back to environments/.env.jenkins. */
function loadConfig() {
    const cfg = {
        JENKINS_URL: process.env.JENKINS_URL,
        JENKINS_USER: process.env.JENKINS_USER,
        JENKINS_TOKEN: process.env.JENKINS_TOKEN,
        JENKINS_JOB: process.env.JENKINS_JOB,
    };
    const file = join(findRepoRoot(__dirname), 'environments', '.env.jenkins');
    if (existsSync(file)) {
        for (const line of readFileSync(file, 'utf8').split('\n')) {
            const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
            if (m && !cfg[m[1]]) cfg[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
    }
    return cfg;
}

// Parse args — positional[0] is the tag; everything else is a --flag[=value].
const positional = [];
const flags = {};
for (const a of process.argv.slice(2)) {
    if (a.startsWith('--')) {
        const [k, v] = a.slice(2).split('=');
        flags[k] = v ?? true;
    } else {
        positional.push(a);
    }
}
const tag = positional[0];
// --status=<build-url> mode needs no tag; full-flow mode needs a tag.
if (!tag && !flags.status && !flags.check) {
    console.error(
        'Usage:\n'
        + '  trigger-jenkins.js <tag> [--env=] [--folder=] [--branch=] [--no-wait]\n'
        + '  trigger-jenkins.js --check                  (auth/connectivity only)\n'
        + '  trigger-jenkins.js --status=<build-url>     (one-shot status check)'
    );
    process.exit(2);
}

const cfg = loadConfig();
const JOB = cfg.JENKINS_JOB || 'web-regression-job';
if (!cfg.JENKINS_URL || !cfg.JENKINS_USER || !cfg.JENKINS_TOKEN) {
    console.error(
        'Missing JENKINS_URL / JENKINS_USER / JENKINS_TOKEN '
        + '(set env vars or environments/.env.jenkins).'
    );
    process.exit(2);
}

const base = cfg.JENKINS_URL.replace(/\/+$/, '');
const headers = {
    Authorization:
        'Basic ' + Buffer.from(`${cfg.JENKINS_USER}:${cfg.JENKINS_TOKEN}`).toString('base64'),
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jget = async (url) => {
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`GET ${url} -> HTTP ${r.status}`);
    return r.json();
};

// --- auth / connectivity check (read-only) ---
try {
    const me = await jget(`${base}/me/api/json`);
    console.log(`✅ Jenkins reachable — authenticated as: ${me.id ?? me.fullName ?? cfg.JENKINS_USER}`);
} catch (e) {
    console.error(`❌ Jenkins auth/connectivity failed: ${e.message}`);
    console.error(`   Check JENKINS_URL (${base}) and the credentials.`);
    process.exit(2);
}

// CSRF crumb. Jenkins ties the crumb to the HTTP session, so the cookie set by
// the crumb request MUST be sent back on the POST (or the build returns 403).
const postHeaders = { ...headers };
try {
    const cr = await fetch(`${base}/crumbIssuer/api/json`, { headers });
    if (cr.ok) {
        const c = await cr.json();
        postHeaders[c.crumbRequestField] = c.crumb;
        const cookies = (cr.headers.getSetCookie?.() ?? [])
            .map((s) => s.split(';')[0])
            .join('; ');
        if (cookies) postHeaders.Cookie = cookies;
    } else if (cr.status !== 404) {
        console.error(`⚠️  crumb request returned HTTP ${cr.status} — POST may be rejected`);
    }
    // HTTP 404 = crumb issuer disabled; basic auth alone is then enough
} catch (e) {
    console.error(`⚠️  could not fetch CSRF crumb: ${e.message}`);
}

if (flags.check) {
    console.log('check ok');
    process.exit(0);
}

// --- --status=<build-url> : one-shot status check (no trigger, no wait) ---
// Use this to check a long-running build without sitting in a polling loop.
if (flags.status) {
    const url = String(flags.status).replace(/\/+$/, '/');
    const b = await jget(`${url}api/json`);
    if (b.result === null || b.result === undefined) {
        console.log(`⏳ IN_PROGRESS  ->  ${url}console`);
        process.exit(3); // distinct exit code for "still running"
    }
    console.log(`${b.result === 'SUCCESS' ? '✅' : '❌'} Result: ${b.result}  ->  ${url}console`);
    process.exit(b.result === 'SUCCESS' ? 0 : 1);
}

// --- trigger the parameterized build ---
// BRANCH is a Git Parameter — pass the BARE branch name (e.g. `main`). The
// job's checkout stage adds the `origin/` prefix itself, so sending
// `origin/main` produces an invalid `origin/origin/main` ref.
const body = new URLSearchParams({
    TAGS: tag,
    ENVIRONMENT: flags.env || 'sandbox',
    TEST_FOLDER: flags.folder || 'sample',
    BRANCH: flags.branch || 'main',
});

const trigger = await fetch(`${base}/job/${encodeURIComponent(JOB)}/buildWithParameters`, {
    method: 'POST',
    headers: postHeaders,
    body,
});
if (trigger.status !== 201) {
    const reason = trigger.headers.get('x-error');
    console.error(
        `❌ Trigger failed: HTTP ${trigger.status}`
        + (reason
            ? ` — ${reason}`
            : ` — check the job name "${JOB}" and that the user has Build permission`)
    );
    process.exit(2);
}
const queueUrl = trigger.headers.get('location');
console.log(`⏳ Queued (TAGS=${tag}): ${queueUrl}`);

// --- wait briefly for the queue item to be assigned a build number ---
// Even in --no-wait mode we poll the queue for a short while so we can hand
// back the build URL (it is what later --status checks need).
const queueDeadline = flags['no-wait'] ? 6 : 60; // ~30s vs ~5min
let buildUrl = '';
for (let i = 0; i < queueDeadline && !buildUrl; i++) {
    await sleep(5000);
    const q = await jget(`${queueUrl}api/json`);
    if (q.cancelled) {
        console.error('❌ Build was cancelled while queued');
        process.exit(1);
    }
    if (q.executable) buildUrl = q.executable.url;
}

// --- --no-wait: hand back the build URL (or queue URL) and exit ---
// For long builds (~1h) sitting in a polling loop is wasteful and exceeds the
// 10-min cap on background commands. Trigger now, check later with --status.
if (flags['no-wait']) {
    if (buildUrl) {
        console.log(`🏗️  Building (not waiting): ${buildUrl}`);
        console.log(`   Check later:  trigger-jenkins.js --status=${buildUrl}`);
    } else {
        console.log(`⏳ Still queued: ${queueUrl}`);
        console.log('   The build did not start within 30s — re-run --status against the build URL once Jenkins assigns one.');
    }
    process.exit(0);
}

if (!buildUrl) {
    console.error('❌ Build did not start within 5 minutes');
    process.exit(1);
}
console.log(`🏗️  Building: ${buildUrl}`);

// --- poll until the build finishes ---
let result = null;
while (result === null) {
    await sleep(15000);
    result = (await jget(`${buildUrl}api/json`)).result; // null while running
}
console.log(`${result === 'SUCCESS' ? '✅' : '❌'} Result: ${result}  ->  ${buildUrl}console`);
process.exit(result === 'SUCCESS' ? 0 : 1);
