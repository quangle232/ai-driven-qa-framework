/**
 * SAMPLE native-mobile spec (Appium via WebdriverIO) — replace with your app's.
 *
 * Skip-gated: needs a device/emulator + a running Appium server + an app build
 * (MOBILE_APP). Run with `yarn test:mobile:native` (sets ALLOW_MOBILE_NATIVE=1).
 * Consistent with the destructive-test discipline in CLAUDE.md — never let an
 * infra-dependent suite block the shared regression.
 */
import { test, expect } from "@mobile/helpers/test-mobile";
import { TAGS, tags } from "@core/test-tags";
import { setJiraStory } from "@core/jira/jira-story";
import { SampleLoginScreen } from "@mobile/screen-objects/sample-login.screen";

const native = process.env.ALLOW_MOBILE_NATIVE ? test : test.skip;

native(
    "native login shows the welcome screen",
    tags(TAGS.MOBILE, TAGS.MOBILE_NATIVE, TAGS.REGRESSION, TAGS.P1),
    async ({ mobileKeyword }) => {
        setJiraStory("PROJ-MOB-1");
        const login = new SampleLoginScreen(mobileKeyword);

        await test.step("sign in", () => login.login("demo", "demo-pass"));

        await test.step("verify the welcome text", async () => {
            const welcome = await login.getWelcomeText();
            expect(welcome, "welcome text mismatch").toContain("Welcome");
        });
    },
);
