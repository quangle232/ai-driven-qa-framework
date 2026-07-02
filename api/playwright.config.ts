/**
 * API module (REST · gRPC · GraphQL) — Playwright-free clients, Playwright runner.
 * Run in isolation:  npx playwright test -c api/playwright.config.ts
 * A sub-surface only:  ... -c api/playwright.config.ts --project=rest
 *
 * No browser + no web auth (SKIP_WEB_AUTH is set by the api scripts).
 */
import { defineConfig } from "@playwright/test";
import { base } from "../config/playwright.base";

export default defineConfig({
    ...base,
    testDir: ".",
    use: { ...base.use, storageState: undefined },
    projects: [
        { name: "rest", testMatch: "**/rest/tests/**/*.spec.ts" },
        { name: "grpc", testMatch: "**/grpc/tests/**/*.spec.ts" },
        { name: "graphql", testMatch: "**/graphql/tests/**/*.spec.ts" },
    ],
});
