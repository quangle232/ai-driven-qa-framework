# Performance module (k6 + JMeter)

Load / performance testing. Own runners (external binaries) — not Playwright.

```bash
yarn perf:k6        # k6 run performance/k6/sample.load.js   (needs the `k6` binary)
yarn perf:jmeter    # jmeter -n -t performance/jmeter/sample-plan.jmx -l test-output/jmeter-results.jtl
```

## Structure
```
performance/
  k6/       sample.load.js  (scenarios + thresholds; writes test-output/k6-summary.json)
  jmeter/   sample-plan.jmx (Thread Group + HTTP + assertion; -Jhost/-Jthreads/-Jduration)
  conventions.md   memory/   README.md
```

- **k6** (primary) — JS/TS, code-first, thresholds are the pass/fail gate; `handleSummary`
  exports JSON the AI-QA pipeline can ingest. Config via env: `PERF_BASE_URL`, `VUS`, `DURATION`.
- **JMeter** (sample) — for teams standardized on `.jmx`; run headless with `-n`.
- Prereqs are external tools (install `k6` / `jmeter`); documented, not npm deps.
