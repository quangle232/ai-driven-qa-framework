import { test as base, expect } from '@playwright/test';
import { reportBugToJira } from './jira-bug-reporter';
import { getJiraStory } from './jira-story';

/**
 * Framework-wide `test` with a failure → Jira-bug auto-reporter.
 *
 * Every spec imports `test` and `expect` from THIS file (not from
 * `@playwright/test`) so the auto-fixture below applies suite-wide:
 *
 *     import { test, expect } from '<...>/helper/test';
 *
 * After every test, the fixture inspects the result; on failure it looks up
 * the parent user story declared at the top of the test body via
 * `setJiraStory(...)`, then either reuses the existing OPEN bug or creates a
 * new Bug linked to that story (see `jira-bug-reporter.ts`).
 *
 * Note on retries: the fixture only creates / reuses a bug on the FINAL
 * failed attempt (after all `test.retries` are exhausted). Earlier failed
 * attempts surface a "⏳ Will retry — bug report deferred" step in Allure so
 * the audience still sees the activity, but no Jira call happens. This means
 * a flaky test (fails-then-passes-on-retry) creates NO bug. The bug key on
 * the final attempt surfaces as a nested `test.step` so it shows clearly in
 * the Playwright HTML / Allure report. The fixture never throws.
 */
export const test = base.extend<{ jiraBugOnFailure: void }>({
    jiraBugOnFailure: [
        async ({}, use) => {
            // run the test
            await use();

            const testInfo = base.info();
            if (testInfo.status === testInfo.expectedStatus) return; // passed

            // Only fire the bug-report on the FINAL failed attempt. Playwright's
            // public testInfo.project.retries returns the project-level setting
            // and IGNORES per-test `describe.configure({ retries })` overrides;
            // the effective max lives on the private `_test._retries`. Stable
            // since Playwright 1.20+.
            const maxRetries: number =
                (testInfo as any)._test?._retries ?? testInfo.project.retries ?? 0;

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

            await base.step(`🐞 Report failure to Jira (parent: ${story})`, async () => {
                const errorHead = (testInfo.error?.message ?? 'Unknown error')
                    .split('\n')
                    .slice(0, 6)
                    .join('\n');

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

                const result = await reportBugToJira({
                    parentStoryKey: story,
                    summary: `[Auto] ${testInfo.title}`,
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
