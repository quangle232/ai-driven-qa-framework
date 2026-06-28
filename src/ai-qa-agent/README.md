# AI QA Agent — Full Cycle QA Engineering Framework

> Product name is **AI QA Agent**. Claude / OpenAI / local models are *provider
> engines*, not the framework name.

This module is the AI-driven side of the test framework. It sits **on top of**
the existing Playwright + Allure + Jenkins stack and never replaces it. The
existing test runner, POM, `helper/test.ts` Jira-bug auto-fixture, Allure
reporter, and Jenkins pipeline keep their behavior exactly as before.

```
Requirement Intelligence
  + Test Design
  + Automation Planning
  + Automation Code Suggestion
  + Runtime Watcher           ← deterministic; no LLM per file change
  + Failure Diagnosis         ← LLM only when run/retry confirms a failure
  + Critical Notification     ← once per run per fingerprint
  + Bug Drafting              ← draft only, never auto-creates a Jira bug
  + CI Reporting              ← Jenkins / GHA / GitLab CI summaries
  + Knowledge Memory          ← known issues, flaky history (JSON files)
  + MCP Tool Layer            ← read-only by default
  + Recursive AI Review Loops ← bounded: maxRounds, token budget, stop conds
```

## Modes (default: `diagnose_only`)

```
observe_only
diagnose_only                 ← default
suggest_fix
generate_patch
apply_patch_requires_approval
full_cycle_with_approval
```

Set via `AI_QA_AGENT_MODE`. The orchestrator refuses any action the active
mode does not allow.

## Forbidden behaviors (hard guardrails)

The AI QA Agent will **never**:

- self-heal a test until it passes in CI
- auto-skip tests
- auto-mark failed tests as passed
- weaken or delete assertions
- update expected results without spec / human approval
- read secrets, `.env`, `.auth/`, or `storageState`
- commit or push changes
- create Jira / GitLab / GitHub bugs without approval (unless explicitly
  configured by policy)
- run unrestricted shell commands

## What ships in Phase 0 + Phase 1

| | |
|---|---|
| **Phase 0** | `config/`, `schemas/`, separate `tsconfig.aiqa.json`, `.gitignore` updates. No runtime behavior yet. |
| **Phase 1** | `collectors/`, `watchers/` (deterministic — `chokidar` only), `reports/`, `cli/aiqa.ts` with `init / watch / collect / diagnose / notify-critical / finalize`. Reads `test-output/playwright-report.json` + `test-output/allure-results/`. Writes to `test-output/ai/`. **No LLM calls in this phase** — the diagnosis writer produces a deterministic Markdown digest; the LLM-backed root-cause classifier arrives in Phase 4 behind `AI_PROVIDER`. |

## What does NOT change

- `helper/`, `config/playwright.config.ts`, `page-objects/`, `tests/` — untouched
- `helper/jira-bug-reporter.ts` — keeps creating / reusing Jira bugs on final
  failure exactly as before. The new bug-draft writer (Phase 8) is a separate
  Markdown writer; it never posts to Jira on its own.
- `ci/jenkins/regression-pipeline` — untouched. The aiqa post-block snippet is
  documented separately (Phase 2).

## Environment variables (read-only; absent means "off")

| Var | Purpose | Default |
|---|---|---|
| `AI_QA_AGENT_MODE` | one of the six modes above | `diagnose_only` |
| `AI_PROVIDER` | `claude` \| `openai` \| `noop` | `claude` — falls back to `noop` if no API key |
| `ANTHROPIC_API_KEY` | enables Claude provider | unset → `noop` |
| `CI_PROVIDER` | `jenkins` \| `github-actions` \| `gitlab-ci` \| `local` | auto-detected |
| `AIQA_OUT_DIR` | output root | `test-output/ai` |
| `AIQA_WATCH_PATHS` | comma-separated paths | `test-output/allure-results,test-output/playwright-report.json` |
| `SLACK_WEBHOOK_URL` / `EMAIL_*` / `TEAMS_WEBHOOK_URL` | enable channels | unset → dry-run, log only |
