---
name: run-tests
description: Run a test slice smartly then report. Use for "run the tests", "run smoke/regression", "run the api/ui/mobile/perf tests", "run @<tag> on <env>". Picks the right module config + markers + env, applies the shared-SUT discipline, and hands off to read-report.
---

# run-tests — execute a slice, then report

## Decide the slice
- **Surface/module** → the isolated config: `yarn test:ui` · `test:api[:rest|:grpc|:graphql]` ·
  `test:mobile:web` · `test:mobile:native` (skip-gated) · `perf:k6` / `perf:jmeter`.
  Full run: `yarn test:test` (root config, all modules).
- **Tags** → `--grep "@regression"` · green slice `--grep-invert "@bugs"` · `--grep "@<feature>"`.
- **Env** → `test_env=dev|test|prod` (default test).

## Operating discipline (shared/demo SUT — see docs/ai/LESSONS-LEARNED.md)
- Run **serial** (`--workers=1`) on a shared server; add `--retries=2` so count/reconciliation
  flakes self-heal.
- Never run destructive / native-mobile suites against a shared target; they're skip-gated by design.
- Distinguish env failures from real defects.

## After the run
Hand off to **read-report** (`yarn report:all` + Allure) for the summary + AI failure analysis.
On a final-attempt failure with `@jira("KEY")`, the framework auto-files/reuses a Jira bug.

> This runs existing tests; to create them use `automation-generate` or `user-story-test`.
