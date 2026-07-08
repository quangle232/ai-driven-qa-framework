# API conventions (REST · gRPC · GraphQL)

Clients are **Playwright-free**; specs still run under the Playwright runner.
Never import `@playwright/test` in a client/service.

- **Client/Service-Object model**: specs call services/clients — never the raw
  transport (axios / grpc-js / graphql-request).
  - REST → `api/rest/services/*` over `RestClient` (axios); validate responses with
    the zod models in `api/rest/models`; pass `expectedStatus` for 4xx/5xx.
  - gRPC → `api/grpc/clients/*`; a deadline on every call; assert `grpc.StatusCode.*`,
    not just payloads; auth via metadata.
  - GraphQL → `api/graphql/client.ts`; operations in `operations.ts`; validate with zod.
- **Mocks** (no backend): REST = msw + the Express standalone server; GraphQL = msw;
  gRPC = the in-process mock server. Point at a real target via `API_BASE_URL` /
  `GRPC_MOCK=0` / `GRAPHQL_URL`.
- **Tags**: `@api` (+ `@grpc` / `@graphql`) + `@regression` + a priority. Import
  `@core/test`, `@core/test-tags`, `@core/jira/jira-story`.
- **CRUD / test data lifecycle**: the API layer is the preferred way to seed preconditions
  for ANY surface (fast, deterministic) and to clean up. A test that creates data must track
  every id and delete it **via a service** in `afterEach` (runs on failure; tolerate 404) —
  leave the SUT clean. Unique payloads per test (faker/uuid). See `framework-conventions.md`
  §12 + the `data-factory` skill.
- **Do NOT edit** `api/rest/contracts/` or `api/grpc/proto/` (patch-guarded, source of truth).
