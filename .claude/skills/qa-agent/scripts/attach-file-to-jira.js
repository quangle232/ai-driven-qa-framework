#!/usr/bin/env node
/**
 * attach-file-to-jira.js — upload a file as a Jira issue attachment.
 *
 * The Atlassian MCP connector has NO attachment-upload tool (issues and
 * pages only), so the qa-agent uses this script for the "attach the Excel
 * export to the parent story" step (test-management.md, excel adapter).
 *
 * Usage:
 *   node .claude/skills/qa-agent/scripts/attach-file-to-jira.js \
 *     --issue EAST-123 \
 *     --file  test-output/ai/TestCases_login.xlsx
 *
 * Credentials: JIRA_URL / JIRA_EMAIL / JIRA_TOKEN env vars, falling back to
 * environments/.env.jira (same contract as helper/jira/jira-bug-reporter.ts).
 *
 * Exit codes: 0 = attached, 1 = credentials missing, 2 = usage / file
 * missing, 3 = Jira API error.
 *
 * ESM module — package.json sets "type": "module". Node >= 18 (global fetch,
 * FormData, Blob).
 */
import { existsSync, readFileSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function arg(name) {
    const i = process.argv.indexOf(`--${name}`);
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}

function findRepoRoot(start) {
    let dir = start;
    while (dir !== dirname(dir)) {
        if (existsSync(join(dir, 'package.json'))) return dir;
        dir = dirname(dir);
    }
    return process.cwd();
}

/** Env vars first, then environments/.env.jira (never printed, never persisted). */
function loadConfig() {
    const fromFile = {};
    const file = join(findRepoRoot(__dirname), 'environments', '.env.jira');
    if (existsSync(file)) {
        for (const line of readFileSync(file, 'utf8').split('\n')) {
            const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
            if (m) fromFile[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
    }
    return {
        baseUrl: (process.env.JIRA_URL ?? fromFile.JIRA_URL ?? '').replace(/\/+$/, ''),
        email: process.env.JIRA_EMAIL ?? fromFile.JIRA_EMAIL ?? '',
        apiToken: process.env.JIRA_TOKEN ?? fromFile.JIRA_TOKEN ?? '',
    };
}

async function main() {
    const issue = arg('issue');
    const filePath = arg('file');
    if (!issue || !filePath) {
        console.error('usage: attach-file-to-jira.js --issue <KEY> --file <path>');
        process.exit(2);
    }
    const abs = resolve(filePath);
    if (!existsSync(abs)) {
        console.error(`Error: file not found: ${abs}`);
        process.exit(2);
    }

    const cfg = loadConfig();
    if (!cfg.baseUrl || !cfg.email || !cfg.apiToken) {
        console.error(
            'Jira credentials missing — set JIRA_URL/JIRA_EMAIL/JIRA_TOKEN env vars or fill environments/.env.jira '
            + '(copy environments/.env.jira.example). Nothing was uploaded.',
        );
        process.exit(1);
    }

    const form = new FormData();
    form.append('file', new Blob([readFileSync(abs)]), basename(abs));

    const response = await fetch(`${cfg.baseUrl}/rest/api/3/issue/${issue}/attachments`, {
        method: 'POST',
        headers: {
            Authorization: 'Basic ' + Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString('base64'),
            // Required by Jira to bypass XSRF protection on attachment uploads.
            'X-Atlassian-Token': 'no-check',
        },
        body: form,
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '<unreadable>');
        console.error(`Jira attachment upload failed: HTTP ${response.status} — ${body.slice(0, 500)}`);
        process.exit(3);
    }

    const created = await response.json();
    for (const att of created) {
        console.log(`Attached: ${att.filename} -> ${cfg.baseUrl}/browse/${issue} (attachment id ${att.id})`);
    }
    process.exit(0);
}

main().catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(3);
});
