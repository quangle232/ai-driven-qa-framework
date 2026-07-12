import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { basename, join } from 'path';

/**
 * Bug DRAFT writer — the human-approval side of the failure → Jira flow.
 *
 * A final-attempt failure never files a Jira bug directly (see core/test.ts,
 * JIRA_AUTO_BUG gate). Instead this module records the draft twice:
 *   - <slug>.json — machine-readable, what the qa-agent reads to file the
 *     bug via the Jira MCP AFTER the user approves it;
 *   - <slug>.html — self-contained page for humans: summary, parent story,
 *     reproduction command, error, and any image evidence embedded as
 *     base64 (portable — survives copying the file anywhere).
 * It also regenerates bug-drafts/index.html listing every pending draft.
 *
 * Never throws — draft writing is best-effort and must not break teardown.
 */

export const BUG_DRAFTS_DIR = 'test-output/ai/bug-drafts';

export interface BugDraftInput {
    parentStoryKey: string;
    summary: string;
    description: string;
    specFile: string;
    testTitle: string;
    /** Command that reproduces the failure locally. */
    reproCommand: string;
    /** Playwright output dir of the failed test (screenshots/video/trace land here). */
    outputDir: string;
    /** Image attachments present at teardown time ({name, path or body}). */
    images: Array<{ name: string; path?: string; body?: Buffer; contentType: string }>;
    /**
     * Jira base URL (e.g. https://your-org.atlassian.net) used to render the
     * story link in the HTML. Optional — omit and the story key renders as
     * plain text. Callers usually pass JIRA_URL from env / environments/.env.jira.
     */
    jiraBaseUrl?: string;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function slugify(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'failure';
}

function imageToDataUri(image: BugDraftInput['images'][number]): string | null {
    try {
        const buffer = image.body ?? (image.path && existsSync(image.path) ? readFileSync(image.path) : null);
        if (!buffer) {
            return null;
        }
        return `data:${image.contentType};base64,${buffer.toString('base64')}`;
    } catch (error) {
        console.error(`[bug-draft] could not embed image "${image.name}":`, error);
        return null;
    }
}

function renderDraftHtml(input: BugDraftInput, recordedAt: string): string {
    const embedded = input.images
        .map((img) => ({ name: img.name, dataUri: imageToDataUri(img) }))
        .filter((img): img is { name: string; dataUri: string } => !!img.dataUri);

    const evidence = embedded.length
        ? embedded
            .map((img) => `<figure><figcaption>${escapeHtml(img.name)}</figcaption><img src="${img.dataUri}" alt="${escapeHtml(img.name)}"></figure>`)
            .join('\n')
        : `<p class="muted">No screenshot was available at teardown time — open the test output folder for
           screenshots / video / trace:<br><code>${escapeHtml(input.outputDir)}</code></p>`;

    const base = (input.jiraBaseUrl ?? '').replace(/\/+$/, '');
    const storyCell = base
        ? `<a href="${escapeHtml(base)}/browse/${escapeHtml(input.parentStoryKey)}">${escapeHtml(input.parentStoryKey)}</a>`
        : escapeHtml(input.parentStoryKey);

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Bug draft — ${escapeHtml(input.summary)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, sans-serif; margin: 2rem auto; max-width: 900px; padding: 0 1rem; color: #172b4d; }
  h1 { font-size: 1.3rem; } h2 { font-size: 1.05rem; margin-top: 1.6rem; }
  .banner { background: #fffae6; border: 1px solid #ffe380; border-radius: 6px; padding: .7rem 1rem; }
  table { border-collapse: collapse; margin-top: .8rem; } td { padding: .25rem .8rem .25rem 0; vertical-align: top; }
  td:first-child { color: #6b778c; white-space: nowrap; }
  pre { background: #f4f5f7; border-radius: 6px; padding: 1rem; overflow-x: auto; white-space: pre-wrap; }
  code { background: #f4f5f7; padding: .1rem .3rem; border-radius: 4px; }
  figure { margin: 1rem 0; } img { max-width: 100%; border: 1px solid #dfe1e6; border-radius: 6px; }
  figcaption { color: #6b778c; font-size: .85rem; margin-bottom: .3rem; }
  .muted { color: #6b778c; }
</style>
</head>
<body>
<p class="banner">📝 <strong>DRAFT — not filed to Jira.</strong> Review it; the qa-agent files the bug
(deduped, linked to the story) only after explicit approval.</p>
<h1>${escapeHtml(input.summary)}</h1>
<table>
  <tr><td>Parent story</td><td>${storyCell}</td></tr>
  <tr><td>Spec file</td><td><code>${escapeHtml(input.specFile)}</code></td></tr>
  <tr><td>Test</td><td>${escapeHtml(input.testTitle)}</td></tr>
  <tr><td>Recorded</td><td>${escapeHtml(recordedAt)}</td></tr>
</table>
<h2>Steps to reproduce</h2>
<ol>
  <li>Check out the branch with the spec above.</li>
  <li>Run: <pre>${escapeHtml(input.reproCommand)}</pre></li>
  <li>The failing assertion and its context are below; screenshots / video / trace live in the test output folder.</li>
</ol>
<h2>Error</h2>
<pre>${escapeHtml(input.description)}</pre>
<h2>Evidence</h2>
${evidence}
</body>
</html>
`;
}

function regenerateIndex(): void {
    const entries = readdirSync(BUG_DRAFTS_DIR)
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
            try {
                const draft = JSON.parse(readFileSync(join(BUG_DRAFTS_DIR, f), 'utf8'));
                return { file: f, html: f.replace(/\.json$/, '.html'), summary: draft.summary ?? f, story: draft.parentStoryKey ?? '', recordedAt: draft.recordedAt ?? '' };
            } catch (error) {
                console.error(`[bug-draft] unreadable draft ${f} (skipped from index):`, error);
                return null;
            }
        })
        .filter((e): e is NonNullable<typeof e> => !!e);

    const rows = entries.length
        ? entries.map((e) => `<li><a href="${e.html}">${escapeHtml(e.summary)}</a> <span class="muted">— ${escapeHtml(e.story)} · ${escapeHtml(e.recordedAt)}</span></li>`).join('\n')
        : `<li class="muted">No pending drafts 🎉</li>`;

    writeFileSync(join(BUG_DRAFTS_DIR, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Bug drafts — pending human approval</title>
<style>body{font-family:-apple-system,Segoe UI,sans-serif;margin:2rem auto;max-width:800px;padding:0 1rem;color:#172b4d}
.muted{color:#6b778c}li{margin:.4rem 0}</style></head>
<body><h1>📝 Bug drafts — pending human approval</h1>
<p class="muted">Written by the failure fixture (core/test.ts). Nothing here has been filed to Jira.</p>
<ul>
${rows}
</ul></body></html>
`);
}

/** Write <slug>.json + <slug>.html and refresh index.html. Returns the html path or null. */
export function writeBugDraft(input: BugDraftInput): string | null {
    try {
        mkdirSync(BUG_DRAFTS_DIR, { recursive: true });
        const recordedAt = new Date().toISOString();
        const slug = slugify(input.testTitle);

        writeFileSync(join(BUG_DRAFTS_DIR, `${slug}.json`), JSON.stringify({
            parentStoryKey: input.parentStoryKey,
            summary: input.summary,
            description: input.description,
            specFile: input.specFile,
            reproCommand: input.reproCommand,
            outputDir: input.outputDir,
            evidenceImages: input.images.map((i) => i.name),
            recordedAt,
            status: 'draft-awaiting-human-approval',
        }, null, 2));

        const htmlPath = join(BUG_DRAFTS_DIR, `${slug}.html`);
        writeFileSync(htmlPath, renderDraftHtml(input, recordedAt));
        regenerateIndex();
        return htmlPath;
    } catch (error) {
        console.error('[bug-draft] failed to write bug draft:', error);
        return null;
    }
}

/** Basename helper for log lines. */
export function draftDisplayName(htmlPath: string): string {
    return basename(htmlPath);
}

/**
 * Make sure bug-drafts/index.html ALWAYS exists — also after an all-green
 * execution (it then shows "No pending drafts"), so the report link in the
 * finalize summary never dangles. Run via:
 *   npx tsx core/jira/ensure-bug-drafts-index.ts
 */
export function ensureBugDraftsIndex(): void {
    try {
        mkdirSync(BUG_DRAFTS_DIR, { recursive: true });
        regenerateIndex();
    } catch (error) {
        console.error('[bug-draft] failed to (re)generate the drafts index:', error);
    }
}
