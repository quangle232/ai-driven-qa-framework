import { test, expect } from '../../helper/test';
import { TAGS, tags } from '../../helper/test-tags';
import { setJiraStory } from '../../helper/jira-story';
import { SamplePage } from '../../page-objects/sample/sample-page';
import { sampleInput, sampleExpected } from '../../test-data/sample-data';

/**
 * SAMPLE spec — keep / delete / clone for your project.
 *
 * Demonstrates the framework conventions:
 *   - `import { test, expect } from '<...>/helper/test'`
 *     (NOT from '@playwright/test') so the framework-wide auto-fixture
 *     (failure → Jira-bug reporter) applies.
 *   - `setJiraStory(...)` as the FIRST line of the test body so a bug
 *     created on a genuine final-attempt failure is linked to the right
 *     user story.
 *   - `tags(...)` for the test selection / Jira-label binding.
 *   - `test.step('...')` for readable Allure / HTML reports.
 *
 * Auth is one-time (helper/global-setup.ts + helper/authenticate-set-up.ts);
 * this test starts already-logged-in via `use.storageState`.
 */
test(
    'sample — verify the post-login heading',
    tags(TAGS.SMOKE, TAGS.P1),
    async ({ page }) => {
        setJiraStory('PROJ-1'); // ← replace with the real user story key

        const samplePage = new SamplePage(page);

        await test.step('Open the post-login landing page', async () => {
            await samplePage.open(process.env.APP_URL ?? '/');
        });

        await test.step('Verify the heading text', async () => {
            const heading = await samplePage.getHeadingText();
            expect(heading, 'Heading text mismatch')
                .toContain(sampleExpected.headingContains);
        });

        await test.step('Fill the form and submit', async () => {
            await samplePage.fillEmail(sampleInput.email);
            await samplePage.submit();
            await samplePage.verifyFlashVisible();
        });
    }
);
