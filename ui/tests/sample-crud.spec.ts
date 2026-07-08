import { test, expect } from '@core/test';
import { TAGS, tags } from '@core/test-tags';
import { setJiraStory } from '@core/jira/jira-story';
import { SamplePage } from '@ui/page-objects/sample/sample-page';
import { SampleUserApi } from '@ui/helpers/sample-user-api';
import { makeSampleUser, sampleExpected } from '@ui/test-data/sample-data';

/**
 * SAMPLE spec — CRUD test-data lifecycle (framework-conventions §12).
 * Keep / delete / clone for your project; search `sample` for what to swap.
 *
 * Demonstrates the two shapes of a data-creating test:
 *   B — the test only NEEDS data (search/edit/list): the precondition is
 *       created VIA API (SampleUserApi over api-support), never through the UI.
 *   A — the CREATE itself is the thing under test: drive the UI, capture the
 *       new id from the POM.
 * EITHER way: every created id is tracked in `createdUserIds` and deleted
 * VIA API in `afterEach` — which runs even when the test FAILS, and tolerates
 * 404 (idempotent) — so the suite always leaves the SUT clean.
 *
 * Try it live: `yarn mock:api` (the bundled mock serves POST/DELETE /users),
 * then point SUPPORT_API_URL at your real API when you adapt it.
 */
test.describe('sample — CRUD test-data lifecycle', () => {
    /** Every id this spec creates, whatever the test outcome. */
    const createdUserIds: string[] = [];
    let userApi: SampleUserApi;

    test.beforeEach(async ({ request }) => {
        userApi = new SampleUserApi(request);
    });

    // Teardown is API-only (never re-drive the UI) and runs on failure too.
    test.afterEach(async () => {
        for (const id of createdUserIds.splice(0)) {
            // deleteUser accepts 404 — resource already gone is a clean state.
            await userApi.deleteUser(id).catch(() => { /* network blip — never fail teardown */ });
        }
    });

    test(
        'B — search finds a user (precondition seeded VIA API)',
        tags(TAGS.UI, TAGS.REGRESSION, TAGS.P1),
        async ({ page }) => {
            setJiraStory('PROJ-1'); // ← replace with the real user story key

            // Unique per run (uuid suffix) — parallel workers / retries never collide.
            const user = makeSampleUser();

            await test.step('Precondition: create the user VIA API (not the UI)', async () => {
                const created = await userApi.createUser(user);
                createdUserIds.push(created.id); // track immediately, before any assert
            });

            await test.step('Exercise the functionality under test through the UI', async () => {
                const samplePage = new SamplePage(page);
                await samplePage.open(process.env.APP_URL ?? '/');
                // TODO(sample): replace with your app's real search flow, e.g.
                //   await searchPage.search(user.username);
                //   expect.soft(await searchPage.firstResultText()).toContain(user.username);
                const heading = await samplePage.getHeadingText();
                expect.soft(heading, 'Heading text mismatch')
                    .toContain(sampleExpected.headingContains);
            });
        }
    );

    test(
        'A — create via the UI IS the test (still cleans up VIA API)',
        tags(TAGS.UI, TAGS.REGRESSION, TAGS.P1),
        async ({ page }) => {
            setJiraStory('PROJ-1'); // ← replace with the real user story key

            const user = makeSampleUser();
            const samplePage = new SamplePage(page);

            await test.step('Create through the UI — this IS the behaviour under test', async () => {
                await samplePage.open(process.env.APP_URL ?? '/');
                // TODO(sample): replace with your app's real create flow. The POM
                // method should RETURN the new entity's id (read it from the
                // success toast / URL / row), so the spec can track it:
                //   const id = await createUserPage.createUser(user);
                //   createdUserIds.push(id);
                await samplePage.fillEmail(user.email);
                await samplePage.submit();
                await samplePage.verifyFlashVisible();
            });

            await test.step('Verify the outcome', async () => {
                // TODO(sample): assert the created entity is visible/correct in the UI.
                // On a shared SUT assert against LIVE data (the row you created),
                // never hardcoded counts — see docs/ai/LESSONS-LEARNED.md.
            });
        }
    );
});
