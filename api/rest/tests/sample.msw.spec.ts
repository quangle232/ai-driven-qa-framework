/**
 * SAMPLE MSW spec — the IN-PROCESS mock layer (node `fetch` + MSW).
 *
 * Use MSW when you drive the API through node `fetch`/`axios`, want to mock the
 * app's own outbound calls, or need to INJECT failures (5xx, latency) to test
 * client error handling. MSW does NOT intercept Playwright's `request` — for
 * that, use the Express mock (see `tests/api/sample.api.spec.ts`).
 */
import { test, expect } from "@core/test";
import { TAGS, tags } from "@core/test-tags";
import { setJiraStory } from "@core/jira/jira-story";
import { http, HttpResponse } from "msw";
import { server } from "@api/rest/mock/msw/server";
import { MSW_BASE } from "@api/rest/mock/msw/handlers";
import { mockStore } from "@api/rest/mock/store";
import { UserListSchema } from "@api/rest/models/sample.model";

test.describe("Sample API — in-process MSW mocking", () => {
    test.beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
    test.beforeEach(() => mockStore.reset());
    test.afterEach(() => server.resetHandlers());
    test.afterAll(() => server.close());

    test(
        "intercepts GET /users and returns schema-valid data",
        tags(TAGS.API, TAGS.REGRESSION, TAGS.P2),
        async () => {
            setJiraStory("PROJ-API-2");

            const res = await fetch(`${MSW_BASE}/users`);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(() => UserListSchema.parse(data)).not.toThrow();
        },
    );

    test(
        "can inject a 500 to verify client error handling",
        tags(TAGS.API, TAGS.REGRESSION, TAGS.P2),
        async () => {
            setJiraStory("PROJ-API-2");

            // Override just for this test — MSW resets handlers afterEach.
            server.use(
                http.get(`${MSW_BASE}/users`, () =>
                    HttpResponse.json({ error: "server_error", message: "boom" }, { status: 500 })),
            );

            const res = await fetch(`${MSW_BASE}/users`);
            expect(res.status).toBe(500);
        },
    );
});
