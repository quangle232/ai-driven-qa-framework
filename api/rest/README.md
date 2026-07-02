# API testing layer

REST/HTTP API testing for the framework, built on the **same Playwright Test
runner** as the UI suite — so Allure, the JSON report, the failure → Jira-bug
auto-reporter, the AI-QA collectors, and the `ci/` samples all work unchanged.

## Layout — the "Service-Object Model"

The API mirrors the UI's POM + single `ActionKeyword` discipline:

| UI side | API side | Rule |
|---|---|---|
| `helper/action-keywords.ts` | [`api/clients/api-client.ts`](clients/api-client.ts) | the ONLY layer that touches the transport (Playwright `APIRequestContext`) |
| `page-objects/*` | [`api/services/*.service.ts`](services/) | typed methods per endpoint group; specs call these, never the raw client |
| `data-*` selectors | [`api/models/*.ts`](models/) (zod) | response shape validated at runtime; types are `z.infer`-ed |
| `tests/*` | [`tests/api/*.spec.ts`](../tests/api/) | flow only; data lives in models/builders |

```
api/clients/api-client.ts     transport wrapper (status, timing, zod, auth)
api/services/*.service.ts      service objects (auth, user, …)
api/models/*.ts                zod schemas + inferred types
api/mock/store.ts              shared in-memory logic for BOTH mock layers
api/mock/msw/                  MSW (node) in-process mocking
api/mock/standalone/server.ts  Express service-virtualization server
api/contracts/openapi.sample.yaml  OpenAPI for Prism + contract tests
helper/api/test-api.ts         `test` with the apiClient fixture
```

## Two mock layers — and when to use which

| Layer | Intercepts | Use for | Run |
|---|---|---|---|
| **MSW (node)** | node `fetch`/`axios`/`http` | service/integration tests via node `fetch`; mocking the app's outbound calls; **injecting 5xx/latency** | driven in-spec (`server.listen/use/close`) |
| **Standalone (Express)** | a real port | Playwright-`request` API specs with no backend; a shared fake service | `yarn mock:api` or auto-started by the fixture |
| **Prism (OpenAPI)** | a real port | spec-driven mock when you maintain an OpenAPI file | `yarn mock:api:prism` |

> **Gotcha (important):** MSW node does **not** intercept Playwright's `request`
> (it uses Playwright's own network stack). So Playwright-`request` specs target
> the **Express** mock; node-`fetch` specs use **MSW**. For browser UI, use
> Playwright `page.route`. All three delegate to the same `mockStore`, so
> behaviour stays consistent.

By default `tests/api` runs against the in-process Express mock (no backend).
Set `API_BASE_URL` to hit a real API; `API_MOCK=1` forces the mock regardless.

## Run

```bash
yarn test:api              # all @api specs (uses the mock unless API_BASE_URL is set)
yarn mock:api              # standalone Express mock on :4010
yarn mock:api:prism        # OpenAPI-driven mock via Prism
```

## Best principles applied

- **Service-Object Model** — no raw transport calls in specs; one wrapper owns auth/timeout/base URL.
- **Runtime contract validation** — every response is parsed with a zod schema; drift fails loudly.
- **AAA structure** + `test.step` for readable Allure/HTML reports.
- **Positive AND negative coverage** — explicit `expectedStatus` for 4xx/5xx, not accidental throws.
- **Isolation & idempotency** — `mockStore.reset()` per test; created fixtures are cleaned up (leave the SUT clean — see [docs/ai/LESSONS-LEARNED.md](../docs/ai/LESSONS-LEARNED.md)).
- **Response-time SLAs** — `result.durationMs` is asserted where it matters.
- **No hardcoded prod data / secrets** — base URL + token come from env (`API_BASE_URL`, `API_TOKEN`).
- **Stakeholder-friendly failures** — the client wraps status/schema errors in one-line messages with a body snippet.
- **Contract testing path** — keep `openapi.sample.yaml` in sync with the zod models; Prism for provider mocks, Pact noted as a future consumer-driven option.
