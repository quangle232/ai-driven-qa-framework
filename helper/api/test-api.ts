/**
 * `test` for API specs — adds an `apiClient` fixture, built ON TOP of the
 * framework `test` (helper/test.ts) so the failure → Jira-bug auto-reporter
 * still applies. Import this instead of `@playwright/test` in `tests/api`:
 *
 *     import { test, expect } from '../../helper/api/test-api';
 *
 * Mock vs real target:
 *   - No `API_BASE_URL` set        → an in-process Express mock is started per
 *     worker, so the suite passes with no backend.
 *   - `API_BASE_URL` set           → tests hit the real API.
 *   - `API_MOCK=1`                 → force the mock even if `API_BASE_URL` is set.
 *
 * The `mockStore` is reset before each test for isolation.
 */
import { test as base, expect } from "../test";
import ENV from "../env-config";
import { ApiClient } from "../../api/clients/api-client";
import { startMockServer } from "../../api/mock/standalone/server";
import { mockStore } from "../../api/mock/store";

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

    apiClient: async ({ request, apiBaseURL }, use) => {
        mockStore.reset(); // fresh seed per test
        const client = new ApiClient({
            request,
            baseURL: apiBaseURL,
            token: ENV.API_TOKEN,
        });
        await use(client);
    },
});

export { expect };
