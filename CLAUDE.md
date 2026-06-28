# AI-Driven QA Framework — Claude project guide

A reusable **Playwright + TypeScript** QA framework starter: Page Object Model + a single
`ActionKeyword` interaction layer across **UI · API · gRPC · mobile**, an AI **qa-agent**
skill (Jira story → cases → code →
run → report), **4 read-first MCP servers**, regression + bug **HTML/DOCX** report
generators, a framework-wide failure → Jira-bug reporter, and sample CI pipelines
(Jenkins · GitHub Actions · GitLab CI).

> Drop this into any web project. Nothing here is tied to a specific app — `tests/sample/`,
> `page-objects/sample/`, `test-data/sample-data.ts` are placeholders to replace. Search for
> `sample` / `example` to find what to swap.

## First time on a new project
1. `yarn install`, then `cp environments/.env.test.example environments/.env.test` and fill the
   SUT URL + login. (`test_env` picks the file: dev|test|prod, default test. Jira/Figma vars
   optional — see `environments/.env.jira.example`.)
2. Set the SUT base URL + auth in `helper/auth-config.ts` / `helper/global-setup.ts`.
3. Replace the `sample` page object + spec with your app's first flow (keep the conventions).
4. Read `.claude/skills/qa-agent/SKILL.md` before generating cases/code with the agent.

## The qa-agent skill
`.claude/skills/qa-agent/SKILL.md` (mirror at `.agents/skills/qa-agent/` for Codex). Drives:
Jira story → manual + automation cases → review table → Playwright code (POM) → run →
report → Jira sub-tasks. Its `references/` are the source of truth for HOW generated code
must look — read `framework-conventions.md` first.

## MCP servers — prefer these over Bash (they save tokens)
Registered in **`.mcp.json`** (Claude Code loads per-project; approve once via `/mcp`).
They return compact JSON (capped 80 KB; file reads capped 120 lines) so you don't burn
tokens parsing big files. **Use an MCP tool when one exists; fall back to Bash only if not.**
- `aiqa-qa-report` — last run results: `aiqa.qa.get_run_summary`, `get_failed_tests`,
  `get_failure_clusters`, `get_critical_events`, `get_diagnosis`, `list_runs`.
- `aiqa-framework-context` — `aiqa.fw.get_conventions`, `get_existing_code_index`,
  `find_page_object`, `list_action_keywords`, `search_tests`, `read_snippet`. Call BEFORE generating code.
- `aiqa-memory` — known-issues / flaky-history / failure-patterns / glossary (writes need `AIQA_ALLOW_MEMORY_WRITE=true`).
- `aiqa-test-runner` — `list_available_tests`, `get_last_run_status`, `trigger_targeted_run` (exec needs `AIQA_ALLOW_EXEC=true`).
Read-only by default. Regenerate config: `yarn aiqa:mcp:config`; catalogue: `yarn aiqa:mcp:list --tools`.

## How to run
- `yarn test:dev` / `yarn test:test` / `yarn test:prod` → `npx cross-env test_env=<dev|test|prod> playwright test -c config/playwright.config.ts` (default `test`)
- Env files: `environments/.env.<env>` (gitignored; only `.env.example` is committed).
- Slices: `--grep @regression` · green slice `--grep-invert @bugs` · `--grep @<feature>`.
- By surface: `yarn test:api` · `yarn test:grpc` · `yarn test:mobile:web` · `yarn test:mobile:native` (skip-gated). Local mocks: `yarn mock:api` · `yarn grpc:mock`.
- Reports: **`yarn report:bugs`** → `test-output/ai/test-report.html` (regression) +
  `bug-report.html`/`.md`/`.docx`. `yarn report:all` runs the fuller AI-QA pipeline.
  Playwright's own report: `test-output/html` (`yarn open:report`).

## Layout
- Specs: `tests/**/*.spec.ts` · Page objects: `page-objects/` (extend `base-page.ts`)
- Test surfaces (each has a README): UI (`tests/sample`) · API (`api/`, `tests/api`) · gRPC (`grpc/`, `tests/grpc`) · mobile (`mobile/` + `tests/mobile` native, `tests/mobile-web` emulation)
- Interaction layer: `helper/action-keywords.ts` (`ActionKeyword`) — never call `page.locator` in a spec
- Tags: `helper/test-tags.ts` (`TAGS`, `tags()`) · Test data: `test-data/`
- Auth/setup: `helper/global-setup.ts` + `helper/auth-config.ts`; storage states in `.auth/`
- Config: `config/playwright.config.ts` · AI agent: `src/ai-qa-agent/` · MCP: `mcp/`
- CI samples (read `ci/README.md` to align a pipeline): `ci/` → `jenkins/` · `github-actions/` · `gitlab/`
- Tracking docs (read before generating, update after): `docs/ai/{memory,test-case,navigation}.md`
- Bug catalogue (drives the bug reports): `test-output/ai/bugs.json` (schema in `scripts/gen-reports.mjs`)

## Conventions
- POM + the single `ActionKeyword` layer; prefer `data-*` selectors; async-safe getters.
- `@bugs`-tagged tests assert CURRENTLY-BROKEN behaviour — **expected to fail** until fixed
  (executable proof). Green slice = `--grep-invert @bugs`.
- `tag == Jira label` links Jira ↔ Playwright `--grep` ↔ CI (the `ci/` samples — Jenkins · GitHub Actions · GitLab).
- Code comments in English. Verify UI bugs with screenshot + DOM before declaring them.
- Don't create accounts or type passwords into fields; the user does those.

## Operating discipline (hard-won — see docs/ai/LESSONS-LEARNED.md)
- **Shared/demo SUTs: run serial (`workers: 1`).** One server-side session — parallel
  workers race and hang. Use `--retries=2` so count/reconciliation flakes self-heal.
- **Isolate destructive cases.** Never put data-wiping or device-destructive tests in the
  shared regression — they corrupt the baseline and can wedge the environment. Skip-gate
  them (`process.env.ALLOW_* ? test : test.skip`) and run on a throwaway target.
- **Leave the SUT clean.** Self-created fixtures cause count drift in reconciliation tests —
  remove them or assert against live totals, never hardcoded counts on a shared instance.
- **Distinguish env failures from real failures** before reporting bugs (timeouts/slowdowns
  ≠ product defects). Re-run on a healthy env; only deterministic asserts are bugs.
