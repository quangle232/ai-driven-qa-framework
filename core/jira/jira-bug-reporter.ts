import axios from 'axios';
import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

// Every Jira call is bounded: axios defaults to NO timeout, and this reporter
// runs inside fixture teardown — an unresponsive Jira must degrade to the
// catch/warn/return-null path, never hang the run.
const jira = axios.create({ timeout: 30_000 });

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ReportBugInput {
    /** The user-story / parent Jira key, e.g. "PROJ-1". */
    parentStoryKey: string;
    /** Short bug title — usually the failing test title. */
    summary: string;
    /** Free-form details: error message, spec file, env, browser, etc. */
    description: string;
    /** Issue type to create — defaults to "Bug". */
    bugIssueType?: string;
}

export interface ReportBugResult {
    /** Jira bug key (e.g. "DP-19"). */
    key: string;
    /** true  = a new bug was created.
     *  false = an existing OPEN bug with the same summary was found and reused. */
    created: boolean;
}

interface JiraConfig {
    baseUrl: string;     // https://<tenant>.atlassian.net
    email: string;       // Jira account e-mail
    apiToken: string;    // Atlassian API token
    projectKey: string;  // e.g. "PROJ" (from PROJ-1)
}

// In-process dedupe: at most one bug per failing test title within a run.
// Prevents 3× duplicate bugs when retries are enabled.
const reported = new Set<string>();

/**
 * Report a failing test to Jira: if an OPEN bug with the same summary already
 * exists in the project, reuse it; otherwise create a new Bug and link it to
 * the user story.
 *
 * Returns `{ key, created }` — `created: false` means an existing bug was
 * reused. Returns `null` when skipped (credentials missing, API error, or the
 * test was already reported this run). NEVER throws — bug reporting is a side
 * channel; a Jira problem must not break the test or run.
 *
 * Credentials are read from `environments/.env.jira` or from env vars
 * `JIRA_URL`, `JIRA_EMAIL`, `JIRA_TOKEN`, `JIRA_PROJECT`.
 */
export async function reportBugToJira(input: ReportBugInput): Promise<ReportBugResult | null> {
    const dedupKey = `${input.parentStoryKey}::${input.summary}`;
    if (reported.has(dedupKey)) return null;
    reported.add(dedupKey);

    const cfg = loadConfig();
    if (!cfg.baseUrl || !cfg.email || !cfg.apiToken) {
        console.warn(
            '[jira-bug] credentials missing — check environments/.env.jira or '
            + 'set JIRA_URL/JIRA_EMAIL/JIRA_TOKEN env vars. Skipping bug creation.'
        );
        return null;
    }

    const auth = 'Basic ' + Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString('base64');
    const headers = {
        Authorization: auth,
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };
    const base = cfg.baseUrl.replace(/\/+$/, '');
    const issueType = input.bugIssueType ?? 'Bug';

    // 1) Look for an existing OPEN bug with the same summary in this project.
    //    A Done/Closed bug is treated as fixed — a fresh failure means a
    //    regression, so we create a new bug in that case.
    try {
        const existing = await findOpenBugBySummary(
            base, headers, cfg.projectKey, issueType, input.summary
        );
        if (existing) {
            console.log(`[jira-bug] reusing existing open bug ${existing} for "${input.summary}"`);
            return { key: existing, created: false };
        }
    } catch (e: any) {
        // Search failure must not block creation — fall through.
        console.warn(`[jira-bug] search failed (will create a new bug instead): ${e.message}`);
    }

    // 2) Create a fresh bug.
    let bugKey: string;
    try {
        const create = await jira.post(
            `${base}/rest/api/3/issue`,
            {
                fields: {
                    project: { key: cfg.projectKey },
                    issuetype: { name: issueType },
                    summary: input.summary,
                    description: toAdfDoc(input.description),
                },
            },
            { headers }
        );
        bugKey = create.data.key as string;
    } catch (e: any) {
        const detail =
            e.response?.data?.errorMessages?.join('; ') ||
            JSON.stringify(e.response?.data?.errors ?? {}) ||
            e.message;
        console.warn(`[jira-bug] could not create bug for "${input.summary}": ${detail}`);
        return null;
    }

    // 3) Link the new bug to the user story ("Relates" is universally available).
    try {
        await jira.post(
            `${base}/rest/api/3/issueLink`,
            {
                type: { name: 'Relates' },
                inwardIssue: { key: bugKey },
                outwardIssue: { key: input.parentStoryKey },
            },
            { headers }
        );
    } catch (e: any) {
        console.warn(
            `[jira-bug] created ${bugKey} but linking to ${input.parentStoryKey} failed: `
            + (e.response?.data?.errorMessages?.join('; ') || e.message)
        );
    }

    return { key: bugKey, created: true };
}

/**
 * Find the first OPEN bug in `projectKey` whose summary equals `summary`.
 * Uses Jira Cloud's `/rest/api/3/search/jql` endpoint (the legacy
 * `/rest/api/3/search` was REMOVED in 2025 — see Atlassian CHANGE-2046).
 *
 * Strategy: JQL `~` (fuzzy contains) on a sanitised search term, then a
 * client-side EXACT summary match so we never false-merge into an unrelated
 * bug. Returns the bug key or null.
 *
 * Note: Jira's text index is asynchronous — a bug created seconds ago may
 * not be searchable yet. In-process dedupe (the `reported` Set) covers the
 * same-run case; the search covers cross-run dedupe.
 */
async function findOpenBugBySummary(
    base: string,
    headers: Record<string, string>,
    projectKey: string,
    issueType: string,
    summary: string
): Promise<string | null> {
    // Strip Lucene special chars from the search term — JQL `~` is fuzzy text
    // search and these chars otherwise become wildcards / operators.
    const searchTerm = summary
        .replace(/[+\-&|!(){}\[\]^"~*?:\\\/]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!searchTerm) return null;

    const jql =
        `project = "${projectKey}" `
        + `AND issuetype = "${issueType}" `
        + `AND summary ~ "${searchTerm}" `
        + `AND statusCategory != Done `
        + `ORDER BY created DESC`;

    // NEW endpoint: POST /rest/api/3/search/jql with JSON body.
    const res = await jira.post(
        `${base}/rest/api/3/search/jql`,
        { jql, fields: ['summary', 'status'], maxResults: 20 },
        { headers }
    );

    const issues: Array<{ key: string; fields: { summary: string } }> =
        res.data?.issues ?? [];
    // JQL ~ is fuzzy — require exact summary match client-side.
    return issues.find((i) => i.fields.summary === summary)?.key ?? null;
}

/** Minimal Atlassian Document Format wrapper around plain text. */
function toAdfDoc(text: string) {
    return {
        type: 'doc',
        version: 1,
        content: text.split('\n').map((line) => ({
            type: 'paragraph',
            content: line ? [{ type: 'text', text: line }] : [],
        })),
    };
}

/** Config: env vars take priority; fall back to environments/.env.jira. */
function loadConfig(): JiraConfig {
    const fromEnv = {
        baseUrl: process.env.JIRA_URL,
        email: process.env.JIRA_EMAIL,
        apiToken: process.env.JIRA_TOKEN,
        projectKey: process.env.JIRA_PROJECT,
    };

    const fromFile: Record<string, string> = {};
    const file = join(findRepoRoot(__dirname), 'environments', '.env.jira');
    if (existsSync(file)) {
        for (const line of readFileSync(file, 'utf8').split('\n')) {
            const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
            if (m) fromFile[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
    }

    return {
        baseUrl: fromEnv.baseUrl ?? fromFile.JIRA_URL ?? '',
        email: fromEnv.email ?? fromFile.JIRA_EMAIL ?? '',
        apiToken: fromEnv.apiToken ?? fromFile.JIRA_TOKEN ?? '',
        projectKey: fromEnv.projectKey ?? fromFile.JIRA_PROJECT ?? 'DP',
    };
}

function findRepoRoot(start: string): string {
    let dir = start;
    while (dir !== resolve(dir, '..')) {
        if (existsSync(join(dir, 'package.json'))) return dir;
        dir = resolve(dir, '..');
    }
    return process.cwd();
}
