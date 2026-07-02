/**
 * UI module (Playwright web) — run in isolation:
 *   npx playwright test -c ui/playwright.config.ts
 */
import { defineConfig } from "@playwright/test";
import { base, devices } from "../config/playwright.base";
import { APP_STORAGE_STATE } from "./helpers/auth-config";

export default defineConfig({
    ...base,
    testDir: "./tests",
    globalSetup: "./helpers/global-setup.ts",
    use: { ...base.use, storageState: APP_STORAGE_STATE },
    projects: [{ name: "WEB CHROME", use: { ...devices["Desktop Chrome"] } }],
});
