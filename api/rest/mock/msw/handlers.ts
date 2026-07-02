/**
 * MSW request handlers — the IN-PROCESS mock layer.
 *
 * MSW (node) intercepts Node's `fetch` / `http` / `axios`. Use it for:
 *   - service / integration tests that drive the API via node `fetch`
 *   - mocking the app's OWN outbound calls inside a test
 *   - injecting failures (timeouts, 5xx) to exercise client error handling
 *
 * NOTE: MSW node does NOT intercept Playwright's `request` (APIRequestContext) —
 * that uses Playwright's own network stack. For Playwright-`request` API specs,
 * point the client at the standalone Express mock instead (see
 * `api/mock/standalone/server.ts`), or use `page.route` for browser UI.
 *
 * Both layers delegate to the same `mockStore`, so behaviour is identical.
 */
import { http, HttpResponse } from "msw";
import { mockStore } from "../store";

/** Base origin the MSW handlers match. Specs fetch against this. */
export const MSW_BASE = "https://api.mock.test";

export const handlers = [
    http.post(`${MSW_BASE}/auth/login`, async ({ request }) => {
        const body = await request.json();
        const r = mockStore.login(body);
        return HttpResponse.json(r.body as object, { status: r.status });
    }),

    http.get(`${MSW_BASE}/users`, () => {
        const r = mockStore.listUsers();
        return HttpResponse.json(r.body as object, { status: r.status });
    }),

    http.get(`${MSW_BASE}/users/:id`, ({ params }) => {
        const r = mockStore.getUser(String(params.id));
        return HttpResponse.json(r.body as object, { status: r.status });
    }),

    http.post(`${MSW_BASE}/users`, async ({ request }) => {
        const body = await request.json();
        const r = mockStore.createUser(body);
        return HttpResponse.json(r.body as object, { status: r.status });
    }),

    http.delete(`${MSW_BASE}/users/:id`, ({ params }) => {
        const r = mockStore.deleteUser(String(params.id));
        if (r.status === 204) return new HttpResponse(null, { status: 204 });
        return HttpResponse.json(r.body as object, { status: r.status });
    }),
];
