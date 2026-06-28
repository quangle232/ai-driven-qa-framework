/**
 * `test` for gRPC specs — adds `gameClient` (+ `gameClientNoAuth`) fixtures,
 * built ON TOP of the framework `test` so the failure → Jira-bug auto-reporter
 * still applies. Import this in `tests/grpc`:
 *
 *     import { test, expect } from '../../helper/grpc/test-grpc';
 *
 * Mock vs real target:
 *   - default            → an in-process mock gRPC server is started per worker.
 *   - `GRPC_MOCK=0`      → connect to the real service at GRPC_HOST:GRPC_PORT.
 */
import { test as base, expect } from "../test";
import ENV from "../env-config";
import { GameClient } from "../../grpc/clients/game-client";
import { startGrpcMock } from "../../grpc/mock/mock-server";

type GrpcWorkerFixtures = {
    grpcAddress: { host: string; port: number };
};
type GrpcTestFixtures = {
    /** Authenticated client (sends a bearer token in metadata). */
    gameClient: GameClient;
    /** Client WITHOUT a token — for UNAUTHENTICATED assertions. */
    gameClientNoAuth: GameClient;
};

export const test = base.extend<GrpcTestFixtures, GrpcWorkerFixtures>({
    grpcAddress: [
        async ({}, use) => {
            if (process.env.GRPC_MOCK === "0") {
                await use({ host: ENV.GRPC_HOST, port: ENV.GRPC_PORT });
                return;
            }
            const mock = await startGrpcMock(0);
            try {
                await use({ host: "127.0.0.1", port: mock.port });
            } finally {
                await mock.close();
            }
        },
        { scope: "worker" },
    ],

    gameClient: async ({ grpcAddress }, use) => {
        const client = new GameClient({
            host: grpcAddress.host,
            port: grpcAddress.port,
            tls: ENV.GRPC_TLS,
            token: ENV.GRPC_TOKEN ?? "test-token",
        });
        await client.waitForReady(5_000);
        await use(client);
        client.close();
    },

    gameClientNoAuth: async ({ grpcAddress }, use) => {
        const client = new GameClient({
            host: grpcAddress.host,
            port: grpcAddress.port,
            tls: ENV.GRPC_TLS,
        });
        await client.waitForReady(5_000);
        await use(client);
        client.close();
    },
});

export { expect };
