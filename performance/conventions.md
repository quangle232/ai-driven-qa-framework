# Performance conventions (k6 + JMeter)

- **Thresholds are the contract**: every k6 scenario sets `thresholds`
  (`http_req_failed`, `http_req_duration p(95)`) so the run pass/fails deterministically.
  JMeter plans include a response assertion.
- **Parameterize via env / JMeter props** — never hard-code hosts or load
  (`PERF_BASE_URL`/`VUS`/`DURATION`; `-Jhost`/`-Jthreads`/`-Jduration`).
- **Export machine-readable results** to `test-output/` (k6 `handleSummary` →
  `k6-summary.json`; JMeter `-l …jtl`) so results flow into reporting.
- Keep scenarios small + composable (smoke → load → stress → soak). Tag related
  functional coverage `@performance` where applicable.
- Run against a dedicated perf environment, never shared/prod without sign-off.
