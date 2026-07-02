/**
 * MSW node server. Specs drive its lifecycle:
 *
 *   test.beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
 *   test.afterEach(() => server.resetHandlers());
 *   test.afterAll(() => server.close());
 *
 * Override per-test with `server.use(http.get(...))` to inject edge cases.
 */
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
