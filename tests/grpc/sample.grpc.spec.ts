/**
 * SAMPLE gRPC spec — casino GameService over the in-process mock.
 *
 * Covers every RPC type + the gRPC best practices: deadlines, metadata auth,
 * and asserting on typed STATUS CODES (not just payloads). Import `test`/`expect`
 * from `helper/grpc/test-grpc` (gives the clients + the Jira-bug auto-fixture).
 */
import * as grpc from "@grpc/grpc-js";
import { test, expect } from "../../helper/grpc/test-grpc";
import { TAGS, tags } from "../../helper/test-tags";
import { setJiraStory } from "../../helper/jira-story";

test.describe("Sample gRPC — casino GameService", () => {
    test(
        "unary GetBalance returns the wallet (P0)",
        tags(TAGS.GRPC, TAGS.REGRESSION, TAGS.P0),
        async ({ gameClient }) => {
            setJiraStory("PROJ-GRPC-1");
            const res = await gameClient.getBalance({ playerId: "p-1" });
            expect(res).toMatchObject({ playerId: "p-1", balance: 1000, currency: "USD" });
        },
    );

    test(
        "unary GetBalance unknown player -> NOT_FOUND",
        tags(TAGS.GRPC, TAGS.REGRESSION, TAGS.P1),
        async ({ gameClient }) => {
            setJiraStory("PROJ-GRPC-1");
            await expect(gameClient.getBalance({ playerId: "unknown" })).rejects.toMatchObject({
                code: grpc.status.NOT_FOUND,
            });
        },
    );

    test(
        "a too-short deadline trips DEADLINE_EXCEEDED",
        tags(TAGS.GRPC, TAGS.REGRESSION, TAGS.P1),
        async ({ gameClient }) => {
            setJiraStory("PROJ-GRPC-1");
            // "slow" delays 500ms server-side; 100ms deadline must trip.
            await expect(
                gameClient.getBalance({ playerId: "slow" }, { deadlineMs: 100 }),
            ).rejects.toMatchObject({ code: grpc.status.DEADLINE_EXCEEDED });
        },
    );

    test(
        "PlaceBet without auth metadata -> UNAUTHENTICATED",
        tags(TAGS.GRPC, TAGS.REGRESSION, TAGS.P0),
        async ({ gameClientNoAuth }) => {
            setJiraStory("PROJ-GRPC-1");
            await expect(
                gameClientNoAuth.placeBet({ playerId: "p-1", roundId: "r-1", amount: 50, market: "red" }),
            ).rejects.toMatchObject({ code: grpc.status.UNAUTHENTICATED });
        },
    );

    test(
        "PlaceBet validates amount and balance via typed status codes",
        tags(TAGS.GRPC, TAGS.REGRESSION, TAGS.P1),
        async ({ gameClient }) => {
            setJiraStory("PROJ-GRPC-1");

            await test.step("amount <= 0 -> INVALID_ARGUMENT", async () => {
                await expect(
                    gameClient.placeBet({ playerId: "p-1", roundId: "r-1", amount: 0, market: "red" }),
                ).rejects.toMatchObject({ code: grpc.status.INVALID_ARGUMENT });
            });

            await test.step("amount > balance -> FAILED_PRECONDITION", async () => {
                await expect(
                    gameClient.placeBet({ playerId: "p-1", roundId: "r-1", amount: 5000, market: "red" }),
                ).rejects.toMatchObject({ code: grpc.status.FAILED_PRECONDITION });
            });

            await test.step("valid bet is accepted", async () => {
                const res = await gameClient.placeBet({
                    playerId: "p-1",
                    roundId: "r-1",
                    amount: 200,
                    market: "red",
                });
                expect(res).toMatchObject({ accepted: true, balanceAfter: 800 });
            });
        },
    );

    test(
        "server-streaming StreamGameState pushes table phases",
        tags(TAGS.GRPC, TAGS.REGRESSION, TAGS.P1),
        async ({ gameClient }) => {
            setJiraStory("PROJ-GRPC-1");
            const events = await gameClient.streamGameState({ tableId: "t-7" });
            expect(events.map(e => e.phase)).toEqual(["betting", "dealing", "result"]);
            expect(events.every(e => e.tableId === "t-7")).toBe(true);
        },
    );

    test(
        "client-streaming SendActions returns a round summary",
        tags(TAGS.GRPC, TAGS.REGRESSION, TAGS.P2),
        async ({ gameClient }) => {
            setJiraStory("PROJ-GRPC-1");
            const summary = await gameClient.sendActions([
                { playerId: "p-1", action: "bet", amount: 100 },
                { playerId: "p-1", action: "bet", amount: 150 },
            ]);
            expect(summary.actionCount).toBe(2);
            expect(summary.totalStaked).toBe(250);
        },
    );

    test(
        "bidirectional PlayLive echoes an event per action",
        tags(TAGS.GRPC, TAGS.REGRESSION, TAGS.P2),
        async ({ gameClient }) => {
            setJiraStory("PROJ-GRPC-1");
            const events = await gameClient.playLive([
                { playerId: "p-1", action: "hit", amount: 1 },
                { playerId: "p-1", action: "stand", amount: 2 },
            ]);
            expect(events).toHaveLength(2);
            expect(events.every(e => e.phase === "ack")).toBe(true);
        },
    );
});
