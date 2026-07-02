/**
 * Root config — a FULL run across every module (ui + api + mobile). Each module
 * also has its own config for isolation (see `<module>/playwright.config.ts`).
 *   npx playwright test -c config/playwright.config.ts            # everything
 *   ... --project=api-rest | api-grpc | api-graphql | "WEB CHROME" | mobile-web-android
 */
import { defineConfig } from "@playwright/test";
import { base, devices } from "./playwright.base";
import { APP_STORAGE_STATE } from "../ui/helpers/auth-config";

export default defineConfig({
    ...base,
    testDir: "..",
    globalSetup: "../ui/helpers/global-setup.ts",
    use: { ...base.use, storageState: APP_STORAGE_STATE },
    projects: [
        { name: "WEB CHROME", testMatch: "**/ui/tests/**/*.spec.ts", use: { ...devices["Desktop Chrome"] } },
        { name: "api-rest", testMatch: "**/api/rest/tests/**/*.spec.ts", use: { storageState: undefined } },
        { name: "api-grpc", testMatch: "**/api/grpc/tests/**/*.spec.ts", use: { storageState: undefined } },
        { name: "api-graphql", testMatch: "**/api/graphql/tests/**/*.spec.ts", use: { storageState: undefined } },
        { name: "mobile-web-android", testMatch: "**/mobile/tests/**/*.mobile-web.spec.ts", use: { ...devices["Pixel 7"] } },
        { name: "mobile-web-ios", testMatch: "**/mobile/tests/**/*.mobile-web.spec.ts", use: { ...devices["iPhone 14"] } },
        ...(process.env.ALLOW_MOBILE_NATIVE
            ? [{ name: "mobile-native", testMatch: "**/mobile/tests/**/*.native.spec.ts", use: { storageState: undefined } }]
            : []),
    ],
});
