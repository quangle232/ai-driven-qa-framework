#!/usr/bin/env node
/**
 * create-mr.js — open a merge/pull request for a pushed branch, MULTI-PROVIDER
 * (qa-agent Phase 7.5 / gen-auto-test Phase 6: generated code reaches the
 * team via branch + MR/PR — never straight to the default branch).
 *
 * Providers: gitlab | github | bitbucket | azure | gitea
 * The provider is AUTO-DETECTED from the `origin` remote URL; override with
 * --provider or GIT_PROVIDER when the remote is ambiguous (ssh host aliases).
 *
 * Usage:
 *   node .agents/skills/qa-agent/scripts/create-mr.js \
 *     --source test/EAST-123-login \
 *     --title  "EAST-123: Login — qa-agent generated tests" \
 *     [--target main] \
 *     [--description-file test-output/ai/mr-description.md] \
 *     [--provider gitlab|github|bitbucket|azure|gitea]
 *
 * Branch naming (team rule): test/<STORY-KEY>-<feature-slug> for
 * story-driven runs; test/manual-<feature-slug>-<YYYYMMDD> for
 * gen-auto-test runs without a story.
 *
 * Config: per-provider env vars (see environments/.env.git.example), falling
 * back to environments/.env.git, then the legacy environments/.env.gitlab.
 * Repo/project coordinates are parsed from the origin remote when the
 * provider vars leave them empty.
 *
 * If the MR/PR already exists for the source branch (re-run), the existing
 * URL is printed and the exit code is 0 — the step is idempotent.
 *
 * Exit codes: 0 = MR/PR created or already open (URL printed),
 * 1 = config missing, 2 = usage error, 3 = provider API error.
 *
 * ESM module — package.json sets "type": "module". Node >= 18 (global fetch).
 */
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function arg(name, def = undefined) {
    const i = process.argv.indexOf(`--${name}`);
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function findRepoRoot(start) {
    let dir = start;
    while (dir !== dirname(dir)) {
        if (existsSync(join(dir, 'package.json'))) return dir;
        dir = dirname(dir);
    }
    return process.cwd();
}

const ROOT = findRepoRoot(__dirname);

/** Minimal KEY=VALUE parser — enough for the env templates; no dotenv dep. */
function loadEnvFile(file) {
    if (!existsSync(file)) return {};
    const out = {};
    for (const line of readFileSync(file, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
    return out;
}

const fileEnv = {
    ...loadEnvFile(join(ROOT, 'environments', '.env.gitlab')), // legacy
    ...loadEnvFile(join(ROOT, 'environments', '.env.git')),
};
const env = (k, d = '') => (process.env[k] ?? fileEnv[k] ?? d).trim();

function git(cmd) {
    try {
        return execSync(`git ${cmd}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
            .toString().trim();
    } catch {
        return '';
    }
}

/** origin remote → { host, path } for ssh, ssh-alias, and https forms. */
function parseRemote() {
    const url = git('remote get-url origin');
    if (!url) return null;
    const m =
        url.match(/^(?:ssh:\/\/)?(?:[\w.-]+@)?([^:/]+)[:/](.+?)(?:\.git)?\/?$/) ||
        url.match(/^https?:\/\/(?:[^@]+@)?([^/]+)\/(.+?)(?:\.git)?\/?$/);
    return m ? { host: m[1].toLowerCase(), path: m[2] } : null;
}

function detectProvider(remote) {
    const explicit = (arg('provider') ?? env('GIT_PROVIDER')).toLowerCase();
    if (explicit) return explicit;
    const host = remote?.host ?? '';
    if (host.includes('github')) return 'github';
    if (host.includes('gitlab')) return 'gitlab';
    if (host.includes('bitbucket')) return 'bitbucket';
    if (host.includes('azure') || host.includes('visualstudio')) return 'azure';
    if (env('GITEA_URL')) return 'gitea';
    return '';
}

/** Default MR target = the remote's default branch; fall back to 'main'. */
function defaultTarget() {
    const ref = git('rev-parse --abbrev-ref origin/HEAD');
    return ref ? ref.replace(/^origin\//, '') : 'main';
}

async function call(url, { method = 'POST', headers = {}, body } = {}) {
    const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    return { status: res.status, ok: res.ok, data };
}

function fail(code, msg) {
    process.stderr.write(`[create-mr] ${msg}\n`);
    process.exit(code);
}

// ---------------------------------------------------------------------------
// Provider adapters — each returns the MR/PR web URL (string).
// ---------------------------------------------------------------------------

async function gitlab({ source, target, title, description, remote }) {
    const base = (env('GITLAB_URL', 'https://gitlab.com')).replace(/\/+$/, '');
    const token = env('GITLAB_TOKEN');
    const project = env('GITLAB_PROJECT_ID') || (remote ? encodeURIComponent(remote.path) : '');
    if (!token || !project) fail(1, 'GitLab config missing — set GITLAB_TOKEN (+ GITLAB_PROJECT_ID when the origin remote is not the project) in env or environments/.env.git.');
    const headers = { 'private-token': token };
    const api = `${base}/api/v4/projects/${project}/merge_requests`;

    const res = await call(api, { headers, body: {
        source_branch: source, target_branch: target, title, description,
        remove_source_branch: true,
    }});
    if (res.ok) return res.data.web_url;
    if (res.status === 409) { // already open for this source branch → reuse
        const existing = await call(`${api}?source_branch=${encodeURIComponent(source)}&state=opened`, { method: 'GET', headers });
        if (existing.ok && existing.data[0]?.web_url) return existing.data[0].web_url;
    }
    fail(3, `GitLab API ${res.status}: ${JSON.stringify(res.data).slice(0, 300)}`);
}

async function github({ source, target, title, description, remote }) {
    const api = (env('GITHUB_API_URL', 'https://api.github.com')).replace(/\/+$/, '');
    const token = env('GITHUB_TOKEN');
    const repo = env('GITHUB_REPO') || remote?.path || '';
    if (!token || !repo) fail(1, 'GitHub config missing — set GITHUB_TOKEN (+ GITHUB_REPO owner/repo when the origin remote is not the repo) in env or environments/.env.git.');
    const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' };
    const owner = repo.split('/')[0];

    const res = await call(`${api}/repos/${repo}/pulls`, { headers, body: {
        head: source, base: target, title, body: description,
    }});
    if (res.ok) return res.data.html_url;
    const msg = JSON.stringify(res.data);
    if (res.status === 422 && /already exists/i.test(msg)) { // re-run → reuse
        const existing = await call(`${api}/repos/${repo}/pulls?head=${owner}:${encodeURIComponent(source)}&state=open`, { method: 'GET', headers });
        if (existing.ok && existing.data[0]?.html_url) return existing.data[0].html_url;
    }
    fail(3, `GitHub API ${res.status}: ${msg.slice(0, 300)}`);
}

async function bitbucket({ source, target, title, description, remote }) {
    const workspace = env('BITBUCKET_WORKSPACE') || remote?.path.split('/')[0] || '';
    const repo = env('BITBUCKET_REPO') || remote?.path.split('/')[1] || '';
    const token = env('BITBUCKET_TOKEN');
    const user = env('BITBUCKET_USER');
    const appPassword = env('BITBUCKET_APP_PASSWORD');
    if ((!token && !(user && appPassword)) || !workspace || !repo) {
        fail(1, 'Bitbucket config missing — set BITBUCKET_TOKEN (or BITBUCKET_USER + BITBUCKET_APP_PASSWORD), plus BITBUCKET_WORKSPACE/BITBUCKET_REPO when the origin remote is not the repo.');
    }
    const headers = token
        ? { authorization: `Bearer ${token}` }
        : { authorization: `Basic ${Buffer.from(`${user}:${appPassword}`).toString('base64')}` };

    const res = await call(`https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/pullrequests`, { headers, body: {
        title,
        summary: { raw: description || '' },
        source: { branch: { name: source } },
        destination: { branch: { name: target } },
        close_source_branch: true,
    }});
    if (res.ok) return res.data.links?.html?.href;
    fail(3, `Bitbucket API ${res.status}: ${JSON.stringify(res.data).slice(0, 300)}`);
}

async function azure({ source, target, title, description }) {
    const org = (env('AZURE_DEVOPS_ORG_URL')).replace(/\/+$/, '');
    const project = env('AZURE_DEVOPS_PROJECT');
    const repo = env('AZURE_DEVOPS_REPO');
    const pat = env('AZURE_DEVOPS_PAT');
    if (!org || !project || !repo || !pat) fail(1, 'Azure DevOps config missing — set AZURE_DEVOPS_ORG_URL + AZURE_DEVOPS_PROJECT + AZURE_DEVOPS_REPO + AZURE_DEVOPS_PAT (remote auto-detection is not supported for Azure).');
    const headers = { authorization: `Basic ${Buffer.from(`:${pat}`).toString('base64')}` };

    const res = await call(`${org}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repo)}/pullrequests?api-version=7.1`, { headers, body: {
        sourceRefName: `refs/heads/${source}`,
        targetRefName: `refs/heads/${target}`,
        title,
        description: description || '',
    }});
    if (res.ok) return `${org}/${encodeURIComponent(project)}/_git/${encodeURIComponent(repo)}/pullrequest/${res.data.pullRequestId}`;
    fail(3, `Azure DevOps API ${res.status}: ${JSON.stringify(res.data).slice(0, 300)}`);
}

async function gitea({ source, target, title, description, remote }) {
    const base = (env('GITEA_URL')).replace(/\/+$/, '');
    const token = env('GITEA_TOKEN');
    const repo = env('GITEA_REPO') || remote?.path || '';
    if (!base || !token || !repo) fail(1, 'Gitea config missing — set GITEA_URL + GITEA_TOKEN (+ GITEA_REPO owner/repo when the origin remote is not the repo).');
    const headers = { authorization: `token ${token}` };

    const res = await call(`${base}/api/v1/repos/${repo}/pulls`, { headers, body: {
        head: source, base: target, title, body: description,
    }});
    if (res.ok) return res.data.html_url;
    fail(3, `Gitea API ${res.status}: ${JSON.stringify(res.data).slice(0, 300)}`);
}

const ADAPTERS = { gitlab, github, bitbucket, azure, gitea };

// ---------------------------------------------------------------------------

async function main() {
    const source = arg('source');
    const title = arg('title');
    if (!source || !title) fail(2, 'usage: create-mr.js --source <branch> --title <title> [--target <branch>] [--description-file <md>] [--provider gitlab|github|bitbucket|azure|gitea]');

    const descriptionFile = arg('description-file');
    if (descriptionFile && !existsSync(descriptionFile)) fail(2, `description file not found: ${descriptionFile}`);
    const description = descriptionFile ? readFileSync(descriptionFile, 'utf8') : '';

    const remote = parseRemote();
    const provider = detectProvider(remote);
    if (!provider) fail(1, 'Cannot detect the git provider from the origin remote — pass --provider or set GIT_PROVIDER (gitlab|github|bitbucket|azure|gitea).');
    const adapter = ADAPTERS[provider];
    if (!adapter) fail(2, `unknown provider "${provider}" — expected gitlab|github|bitbucket|azure|gitea`);

    const target = arg('target', defaultTarget());
    const url = await adapter({ source, target, title, description, remote });
    process.stdout.write(`[create-mr] ${provider} MR/PR ready: ${url}\n`);
}

main().catch(err => fail(3, err.message));
