---
name: review-code
description: Strict code review AGAINST this framework's conventions (Claude or Codex). Use before merging or when asked to "review", "check my code", "is this convention-compliant", "review this PR/diff/spec". Reviews UI/API/gRPC/GraphQL/mobile/perf code for the single-keyword-layer rule, tags, no hard waits, anti-duplication, schema validation, patch-guarded paths, and runs the deterministic guard.
---

# review-code — strict, convention-first review

Review the target (a diff, PR, or file list) **strictly against this framework's
conventions**. Block on any violation; be specific and cite file:line.

## Load the rules first
- `.claude/skills/qa-agent/references/framework-conventions.md` (framework-wide + §1a per-module)
- the target surface's `<module>/conventions.md` (ui / api / mobile / performance)

## Checklist (reject on violation)
- **Single keyword/transport layer**: no `page.locator` / axios / grpc / graphql-request /
  WebdriverIO **in a spec or object** — go through `ActionKeyword` / `RestClient` /
  `GameClient` / `GraphqlClient` / `MobileActionKeyword`.
- **Imports via aliases** `@core/* @ui/* @api/* @mobile/*`; specs import `@core/test` + `@core/test-tags`.
- **Tags**: every spec has `@<surface>` + `@regression` + a priority (`@P0/@P1/@P2`); `@jira("KEY")` set.
- **No hard waits** (`waitForTimeout` / `sleep`), **no `test.skip` on logic**, no commented-out asserts.
- **Selectors**: `data-zcqa → data-test-id → data-id → data-title`; none invented.
- **Validation**: REST/GraphQL responses validated with zod; gRPC asserts `StatusCode.*`.
- **Anti-duplication**: reuses existing pages/services/specs (check the framework-context MCP) — no near-duplicate.
- **CRUD / test-data lifecycle** (§12): precondition data created via API (not the UI) unless the
  create IS the test; every created id tracked and deleted **via API** in `afterEach` (tolerates 404).
  Reject a test that creates data with no teardown, or seeds preconditions by driving the UI.
- **Patch-guarded paths untouched**: `core/`, `config/`, `ci/`, `api/grpc/proto/`, `api/rest/contracts/`,
  `ui/helpers/global-setup|auth-config|authenticate-set-up`, `environments/`, `.auth/`.
- Comments in English; test data in `*/test-data` or `*/models`, not inline.

## Run the deterministic gate
`yarn aiqa:guard --files <changed files>` — treat any rejection as a blocking finding.

## Output
Findings ranked most-severe first (file:line + why + fix). End with PASS/CHANGES-REQUESTED.
Works identically under Claude or Codex.
