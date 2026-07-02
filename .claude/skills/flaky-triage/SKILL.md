---
name: flaky-triage
description: Detect, confirm, and quarantine flaky tests. Use for "flaky tests", "why is this flaky", "is this a flake or a real bug", "quarantine flaky", "flaky analysis". Uses run history + reruns to separate flakes from real defects and records them in memory — never files a bug for a flake.
---

# flaky-triage — detect · confirm · quarantine

Manage flaky tests so they don't erode trust in the suite or spam Jira.

## Detect
- A test is **flaky** if it passed-on-retry (failed then passed within retries) or has an
  inconsistent history. Sources: `test-output/playwright-report.json` (status/retries),
  the `aiqa-memory` MCP flaky-history, and `docs/ai/memory.md` "Run history".

## Confirm
- Re-run the suspect in isolation N times (e.g. `--repeat-each=5 --retries=0 --workers=1`).
  Consistent pass/fail → NOT flaky (green or a real defect); mixed → confirmed flaky.

## Classify the cause
timing/wait (missing explicit wait) · selector instability · shared-SUT data race ·
environment (timeout/5xx) · order-dependence. Map each to a concrete fix.

## Act
- **Fix** where cheap (replace a hard/implicit wait with an `ActionKeyword` explicit wait; stabilize
  selector via the priority order) → hand to **review-code** + re-confirm.
- **Quarantine** if not fixable now: tag `@flaky` and exclude from the green gate
  (`--grep-invert "@flaky"`); track it — do NOT delete or `test.skip` silently.
- **Record** in `aiqa-memory` flaky-history + the module `memory/` so it's not re-triaged blind.

## Hard rule
A flake is **not** a product defect — never open a Jira bug for a pass-on-retry
(the framework already skips bug-creation for flaky passes). Only deterministic failures are bugs.
