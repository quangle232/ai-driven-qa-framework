/**
 * `test` for REST API specs — adds an axios-based `apiClient` fixture, built ON
 * TOP of the framework `test` (@core/test) so the failure → Jira-bug auto-reporter
 * still applies. Playwright-free client; runs under the Playwright runner.
 *
 *     import { test, expect } from '@api/rest/helpers/test-api';
 *
 * Mock vs real target:
 *   - No `API_BASE_URL` set → an in-process Express mock is started per worker
 *     (suite passes with no backend).
 *   - `API_BASE_URL` set    → tests hit the real API.
 *   - `API_MOCK=1`          → force the mock even if `API_BASE_URL` is set.
 */
import { test as base, expect } from "@core/test";
import ENV from "@core/env-config";
import { ApiClient } from "@api/rest/clients/rest-client";
import { startMockServer } from "@api/rest/mock/standalone/server";
import { mockStore } from "@api/rest/mock/store";

type ApiWorkerFixtures = {
    /** Effective base URL for the suite: real API or the auto-started mock. */
    apiBaseURL: string;
};
type ApiTestFixtures = {
    apiClient: ApiClient;
};

export const test = base.extend<ApiTestFixtures, ApiWorkerFixtures>({
    apiBaseURL: [
        async ({}, use) => {
            const realBase = process.env.API_BASE_URL;
            const forceMock = process.env.API_MOCK === "1";

            if (realBase && !forceMock) {
                await use(realBase.replace(/\/+$/, ""));
                return;
            }

            const mock = await startMockServer(0);
            try {
                await use(mock.url);
            } finally {
                await mock.close();
            }
        },
        { scope: "worker" },
    ],

    apiClient: async ({ apiBaseURL }, use) => {
        mockStore.reset(); // fresh seed per test
        await use(new ApiClient({ baseURL: apiBaseURL, token: ENV.API_TOKEN }));
    },
});

export { expect };
