import { defineConfig, devices } from '@playwright/test';
import { APP_STORAGE_STATE } from '../helper/auth-config';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import dotenv from 'dotenv';
/* Load the env-specific file chosen via `cross-env test_env=...` (falls back to root .env). */
if (process.env.test_env) {
    dotenv.config({ path: `./environments/.env.${process.env.test_env}`, override: true });
} else {
    dotenv.config();
}

const isCI = !!process.env.CI;
/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
    testDir: '../tests',
    /* Maximum time one test can run for*/
    timeout: 6 * 60000,
    expect: {
        /**
         * Maximum time expect() should wait for the condition to be met.
         * For example in await expect(locator).toHaveText();
         */
        timeout: 20000,
    },
    /* Run tests in files in parallel */
    fullyParallel: true,
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: isCI,
    /* Retry on CI only */
    retries: isCI ? 2 : 0,
    /* Opt out of parallel tests on CI. */
    workers: isCI ? 6 : 2,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    // reporter: isCI ? 'line' : [['list'], ['html', { open: 'never' }]],

    /* add allure report to the reporter */
    reporter: [
        ['list'],
        ['json', { outputFile: '../test-output/playwright-report.json' }],
        ["html", { open: "never", outputFolder: "../test-output/html" }],
        ["line"],
        ["allure-playwright", {
            detail: true,
            resultsDir: "test-output/allure-results",
        }],
    ],

    /* Register global setup script in the Playwright configuration file */
    globalSetup: '../helper/global-setup.ts',
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        /* Base URL to use in actions like `await page.goto('/')`. */
        // baseURL: 'http://127.0.0.1:3000',

        /* Reuse the authenticated + Sandbox-selected session created in global-setup. */
        storageState: APP_STORAGE_STATE,

        /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
        trace: 'retain-on-failure',
        screenshot: {
            mode: 'only-on-failure',
            fullPage: true,
        },
        video: 'retain-on-failure',
        viewport: isCI ? { width: 1920, height: 1080 } : null,
        headless: isCI,
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: 'WEB CHROME',
            use: { ...devices['Desktop Chrome'] },
        },
        /*{
      name: 'safari',
      use: { ...devices['Desktop Safari']},
    },

   /*{
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
        // {
        //   name: 'Mobile Chrome',
        //   use: { ...devices['Pixel 5'] },
        // },
        // {
        //   name: 'Mobile Safari',
        //   use: { ...devices['iPhone 12'] },
        // },

        /* Test against branded browsers. */
        // {
        //   name: 'Microsoft Edge',
        //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
        // },
        // {
        //   name: 'Google Chrome',
        //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
        // },
    ],

    /* Run your local dev server before starting the tests */
    // webServer: {
    //   command: 'npm run start',
    //   url: 'http://127.0.0.1:3000',
    //   reuseExistingServer: !process.env.CI,
    // },
});
