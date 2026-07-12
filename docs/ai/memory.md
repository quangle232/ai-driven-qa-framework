# qa-agent Memory

Context carried across qa-agent runs. Read in Phase 0, updated in Phase 6
after every generation and every run.

## Generated work
| Date | Source | Feature | Tag | Artifacts |
|------|--------|---------|-----|-----------|
| _empty — first run will populate this_ | | | | |

## Decisions
- 2026-07-13 — **Bug policy: DRAFTS by default.** Final-attempt failures write approval-gated
  drafts (JSON + HTML) to `test-output/ai/bug-drafts/`; nothing reaches Jira without human
  approval (the `create-bug` skill approves drafts). `JIRA_AUTO_BUG=yes` is the explicit
  opt-in for direct auto-filing.
- 2026-07-13 — **Ship gate: branch + MR/PR only.** Generated code never lands on the default
  branch; the qa-agent Phase 7.5 / gen-auto-test Phase 6 approval auto-creates
  `test/<KEY>-<slug>` (or `test/manual-<slug>-<date>`) + an MR via `scripts/create-mr.js`
  (GitLab · GitHub · Bitbucket · Azure DevOps · Gitea; config `environments/.env.git`).
- 2026-07-13 — **Stability bar: 5/5 headless stress.** Every NEW generated case must pass
  `--repeat-each=5` under `CI=true` before it counts as done; Allure is frozen BEFORE stress.
- 2026-07-13 — **Patch scope:** generated patches may touch the module
  tests/page-objects/test-data roots + `core/test-tags.ts` (additive tags only); the rest of
  `core/` stays patch-guarded.

## Known gaps
- _empty_ — missing data-test-id, brittle selectors, manual-only areas,
  MCP steps skipped via fallback.

## Run history
| Date | Tag | Result |
|------|-----|--------|
| _empty_ | | |
