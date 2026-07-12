import { test as base, expect } from '@playwright/test';
import { reportBugToJira } from '@core/jira/jira-bug-reporter';
import { getJiraStory } from '@core/jira/jira-story';
import { writeBugDraft, BUG_DRAFTS_DIR } from '@core/jira/bug-draft-writer';

/**
 * Framework-wide `test` with a failure → Jira-bug reporter behind a
 * HUMAN APPROVAL GATE.
 *
 * Every spec imports `test` and `expect` from THIS file (not from
 * `@playwright/test`) so the auto-fixture below applies suite-wide:
 *
 *     import { test, expect } from '<...>/helper/test';
 *
 * Default behavior: a final-attempt failure writes a bug DRAFT to
 * `test-output/ai/bug-drafts/` — a JSON for the agent AND a self-contained
 * HTML page for humans (summary, story link, reproduction command, error,
 * embedded screenshot evidence). Nothing is created in Jira. A human (or the
 * qa-agent skill, after explicit approval in chat) reviews the drafts and
 * files the real bugs. This prevents a broken selector or an env hiccup from
 * spamming the user story with auto-bugs.
 *
 * Set `JIRA_AUTO_BUG=yes` explicitly to restore direct auto-filing (deduped,
 * linked to the story set via `setJiraStory(...)` — see jira-bug-reporter.ts).
 *
 * Note on retries: the fixture only fires on the FINAL failed attempt (after
 * all `test.retries` are exhausted). Earlier failed attempts surface a
 * "⏳ Will retry — bug report deferred" step in Allure so the audience still
 * sees the activity. A flaky test (fails-then-passes-on-retry) produces
 * nothing. The fixture never throws.
 */

const AUTO_BUG_ENABLED = (process.env.JIRA_AUTO_BUG ?? 'no').trim().toLowerCase() === 'yes';

export const test = base.extend<{ jiraBugOnFailure: void }>({
    jiraBugOnFailure: [
        async ({}, use) => {
            // run the test
            await use();

            const testInfo = base.info();
            if (testInfo.status === testInfo.expectedStatus) return; // passed
            // Only real failures draft/file bugs. 'interrupted' (Ctrl+C mid-run)
            // and 'skipped' also differ from expectedStatus but must never
            // create a Jira artifact — an aborted run is not a product defect.
            if (testInfo.status !== 'failed' && testInfo.status !== 'timedOut') return;

            // Only fire on the FINAL failed attempt. Uses the public
            // project-level retries; per-describe retry overrides
            // (test.describe.configure({ retries })) are NOT honored — the
            // private API that exposed them is version-fragile and reads as
            // undefined on current Playwright.
            const maxRetries: number = testInfo.project.retries ?? 0;

            if (testInfo.retry < maxRetries) {
                await base.step(
                    `⏳ Will retry (attempt ${testInfo.retry + 1}/${maxRetries + 1}) — bug report deferred until final attempt`,
                    async () => { /* informative step; no Jira call yet */ }
                );
                return;
            }

            const story = getJiraStory();
            if (!story) {
                await base.step(
                    '⚠️ Bug creation skipped (no jira-story set — call setJiraStory(...) at the top of the test)',
                    async () => { /* surfaced as a visible step */ }
                );
                return;
            }

            const errorHead = (testInfo.error?.message ?? 'Unknown error')
                .split('\n')
                .slice(0, 6)
                .join('\n');

            const summary = `[Auto] ${testInfo.title}`;
            const description = [
                `Failing test: ${testInfo.title}`,
                `Spec file:    ${testInfo.file}`,
                `Parent story: ${story}`,
                `Retry:        ${testInfo.retry}`,
                `Duration:     ${(testInfo.duration / 1000).toFixed(1)}s`,
                ``,
                `Error:`,
                errorHead,
            ].join('\n');

            if (!AUTO_BUG_ENABLED) {
                // Human approval gate: record a draft (JSON + human-friendly
                // HTML with embedded evidence), never touch Jira.
                await base.step(
                    `📝 Bug DRAFT recorded for ${story} — NOT filed (human approval required; open ${BUG_DRAFTS_DIR}/index.html)`,
                    async () => {
                        const images = testInfo.attachments
                            .filter((a) => a.contentType.startsWith('image/'))
                            .map((a) => ({ name: a.name, path: a.path, body: a.body ?? undefined, contentType: a.contentType }));
                        const env = process.env.test_env ?? 'test';
                        const reproCommand =
                            `npx cross-env test_env=${env} playwright test ` +
                            `-c config/playwright.config.ts --grep "${testInfo.title.replace(/"/g, '\\"')}"`;
                        const htmlPath = writeBugDraft({
                            parentStoryKey: story,
                            summary,
                            description,
                            specFile: testInfo.file,
                            testTitle: testInfo.title,
                            reproCommand,
                            outputDir: testInfo.outputDir,
                            images,
                            jiraBaseUrl: process.env.JIRA_URL,
                        });
                        if (htmlPath) {
                            testInfo.annotations.push({ type: 'jira-bug-draft', description: htmlPath });
                            console.log(`[jira-bug] draft written (NOT filed): ${htmlPath} — review and approve before creating in Jira, or set JIRA_AUTO_BUG=yes.`);
                        }
                    }
                );
                return;
            }

            await base.step(`🐞 Report failure to Jira (parent: ${story})`, async () => {
                const result = await reportBugToJira({
                    parentStoryKey: story,
                    summary,
                    description,
                });

                if (result) {
                    const verb = result.created ? 'Bug created' : 'Existing bug reused';
                    await base.step(
                        `✅ ${verb}: ${result.key} (linked to ${story})`,
                        async () => {
                            testInfo.annotations.push({ type: 'jira-bug', description: result.key });
                            console.log(`[jira-bug] ${verb}: ${result.key} (parent ${story})`);
                        }
                    );
                } else {
                    await base.step(
                        '⚠️ Bug creation skipped (credentials missing or API error)',
                        async () => { /* surfaced as a visible step */ }
                    );
                }
            });
        },
        { auto: true }, // apply to every test without opt-in
    ],
});

export { expect };
