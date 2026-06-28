# Changelog

All notable changes to this framework are recorded here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This framework versions independently of any consuming product repo.

---

## [0.2.0] — 2026-06-28

Productized after a full real-world engagement. Renamed
`ai-driven-custom-framework` → **`ai-driven-qa-framework`**.

### Added
- **`CLAUDE.md`** — project guide auto-loaded by Claude Code; orients any LLM to the
  framework, the qa-agent skill, the MCP servers, and the operating discipline.
- **`.mcp.json`** — registers the 4 AI-QA MCP servers (read-only by default) for Claude Code
  / any MCP client, so LLMs query compact JSON instead of parsing big files. Portable paths;
  regenerate with `yarn aiqa:mcp:config`.
- **Report generators** `scripts/gen-reports.mjs` + `scripts/gen-bug-report-docx.mjs` and
  scripts `report:bugs` / `report:all` — framework-agnostic regression (HTML) + bug
  (HTML/MD/DOCX) reports from `playwright-report.json` + optional `test-output/ai/bugs.json`.
  Added the `docx` dependency.
- **`docs/ai/LESSONS-LEARNED.md`** — project-agnostic QA playbook (shared-SUT discipline,
  data drift, destructive-test isolation, env-vs-bug triage, selector/testid reality,
  multi-tenant RBAC, mobile/device-owner testing, LLM token economy, reporting cadence).

### Changed
- Report generators de-scoped from any specific app: dynamic spec-file grouping +
  feature/severity ordering, and graceful no-op when `bugs.json` is absent.

---

## [0.1.0] — 2026-05-25

First release. Full AI QA Agent capability on top of the original Playwright
+ TypeScript + POM starter.

### Phase 0 — Foundation

- `src/ai-qa-agent/config/` — agent-policy (default `diagnose_only`, action
  matrix, absolute forbidden behaviors), severity-policy, notification-policy,
  token-budget-policy (L0–L5 levels), recursive-policy (per-workflow max
  rounds), ai-provider config (claude / openai / noop with auto-fallback).
- `src/ai-qa-agent/schemas/` — versioned types (`aiqa.*.v1`) for failure
  events, diagnoses, recursive reviews, test cases, automation plans, bug
  reports, agent decisions, CI metadata.
- Separate `tsconfig.aiqa.json` so the new tree typechecks under `strict: true`
  without affecting the existing `npm run typecheck`.

### Phase 1 — Deterministic collectors + watcher + post-run diagnosis

- `collectors/` — playwright-report-reader, allure-result-reader,
  artifact-indexer, ci-metadata-collector (Jenkins / GHA / GitLab CI
  normalization), failure-summary-builder.
- `watchers/` — file-watcher (chokidar; never invokes an LLM),
  critical-pattern-detector (smoke / login / 5xx / payment / ≥30% same-reason).
- `reports/` — diagnosis-report-writer, ci-summary-writer (for GitHub
  `$GITHUB_STEP_SUMMARY`).
- `cli/aiqa.ts` — `init / watch / collect / diagnose / notify-critical / finalize`.
- Notification orchestrator: dry-run by default; sends only when channel
  env vars present (`SLACK_WEBHOOK_URL`, `TEAMS_WEBHOOK_URL`,
  `AIQA_EMAIL_HOST`).

### Phase 4 — LLM agents + token-conscious harness

- Providers: `claude-provider` (with `cache_control` ephemeral breakpoints),
  `noop-provider`. Two-tier model routing: Haiku-fast for classification,
  Opus-smart for code generation.
- Token harness: `TokenBudget` (per-session cap, ledger), `context-cache`
  (mtime-keyed disk cache), `framework-context` (pinned cached prompt block).
- Recursive runner: bounded `generate → critique → refine → stop` and
  `hypothesis → evidence → decision → stop`. Hard caps from
  `recursive-policy`; refuses on forbidden-behavior findings.
- `failure-grouper`: normalised-error fingerprinting → 12 failures /
  1 cluster / 1 LLM call (92% fewer calls on a regression storm).
- `scanner-trigger`: gates LLM wake-ups to run-complete + confirmed-after-retry
  + critical-pattern + user-requested.
- Agents: `failure-diagnosis-agent` (hypothesis-evidence-decision),
  `automation-planning-agent`, `automation-builder-agent` (smart-tier),
  `automation-code-reviewer-agent` (fast-tier).
- `inputs/test-case-input` — Markdown table or JSON bundle parser.
- `reports/stakeholder-html-report` — single self-contained HTML for
  PM/BA/BO. Hero verdict + KPIs, critical cards, clustered failures,
  glossary, filter chips, print-friendly.
- `analyzers/patch-guard` — deterministic safety gate refusing any generated
  patch with: wrong import, raw `this.page.click` in POMs, hard waits,
  hardcoded secrets, missing `TAGS.REGRESSION`, `test.skip`,
  `expect(true).toBe(true)`, paths outside `tests/ | page-objects/ | test-data/`,
  path traversal.

### Phase 4.1 — Existing-code awareness + regression enforcement

- `context/existing-code-index` — scans `page-objects/`, `tests/`,
  `helper/test-tags.ts`, `helper/action-keywords.ts`, `test-data/`. Result
  pinned in builder context so future generations reuse existing POMs,
  ActionKeyword methods, and declared tags.
- Builder system prompt + post-processor + patch-guard rule all enforce
  `TAGS.REGRESSION` on every new spec. Three independent layers of
  protection.
- `orchestration/apply-patches` — idempotent: created / skipped-identical /
  refused-conflict / `--force-overwrite`.
- `orchestration/guard-runner` — standalone `aiqa guard --files=…` so
  Claude Code can verify code it wrote itself.
- `orchestration/regression-runner` — `aiqa run-regression` orchestrator:
  concurrent Playwright + watcher + critical-scanner sub-agent + auto
  `collect → diagnose → finalize → report:html` on exit.
- CLI commands: `scan`, `guard`, `run-regression`.

### Phase 5 — MCP layer + domain memory

- Four read-only-by-default MCP servers (25 tools total):
  - `aiqa-qa-report` — 6 tools (run summary, failures, clusters, criticals,
    diagnoses, runs).
  - `aiqa-framework-context` — 6 tools (conventions, existing-code index,
    POM finder, ActionKeyword list, spec search, bounded snippet read).
  - `aiqa-memory` — 10 tools (known-issues, flaky-history, failure-patterns,
    domain-glossary CRUD). Writes gated by `AIQA_ALLOW_MEMORY_WRITE`.
  - `aiqa-test-runner` — 3 tools (list available tests, last-run status,
    targeted run gated by `AIQA_ALLOW_EXEC`).
- `mcp/shared/policy` — allowlist + blocklist + response-size cap (80 KB) +
  file-range cap (120 lines).
- `mcp/shared/server-base` — lazy-loads `@modelcontextprotocol/sdk` (friendly
  install hint when missing); exposes both stdio `start()` and in-process
  `callTool()` for unit tests.
- `.aiqa-memory/{known-issues,flaky-history,failure-patterns,domain-glossary}.json`
  hand-editable JSON; committed by default as curated team knowledge.
- CLI commands: `mcp:list`, `mcp:start --server=<id>`, `mcp:config`.
- Documented project-MCP extension point: drop your domain server under
  `mcp/servers/<your-project>/`, register one entry in `mcp/index.ts`.

### Phase 6 — Packaging for reuse

- `INSTALL.md` — full migration guide. Two scenarios (fresh test repo vs.
  merge into existing Playwright repo), bootstrap, troubleshooting, CI hooks.
- `orchestration/doctor` — `aiqa doctor` health check (11 checks: node,
  deps, browsers, auth stub, env files, tags, MCP servers, provider,
  gitignore). Exit code 1 on `fail`.
- `orchestration/init-project` — `aiqa init-project` scaffolder from
  CLI flags. Idempotent; refuses to overwrite without `--force`.
- `LICENSE` — MIT.
- `CONTRIBUTING.md` — how to extend the framework (vs. INSTALL.md = how
  to consume it).

### Files NOT touched throughout the proposal

`helper/test.ts`, `helper/jira-bug-reporter.ts`, `helper/global-setup.ts`,
`helper/authenticate-set-up.ts`, `helper/action-keywords.ts`,
`helper/test-tags.ts` (template), `config/playwright.config.ts`,
`page-objects/sample/`, `tests/sample/`, `jenkins/regression-pipeline`,
`jenkins/scripts/collect-playwright-stats.js`, `environments/*.example`,
the `.claude/skills/qa-agent/` and `.agents/skills/qa-agent/` skill files.

### Hard guardrails enforced at three levels

1. **Mode policy** ([config/agent-policy.ts](src/ai-qa-agent/config/agent-policy.ts):96) — `forbidden` is absolute; no mode override can unblock.
2. **Recursive runner** ([agents/recursive-runner.ts](src/ai-qa-agent/agents/recursive-runner.ts):43) — `forbidden_behavior_detected` finding halts the loop.
3. **Patch guard** ([analyzers/patch-guard.ts](src/ai-qa-agent/analyzers/patch-guard.ts)) — deterministic, last line of defense before any disk write.
