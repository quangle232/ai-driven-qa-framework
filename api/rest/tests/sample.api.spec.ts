/**
 * SAMPLE API spec — Service-Object Model over Playwright's `request`.
 *
 * Demonstrates the conventions (replace with your real services):
 *   - import `test`/`expect` from `helper/api/test-api` (gives `apiClient` +
 *     the failure → Jira-bug auto-fixture)
 *   - call SERVICES, never the raw client — like POM hides `page.locator`
 *   - positive + negative + schema validation + response-time SLA, AAA style
 *
 * Runs against the in-process Express mock with no backend (set `API_BASE_URL`
 * to hit a real API).
 */
import { test, expect } from "@api/rest/helpers/test-api";
import { TAGS, tags } from "@core/test-tags";
import { setJiraStory } from "@core/jira/jira-story";
import { AuthService } from "@api/rest/services/auth.service";
import { UserService } from "@api/rest/services/user.service";

test.describe("Sample API — users + auth", () => {
    test(
        "GET /users returns a schema-valid list within SLA",
        tags(TAGS.API, TAGS.REGRESSION, TAGS.P1),
        async ({ apiClient }) => {
            setJiraStory("PROJ-API-1");
            const users = new UserService(apiClient);

            const res = await test.step("list users", () => users.list());

            expect(res.status).toBe(200);
            expect(res.data.length, "seed users present").toBeGreaterThan(0);
            expect(res.durationMs, "list users should respond < 1s").toBeLessThan(1000);
        },
    );

    test(
        "POST /users creates a user (201) then GET returns it",
        tags(TAGS.API, TAGS.REGRESSION, TAGS.P1),
        async ({ apiClient }) => {
            setJiraStory("PROJ-API-1");
            const users = new UserService(apiClient);

            const created = await test.step("create user", () =>
                users.create({ username: "newbie", email: "newbie@example.com" }));
            expect(created.status).toBe(201);

            const fetched = await test.step("read it back", () => users.getById(created.data.id));
            expect(fetched.data).toMatchObject({ username: "newbie", email: "newbie@example.com" });

            await test.step("clean up (leave the SUT clean)", () => users.remove(created.data.id));
        },
    );

    test(
        "GET /users/:id unknown -> 404 error envelope",
        tags(TAGS.API, TAGS.REGRESSION, TAGS.P2),
        async ({ apiClient }) => {
            setJiraStory("PROJ-API-1");
            const users = new UserService(apiClient);

            const res = await users.getByIdExpectingNotFound("does-not-exist");

            expect(res.status).toBe(404);
            expect(res.data.error).toBe("not_found");
        },
    );

    test(
        "POST /users with invalid email -> 400 error envelope",
        tags(TAGS.API, TAGS.REGRESSION, TAGS.P2),
        async ({ apiClient }) => {
            setJiraStory("PROJ-API-1");
            const users = new UserService(apiClient);

            const res = await users.createExpectingBadRequest({ username: "x", email: "not-an-email" });

            expect(res.status).toBe(400);
            expect(res.data.error).toBe("bad_request");
        },
    );

    test(
        "POST /auth/login succeeds with valid creds and fails (401) otherwise",
        tags(TAGS.API, TAGS.REGRESSION, TAGS.P0),
        async ({ apiClient }) => {
            setJiraStory("PROJ-API-1");
            const auth = new AuthService(apiClient);

            const ok = await test.step("valid login", () =>
                auth.login({ username: "demo", password: "demo-pass" }));
            expect(ok.data.token).toBeTruthy();
            expect(ok.data.user.username).toBe("demo");

            const bad = await test.step("wrong password", () =>
                auth.loginExpectingUnauthorized({ username: "demo", password: "wrong" }));
            expect(bad.status).toBe(401);
        },
    );
});
