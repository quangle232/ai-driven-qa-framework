/**
 * In-process mock gRPC server implementing the casino GameService, so client
 * tests run with no live backend. Encodes deterministic behaviours the specs
 * assert on (including typed error codes + a deadline-tripping path).
 *
 * Special inputs used by the sample specs:
 *   - playerId "unknown"  → GetBalance returns NOT_FOUND
 *   - playerId "slow"     → GetBalance delays 500ms (trips a short deadline)
 *   - PlaceBet without auth metadata → UNAUTHENTICATED
 *   - PlaceBet amount <= 0            → INVALID_ARGUMENT
 *   - PlaceBet amount  > 1000         → FAILED_PRECONDITION (insufficient funds)
 */
import * as grpc from "@grpc/grpc-js";
import { GameService } from "../load-proto";
import type {
    BalanceResponse,
    GameStateEvent,
    PlaceBetResponse,
    PlayerAction,
    RoundSummary,
} from "../models/casino";

const STARTING_BALANCE = 1000;

const impl = {
    getBalance(
        call: grpc.ServerUnaryCall<any, BalanceResponse>,
        callback: grpc.sendUnaryData<BalanceResponse>,
    ): void {
        const playerId = call.request.playerId;
        if (playerId === "unknown") {
            callback({ code: grpc.status.NOT_FOUND, details: "player not found" });
            return;
        }
        const respond = () =>
            callback(null, { playerId, balance: STARTING_BALANCE, currency: "USD" });
        if (playerId === "slow") {
            setTimeout(respond, 500); // client with a short deadline gets DEADLINE_EXCEEDED
            return;
        }
        respond();
    },

    placeBet(
        call: grpc.ServerUnaryCall<any, PlaceBetResponse>,
        callback: grpc.sendUnaryData<PlaceBetResponse>,
    ): void {
        if (call.metadata.get("authorization").length === 0) {
            callback({ code: grpc.status.UNAUTHENTICATED, details: "missing auth token" });
            return;
        }
        const amount: number = call.request.amount;
        if (amount <= 0) {
            callback({ code: grpc.status.INVALID_ARGUMENT, details: "amount must be > 0" });
            return;
        }
        if (amount > STARTING_BALANCE) {
            callback({ code: grpc.status.FAILED_PRECONDITION, details: "insufficient funds" });
            return;
        }
        callback(null, { betId: "bet-1", accepted: true, balanceAfter: STARTING_BALANCE - amount });
    },

    streamGameState(call: grpc.ServerWritableStream<any, GameStateEvent>): void {
        const tableId = call.request.tableId;
        const phases = ["betting", "dealing", "result"];
        phases.forEach((phase, i) =>
            call.write({ tableId, phase, sequence: i + 1, payload: "{}" }),
        );
        call.end();
    },

    sendActions(
        call: grpc.ServerReadableStream<PlayerAction, RoundSummary>,
        callback: grpc.sendUnaryData<RoundSummary>,
    ): void {
        let totalStaked = 0;
        let actionCount = 0;
        call.on("data", (a: PlayerAction) => {
            totalStaked += a.amount ?? 0;
            actionCount += 1;
        });
        call.on("end", () =>
            callback(null, {
                roundId: "round-1",
                totalStaked,
                netResult: -totalStaked,
                actionCount,
            }),
        );
    },

    playLive(call: grpc.ServerDuplexStream<PlayerAction, GameStateEvent>): void {
        call.on("data", (a: PlayerAction) =>
            call.write({ tableId: "live-1", phase: "ack", sequence: a.amount ?? 0, payload: a.action }),
        );
        call.on("end", () => call.end());
    },
};

export interface RunningGrpcMock {
    server: grpc.Server;
    port: number;
    close: () => Promise<void>;
}

/** Start the mock on `port` (0 = ephemeral). Returns the bound port + a closer. */
export function startGrpcMock(port = 0): Promise<RunningGrpcMock> {
    const server = new grpc.Server();
    server.addService(GameService.service, impl);
    return new Promise((resolve, reject) => {
        server.bindAsync(
            `0.0.0.0:${port}`,
            grpc.ServerCredentials.createInsecure(),
            (err, boundPort) => {
                if (err) {
                    reject(err);
                    return;
                }
                // grpc-js >= 1.10 starts serving after bindAsync; no server.start() needed.
                resolve({
                    server,
                    port: boundPort,
                    close: () => new Promise<void>(done => server.tryShutdown(() => done())),
                });
            },
        );
    });
}
