/**
 * Shared Playwright settings for every module config. Each module's
 * `playwright.config.ts` spreads `base` and adds its own testDir + projects +
 * (for ui/mobile-web) globalSetup + storageState, so a module runs in isolation
 * via `npx playwright test -c <module>/playwright.config.ts` while all reports
 * land in the same `test-output/` (Allure + JSON + HTML).
 */
import type { PlaywrightTestConfig } from "@playwright/test";
import { devices } from "@playwright/test";
import { loadEnvFile } from "../core/load-env";

loadEnvFile(); // environments/.env.<test_env> (dev|test|prod; default test)

const isCI = !!process.env.CI;

export const base: PlaywrightTestConfig = {
    timeout: 6 * 60_000,
    expect: { timeout: 20_000 },
    fullyParallel: true,
    forbidOnly: isCI,
    retries: isCI ? 2 : 0,
    workers: isCI ? 6 : 2,
    reporter: [
        ["list"],
        ["json", { outputFile: "../test-output/playwright-report.json" }],
        ["html", { open: "never", outputFolder: "../test-output/html" }],
        ["allure-playwright", { detail: true, resultsDir: "test-output/allure-results" }],
    ],
    use: {
        trace: "retain-on-failure",
        screenshot: { mode: "only-on-failure", fullPage: true },
        video: "retain-on-failure",
        viewport: isCI ? { width: 1920, height: 1080 } : null,
        headless: isCI,
    },
};

export { devices };
