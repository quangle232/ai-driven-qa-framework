---
name: read-report
description: Read + analyze the last test run and produce reports. Use when the user asks to "read the report", "analyze the results/failures", "why did tests fail", "summarize the run", "generate the report", "open allure". Parses test-output, writes a stakeholder summary, uses AI to cluster + root-cause failures with fix instructions, and produces the Allure report.
---

# read-report — analyze results, summarize, diagnose failures

Turn `test-output/` into a report + actionable failure analysis.

## Inputs it reads
`test-output/playwright-report.json`, `test-output/allure-results/`, and (perf)
`test-output/k6-summary.json` / `jmeter-results.jtl`. If missing, tell the user to run a suite first
(or use the **run-tests** skill).

## Steps
1. **Collect + diagnose (deterministic + AI):**
   `yarn report:all` (= `aiqa collect → diagnose → finalize → report:html → report:bugs`).
   With `ANTHROPIC_API_KEY` set, `aiqa diagnose` LLM-classifies each failure cluster
   (environment vs product vs flaky) with a root cause; otherwise it's deterministic.
2. **Summarize** in chat: totals (passed/failed/flaky), the critical events
   (`aiqa notify-critical`), and the top failing clusters.
3. **Failure analysis → fix instructions:** for each cluster give a likely root cause +
   a concrete fix step, distinguishing **env/flaky** (re-run, stabilize wait) from **product**
   (real defect → suggest a Jira bug). Never claim a flake is a defect.
4. **Allure report:** `yarn allure:report` (interactive) or `yarn allure:single` (one file).
5. Point to the stakeholder HTML: `test-output/ai/test-report.html`; bug docs from `report:bugs`;
   pending bug DRAFTS at `test-output/ai/bug-drafts/index.html` (approve via **create-bug**).

## Rules
- Distinguish environment failures from real defects before recommending a bug (see LESSONS-LEARNED).
- Read-only analysis — do not edit specs or "self-heal". Suggest fixes; the user/`review-code` applies them.
- Keep the summary scannable; put detail in the generated HTML/Allure.
