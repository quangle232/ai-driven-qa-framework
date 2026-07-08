---
name: data-factory
description: Create + seed test data (factories, fixtures, seeding/teardown). Use for "seed test data", "create test data", "data factory", "generate fixtures", "set up data for this test". Builds typed, deterministic, isolated data and seeds it via API/gRPC before a test — leaving the SUT clean afterwards.
---

# data-factory — test data factories + seeding

Give tests the data they need — reproducibly and without polluting the SUT.

## Where data lives
- **Static inputs/expected** → `<module>/test-data/*.ts` (UI) or `api/*/models` (typed).
- **Builders/factories** → small functions that return typed records with sensible defaults +
  overrides (e.g. `makeUser({ email })`). Prefer `@faker-js/faker` for variety; **seed faker**
  for reproducibility. Keep them next to the surface's test-data.

## Seeding (setup) + teardown — the CRUD lifecycle (framework-conventions §12)
- **Precondition data → create via API, not the UI.** When a test only NEEDS data (search,
  edit, list, a downstream flow), seed it with the surface client — `RestClient` (api-rest),
  gRPC/GraphQL client, or `ui/helpers/api-support.ts` (Playwright `request`) for a web test —
  in a fixture / `beforeEach`. Only drive the UI to create when the CREATE itself is the SUT
  (then capture the new id from the POM).
- **Always track + clean up via API.** Push every created id (and related resources) to an
  array and delete them in `afterEach` **via API** — it runs even on failure; tolerate 404
  so a half-failed test still cleans up. Never re-drive the UI to tear down.

## Rules (operating discipline — see docs/ai/LESSONS-LEARNED.md)
- **Leave the SUT clean**: remove self-created fixtures, or assert against live totals — never
  hardcode counts on a shared instance (avoids reconciliation drift).
- **Isolation**: each test seeds its own data; no order-dependence; unique keys (faker/uuid).
- **No hardcoded prod data / secrets**; env-specific values come from `environments/.env.<env>`.
- Deterministic where it matters (seed faker); randomize only what the test doesn't assert on.
