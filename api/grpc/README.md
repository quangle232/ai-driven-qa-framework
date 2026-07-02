# gRPC testing layer

gRPC client + mock + tests for the upcoming live-casino services, on the **same
Playwright Test runner** as everything else (one report / Jira / AI-QA / CI
pipeline). Tests pass against an in-process mock with no backend.

## Layout

```
grpc/proto/casino/game.proto   sample contract: unary + server/client/bidi streaming
grpc/load-proto.ts             single dynamic-load point (shared by client + mock)
grpc/clients/game-client.ts    the gRPC "ActionKeyword" (deadlines, metadata, streams)
grpc/models/casino.ts          TS message types (keep in sync with the proto)
grpc/mock/mock-server.ts       in-process mock GameService
grpc/mock/run-mock-server.ts   `yarn grpc:mock` — run it standalone
helper/grpc/test-grpc.ts       `test` with gameClient / gameClientNoAuth fixtures
tests/grpc/*.spec.ts           sample specs for every RPC type
```

## The four RPC types (all exercised)

| Type | Proto | Client method |
|---|---|---|
| Unary | `GetBalance`, `PlaceBet` | `getBalance()`, `placeBet()` |
| Server-streaming | `StreamGameState` | `streamGameState()` → `GameStateEvent[]` |
| Client-streaming | `SendActions` | `sendActions(actions[])` → `RoundSummary` |
| Bidirectional | `PlayLive` | `playLive(actions[])` → `GameStateEvent[]` |

## Run

```bash
yarn test:grpc     # all @grpc specs (in-process mock; GRPC_MOCK=0 → real service)
yarn grpc:mock     # run the mock standalone on GRPC_PORT (default 50051)
```

Point at a real service: `GRPC_MOCK=0 GRPC_HOST=... GRPC_PORT=... yarn test:grpc`
(`GRPC_TLS=true` for SSL, `GRPC_TOKEN=...` for the auth metadata).

## Best principles applied

- **Deadline on every call** — the client always sets one; never an unbounded RPC.
  A dedicated spec proves a short deadline trips `DEADLINE_EXCEEDED`.
- **Assert STATUS CODES, not just payloads** — specs check `grpc.status.NOT_FOUND` /
  `INVALID_ARGUMENT` / `FAILED_PRECONDITION` / `UNAUTHENTICATED`, the real contract of a gRPC API.
- **Metadata-based auth** — bearer token → `authorization` metadata; an unauth client
  proves `UNAUTHENTICATED`.
- **Single transport layer** — specs call `GameClient`, never @grpc/grpc-js directly
  (same discipline as POM / the REST `ApiClient`).
- **Streaming handled properly** — promisified unary + array-collecting stream helpers;
  errors propagate as promise rejections.
- **TLS configurable** — `GRPC_TLS` switches credentials; never hard-coded.
- **Mock parity** — the mock implements the real proto via the shared `load-proto.ts`,
  so client and server can't drift.
- **Streaming / load notes for live games** — for live-dealer load, add latency/throughput
  assertions and backpressure tests (pause/resume on the readable stream); consider
  `ghz` for load and connection-keepalive tuning.

## Typed stubs (optional upgrade)

We load the proto dynamically (no codegen). For fully-typed stubs adopt
**buf + ts-proto**: add a `buf.gen.yaml`, generate into `grpc/generated/`, and
point `GameClient` at the generated client. `yarn proto:gen` is the placeholder
hook for that pipeline.
