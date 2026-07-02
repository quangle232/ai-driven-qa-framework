/**
 * Standalone Express mock server — the SERVICE-VIRTUALIZATION layer.
 *
 * A real HTTP endpoint, so it is what Playwright's `request`-based API specs
 * hit when there is no live backend, and what other teams/tools can run as a
 * fake service. Shares `mockStore` with the MSW layer.
 *
 * Usage:
 *   - `yarn mock:api`                      → run on MOCK_API_PORT (default 4010)
 *   - `startMockServer(0)` from a fixture  → ephemeral port, in-process
 *   - `yarn mock:api:prism`                → OpenAPI-driven mock via Prism
 *     (api/contracts/openapi.sample.yaml) — use when you maintain a spec.
 */
import express, { type Express } from "express";
import { mockStore } from "../store";

export function createMockApp(): Express {
    const app = express();
    app.use(express.json());

    app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

    app.post("/auth/login", (req, res) => {
        const r = mockStore.login(req.body);
        res.status(r.status).json(r.body);
    });

    app.get("/users", (_req, res) => {
        const r = mockStore.listUsers();
        res.status(r.status).json(r.body);
    });

    app.get("/users/:id", (req, res) => {
        const r = mockStore.getUser(req.params.id);
        res.status(r.status).json(r.body);
    });

    app.post("/users", (req, res) => {
        const r = mockStore.createUser(req.body);
        res.status(r.status).json(r.body);
    });

    app.delete("/users/:id", (req, res) => {
        const r = mockStore.deleteUser(req.params.id);
        if (r.status === 204) {
            res.status(204).end();
            return;
        }
        res.status(r.status).json(r.body);
    });

    return app;
}

export interface RunningMock {
    url: string;
    close: () => Promise<void>;
}

/** Start the mock on `port` (0 = ephemeral). Returns the URL + a closer. */
export function startMockServer(port = 0): Promise<RunningMock> {
    const app = createMockApp();
    return new Promise(resolve => {
        const srv = app.listen(port, () => {
            const addr = srv.address();
            const boundPort = typeof addr === "object" && addr ? addr.port : port;
            resolve({
                url: `http://127.0.0.1:${boundPort}`,
                close: () => new Promise<void>(done => srv.close(() => done())),
            });
        });
    });
}

// Run directly via `yarn mock:api`.
if (import.meta.url === `file://${process.argv[1]}`) {
    const port = Number(process.env.MOCK_API_PORT ?? 4010);
    startMockServer(port).then(({ url }) => {
        // eslint-disable-next-line no-console
        console.log(`[mock:api] standalone API mock listening at ${url}`);
    });
}
