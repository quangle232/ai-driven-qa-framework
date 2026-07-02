/**
 * SAMPLE mobile-web spec — Playwright device emulation.
 *
 * Reuses the EXISTING POM + ActionKeyword unchanged; the only difference from a
 * desktop spec is the project (Pixel 7 / iPhone 14 viewport + touch), set in
 * config/playwright.config.ts. Runs against the SUT like the web suite
 * (`yarn test:mobile:web`).
 */
import { test, expect } from "@core/test";
import { TAGS, tags } from "@core/test-tags";
import { setJiraStory } from "@core/jira/jira-story";
import { SamplePage } from "@ui/page-objects/sample/sample-page";
import { sampleExpected } from "@ui/test-data/sample-data";

test(
    "mobile-web — verify the post-login heading on a phone viewport",
    tags(TAGS.MOBILE, TAGS.MOBILE_WEB, TAGS.SMOKE, TAGS.P1),
    async ({ page }) => {
        setJiraStory("PROJ-MOB-2");
        const samplePage = new SamplePage(page);

        await test.step("open the landing page", async () => {
            await samplePage.open(process.env.APP_URL ?? "/");
        });

        await test.step("the layout renders at a mobile width", () => {
            const width = page.viewportSize()?.width ?? 9999;
            expect(width, "expected an emulated phone viewport").toBeLessThan(600);
        });

        await test.step("verify the heading text", async () => {
            const heading = await samplePage.getHeadingText();
            expect(heading, "heading text mismatch").toContain(sampleExpected.headingContains);
        });
    },
);
