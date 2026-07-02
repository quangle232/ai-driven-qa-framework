/**
 * GameClient — the single gRPC interaction layer (the gRPC analogue of
 * `ActionKeyword` / the REST `ApiClient`). Specs talk to this; nothing in a
 * spec touches @grpc/grpc-js directly.
 *
 * Best practices baked in:
 *   - **Deadline on every call** (never an unbounded gRPC call)
 *   - **Metadata-based auth** (bearer token → `authorization` metadata)
 *   - **Promisified unary** + **async stream helpers** for all 4 RPC types
 *   - TLS vs insecure via config; never hard-coded
 *
 * Errors reject with the raw `grpc.ServiceError` so specs can assert on the
 * typed `.code` (e.g. `grpc.status.DEADLINE_EXCEEDED`).
 */
import * as grpc from "@grpc/grpc-js";
import { GameService } from "../load-proto";
import type {
    BalanceResponse,
    GameStateEvent,
    GetBalanceRequest,
    PlaceBetRequest,
    PlaceBetResponse,
    PlayerAction,
    RoundSummary,
    StreamGameStateRequest,
} from "../models/casino";

export interface GameClientOptions {
    host?: string;
    port?: number;
    tls?: boolean;
    /** Bearer token sent as `authorization` metadata on every call. */
    token?: string;
    defaultDeadlineMs?: number;
}

export interface CallOptions {
    deadlineMs?: number;
    /** Per-call token override. */
    token?: string;
}

export class GameClient {
    private readonly client: any;
    private readonly token?: string;
    private readonly defaultDeadlineMs: number;

    constructor(opts: GameClientOptions = {}) {
        const host = opts.host ?? "localhost";
        const port = opts.port ?? 50051;
        const creds = opts.tls
            ? grpc.credentials.createSsl()
            : grpc.credentials.createInsecure();
        this.client = new GameService(`${host}:${port}`, creds);
        this.token = opts.token;
        this.defaultDeadlineMs = opts.defaultDeadlineMs ?? 5_000;
    }

    /** Block until the channel is connected (avoids a flaky first call). */
    waitForReady(timeoutMs = 5_000): Promise<void> {
        return new Promise((resolve, reject) => {
            this.client.waitForReady(this.deadline(timeoutMs), (err?: Error) =>
                err ? reject(err) : resolve(),
            );
        });
    }

    // ---- unary ----------------------------------------------------------------

    getBalance(req: GetBalanceRequest, opts?: CallOptions): Promise<BalanceResponse> {
        return this.unary<GetBalanceRequest, BalanceResponse>("getBalance", req, opts);
    }

    placeBet(req: PlaceBetRequest, opts?: CallOptions): Promise<PlaceBetResponse> {
        return this.unary<PlaceBetRequest, PlaceBetResponse>("placeBet", req, opts);
    }

    // ---- server-streaming -----------------------------------------------------

    /** Subscribe to a table; resolves with all events once the stream ends. */
    streamGameState(req: StreamGameStateRequest, opts?: CallOptions): Promise<GameStateEvent[]> {
        const call = this.client.streamGameState(req, this.meta(opts), this.callOpts(opts));
        return collect<GameStateEvent>(call);
    }

    // ---- client-streaming -----------------------------------------------------

    sendActions(actions: PlayerAction[], opts?: CallOptions): Promise<RoundSummary> {
        return new Promise((resolve, reject) => {
            const call = this.client.sendActions(
                this.meta(opts),
                this.callOpts(opts),
                (err: grpc.ServiceError | null, res: RoundSummary) =>
                    err ? reject(err) : resolve(res),
            );
            for (const action of actions) call.write(action);
            call.end();
        });
    }

    // ---- bidirectional --------------------------------------------------------

    playLive(actions: PlayerAction[], opts?: CallOptions): Promise<GameStateEvent[]> {
        return new Promise((resolve, reject) => {
            const call = this.client.playLive(this.meta(opts), this.callOpts(opts));
            const events: GameStateEvent[] = [];
            call.on("data", (e: GameStateEvent) => events.push(e));
            call.on("error", reject);
            call.on("end", () => resolve(events));
            for (const action of actions) call.write(action);
            call.end();
        });
    }

    close(): void {
        this.client.close();
    }

    // ---- internals ------------------------------------------------------------

    private unary<TReq, TRes>(method: string, req: TReq, opts?: CallOptions): Promise<TRes> {
        return new Promise((resolve, reject) => {
            this.client[method](
                req,
                this.meta(opts),
                this.callOpts(opts),
                (err: grpc.ServiceError | null, res: TRes) => (err ? reject(err) : resolve(res)),
            );
        });
    }

    private meta(opts?: CallOptions): grpc.Metadata {
        const md = new grpc.Metadata();
        const token = opts?.token ?? this.token;
        if (token) md.set("authorization", `Bearer ${token}`);
        return md;
    }

    private callOpts(opts?: CallOptions): grpc.CallOptions {
        return { deadline: this.deadline(opts?.deadlineMs ?? this.defaultDeadlineMs) };
    }

    private deadline(ms: number): grpc.Deadline {
        return new Date(Date.now() + ms);
    }
}

/** Drain a server-readable stream into an array (errors reject). */
export function collect<T>(call: grpc.ClientReadableStream<T>): Promise<T[]> {
    return new Promise((resolve, reject) => {
        const items: T[] = [];
        call.on("data", (d: T) => items.push(d));
        call.on("error", reject);
        call.on("end", () => resolve(items));
    });
}
