# QA Agent Memory — EXAMPLE

EXAMPLE of `docs/ai/memory.md` for a fresh project. The qa-agent reads this
in Phase 0 and updates it in Phase 6 after every generation / run.

## Generated work
| Date | User story | Feature | Tag / Jira label | Artifacts |
|------|-----------|---------|------------------|-----------|
| 2026-06-01 | PROJ-1 | Login | @auth | tests/auth/login.spec.ts; page-objects/auth/login-page.ts; test-data/login-data.ts |

## Decisions
- 2026-06-01 — `LoginPage` extends `BasePage`; no separate auth fixture
  needed (storageState carries the session for subsequent specs).
- 2026-06-01 — Added `TAGS.AUTH = "@auth"` to `helper/test-tags.ts` to
  match the Jira label.

## Known gaps
- The error banner element has no `data-test-id` yet; relying on text — ask
  dev to add `data-test-id="login-error"`.

## Run history
| Date | Tag | Result |
|------|-----|--------|
| 2026-06-01 | @auth | 1 passed (12.4s) |
