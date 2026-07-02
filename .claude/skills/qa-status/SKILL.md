---
name: qa-status
description: One-page QA status / standup from the latest run + tracking. Use for "qa status", "test health", "standup", "what needs attention", "how are the tests doing". Aggregates last-run results, flaky, coverage, and open auto-bugs into a scannable brief with the single most important thing to fix.
---

# qa-status — QA health brief (read-only)

Aggregate the framework's own signals into one scannable status. Reuse the other skills' sources —
don't recompute from scratch.

## Pull
- **Last run** — `aiqa-qa-report` MCP (`get_run_summary`, `get_failed_tests`, `get_failure_clusters`,
  `get_critical_events`) or `test-output/ai/`. (Run **read-report** first if stale.)
- **Flaky** — `aiqa-memory` flaky-history (see **flaky-triage**).
- **Coverage** — top gaps (see **coverage-gap**), esp. P0 areas + surfaces with no tests.
- **Open defects** — auto-filed / on-demand Jira bugs linked to current stories.

## Output (one page)
- ✅/❌ headline: passed / failed / flaky counts + pass-rate, per surface.
- 🚨 Critical events (smoke/login/5xx/payment / ≥30% same-reason).
- 🔁 Flaky watch-list. 🕳️ Coverage gaps (top 3). 🐞 Open bugs.
- 👉 **The one thing to fix first** (highest business-impact deterministic failure).

## Rules
- Read-only; don't run tests or generate code here (delegate to run-tests / fix-test).
- Distinguish env/flaky from real defects. Keep it to one page; link detail (HTML/Allure).
