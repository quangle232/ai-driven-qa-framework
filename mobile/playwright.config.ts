/**
 * Mobile module — Playwright mobile-web emulation + native Appium.
 * Run in isolation:  npx playwright test -c mobile/playwright.config.ts
 * Native is registered only when ALLOW_MOBILE_NATIVE=1.
 */
import { defineConfig } from "@playwright/test";
import { base, devices } from "../config/playwright.base";
import { APP_STORAGE_STATE } from "../ui/helpers/auth-config";

export default defineConfig({
    ...base,
    testDir: "./tests",
    // mobile-web reuses the web session; native runs set SKIP_WEB_AUTH=1.
    globalSetup: "../ui/helpers/global-setup.ts",
    use: { ...base.use, storageState: APP_STORAGE_STATE },
    projects: [
        { name: "mobile-web-android", testMatch: "**/*.mobile-web.spec.ts", use: { ...devices["Pixel 7"] } },
        { name: "mobile-web-ios", testMatch: "**/*.mobile-web.spec.ts", use: { ...devices["iPhone 14"] } },
        ...(process.env.ALLOW_MOBILE_NATIVE
            ? [{ name: "mobile-native", testMatch: "**/*.native.spec.ts", use: { storageState: undefined } }]
            : []),
    ],
});
