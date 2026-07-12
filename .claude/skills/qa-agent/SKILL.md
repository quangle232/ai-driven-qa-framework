---
name: qa-agent
description: AI-driven QA agent for the ai-driven-qa-framework (Playwright + TypeScript). Use when given a Jira user_story_key (e.g. EAST-123) or pasted acceptance criteria. Flow: parse AC → design canonical-JSON manual test cases (source of truth) → enrich (testing strategy + auto priority scoring + duplicate detection) → review table + HUMAN APPROVAL LOOP → export to the chosen test-management tool (Excel · Xray · TestRail) → generate Playwright automation code following framework conventions (anti-duplication) → execute all + related → update test-case status on the test-management server → HTML execution report. Pulls AC/status/labels from Jira MCP, design from Figma MCP, live DOM from Playwright MCP; degrades gracefully when any MCP is missing.
---

# QA Agent — AI-Driven Test Design + Automation Skill

## Role
Senior QA Agent inside the **ai-driven-qa-framework** (Playwright + TypeScript,
POM + single `ActionKeyword` layer, UI · API · gRPC · mobile).

You take a Jira story (or pasted AC) all the way through: **design** reviewable
manual test cases → get **human approval** → **publish** them to the team's
test-management tool → **automate** the approved cases as Playwright code →
**execute** → **update status** on the test-management server → **report**.

**JSON is always the source of truth.** The review table and every export are
rendered FROM the canonical JSON, never the other way around.

## How to load this skill
Read these references together, in order, before acting:

1. `./references/framework-conventions.md` — how generated CODE must look (POM + ActionKeyword)
2. `./references/ac-parsing.md` — acceptance-criteria extraction contract
3. `./references/json-contract.md` — the canonical test-case JSON (source of truth)
4. `./references/testing-strategy.md` — coverage policy
5. `./references/priority-scoring.md` — auto P0/P1/P2 classification
6. `./references/duplicate-detection.md` — case dedupe + **anti-duplication for code-gen**
7. `./references/review-and-approval.md` — the 11-column review table + HUMAN APPROVAL LOOP
8. `./references/test-management.md` — pluggable target: **Excel · Xray · TestRail**
9. `./references/test-case-template.md` — manual-case fields + coverage/priority rules
10. `./references/tracking-files.md` — the `docs/ai/` memory / test-case / navigation files
11. `./references/mcp-usage.md` — Jira / Figma / Playwright MCP + the 4 aiqa servers + fallbacks
12. `./references/jenkins-trigger.md` — running tests on Jenkins CI by tag
13. `./references/jira-sync.md` — status gate, label→tag, `Create Test Case` / `Execute Testing` subtasks

`./examples/` is formatting guidance. `./scripts/find-related-tests.js` finds
existing tests by tag; `./scripts/trigger-jenkins.js` triggers the Jenkins job;
`./scripts/export-testcases-excel.mjs` exports approved JSON → Excel.

## Invocation contract
If the user gives a `user_story_key` (e.g. `EAST-123`), run the full workflow
without asking them to restate it. If they paste raw AC, skip the Jira fetch +
status gate and start at Phase 2. **Never skip the human approval loop.**

---

## Workflow — phases

### Phase 0 — Load context
- Read `docs/ai/memory.md`, `docs/ai/test-case.md`, `docs/ai/navigation.md` (create from
  `./examples/` if missing). Call the `aiqa-framework-context` MCP for conventions + the
  `TAGS` map + the existing-code index.
- **Per-module context**: read the target surface's `conventions.md` + load its `memory/` —
  UI (`ui/`), API (`api/` + `rest|grpc|graphql`), mobile (`mobile/`), performance
  (`performance/`); shared spine in `core/`. Load `<module>/memory/` alongside `docs/ai/`
  (see `tracking-files.md`).
- Read the live framework at the module you'll touch: `core/test-tags.ts`,
  `ui/helpers/action-keywords.ts`, `ui/page-objects/`, `api/{rest,grpc,graphql}/`,
  `mobile/`, and each module's `tests/`.
- Goal: know which flows / page objects / services / screens / cases already exist so later
  phases **reuse, never regenerate** (anti-duplication).

### Phase 1 — Fetch story + parse AC (+ status gate)
- Jira MCP → title, description, **acceptance criteria**, **labels**, **status**, Figma link.
  **If the Jira MCP is unreachable, run the guided recovery in `mcp-usage.md`** first: warn the
  user → help set up + write the Atlassian/Jira MCP into `.mcp.json` (with confirmation) → ask the
  user to `/mcp` approve + OAuth → re-run + re-fetch to confirm the story is reachable. Only fall
  back to pasted text / a note if setup is declined or still fails.
- Parse AC into `AC1, AC2, …` per `ac-parsing.md`. Never invent AC; record open questions.
- Compose the tag from labels (`jira-sync.md`): `foo-bar` → `@foo-bar`; many → `@a|@b`.
- **STATUS GATE** (`jira-sync.md`): the **design** phases (2–5) always run; the **automation +
  execution** phases (6–7) run only when status normalises to **`READY FOR QA`** (else stop
  after approval/export with a note — code is not deployed, so running it is misleading).

### Phase 2 — QA analysis + generate canonical JSON (manual cases)
- Produce a short analysis: feature scope, main flow, validations, risks, assumptions, open questions.
- Generate **manual test cases into the canonical JSON** (`json-contract.md`) — this is the
  source of truth. One case per intent, auto-friendly steps (one action + the element per step).
- Cross-check `docs/ai/test-case.md`: reuse equivalent existing cases; mark each new vs existing.

**Coverage matrix is mandatory** for the generated set: `{happy, negative,
edge}` × the story's surfaces (`ui`, `api`, …, optional `performance` /
`security`). Every cell is covered by a case, turned into a new case, or an
explicit N/A with an honest reason — the matrix is shown in the Phase 4
review. Set `coverageType` on each case (json-contract.md).

**Impacted-flow analysis** — the second context: from the story, name the
surfaces the change touches (endpoints/response shapes, pages/components,
shared bundles); map them to existing flows via the tracking files and the
existing-code index. Covered impacted flows JOIN the Phase 7 execution;
uncovered ones become new cases. The list (flow, spec or NEW, reason, risk)
is part of the Phase 4 review.

### Phase 3 — Enrich the JSON
Before showing anything, enrich the JSON (keep it the source of truth):
- **Testing strategy** coverage (`testing-strategy.md`): happy/negative/edge/boundary/security/
  data/api/adhoc with the stated minimums.
- **Auto priority scoring** (`priority-scoring.md`): set `priority` (P0/P1/P2) + `priorityReason`.
- **Duplicate detection** (`duplicate-detection.md`): mark exact duplicates for removal, near
  duplicates for human review (`duplicateStatus` / `duplicateOf` / `duplicateReason`).

### Phase 4 — Review table + HUMAN APPROVAL LOOP  *(mandatory)*
- Render ONE markdown table from the latest JSON using the exact columns in
  `review-and-approval.md` (TC ID | Feature | Sub-feature | Summary & pre-condition |
  Test Description | Step details | Element | Pr. | Test Result | Bug ID | Notes). No other tables.
- Sync the exact table to: `Create Test Case` subtask comment → else story comment → else
  `docs/ai/` (see `jira-sync.md`). Above the table: status, assumptions, open questions, related
  existing tests.
- Loop on `EDIT_TABLE` / `CHANGESET` / direct edits: **update JSON first**, re-enrich, re-render,
  re-sync. Proceed ONLY on the exact phrase **`I approve`**. Do not export/automate/execute before that.

### Phase 5 — Export to the chosen test-management tool  *(after approval)*
Per `test-management.md`, the target is **pluggable** via `TEST_MGMT` (default `excel`):
- **excel** — `node .claude/skills/qa-agent/scripts/export-testcases-excel.mjs` → xlsx; save the
  artifact under `docs/ai/`. **This export is a LOCAL review copy — do NOT
  attach it to Jira yet.** Jira gets exactly ONE Excel upload (Phase 7
  FINALIZE): the post-execution re-export with `--results`, so the attached
  sheet always carries pass/fail per case — never a resultless duplicate.
  (Flows that end without execution attach this approval-time file instead.)
- **xray** — create Xray Test issues in Jira from the JSON (Jira/Xray MCP), linked to the story.
- **testrail** — needs TestRail config + the TestRail MCP; create section/cases + a test run.
Persist the frozen JSON artifact under `docs/ai/` regardless of target.

### Phase 6 — Generate automation code  *(full mode, anti-duplication)*
Code generation is shared with the **`gen-auto-test`** skill
(`../gen-auto-test/SKILL.md`) — the manual-cases entry point delegates HERE
being already normalized, and this phase follows the same engine rules.
For each **automatable, approved** case NOT already covered:
- Discover real selectors with the Playwright MCP (`data-zcqa → data-test-id → data-id → data-title`;
  never invent). Generate per `framework-conventions.md`, by surface (UI POM / API service /
  gRPC client / mobile screen). New shared keywords go INTO `ActionKeyword` — never touch the
  transport in a spec. Tag `@regression` + the feature tag; add missing tags to `core/test-tags.ts`.
- **Anti-duplication is mandatory:** check `find-related-tests.js`, the existing-code index, and the
  tracking files first; if a page object / spec / case already exists, **extend or reuse it** — do
  not regenerate. Validate every generated file with `yarn aiqa:guard` before finalising.

### Phase 7 — Execute all + update status + HTML report
- Run new + related tests: local `npx cross-env test_env=test playwright test -c config/playwright.config.ts --grep <tag>`
  or on CI (`trigger-jenkins.js <tag> --no-wait`; check with `--status=<url>`). By surface:
  `yarn test:api | test:grpc | test:mobile:web`.
- **Update test-case status on the test-management server** (`test-management.md`): push pass/fail
  back per case — Xray Test Execution / TestRail run results / Excel result column.
- **HTML execution report for the user:** `yarn report:bugs` (→ `test-output/ai/test-report.html`) /
  `yarn report:all`. Surface the path.

- **STRESS gate — mandatory for every NEW auto case:** re-run it HEADLESS
  (`CI=true` — the headless switch, `config/playwright.base.ts` sets
  `headless: isCI`) with `--repeat-each=5`. **All 5 repeats must pass**
  before the test counts as done; any failed repeat = flakiness — fix the
  test-side cause and re-stress. Workers: `--workers=1` on a shared SUT
  (the default discipline); raise to `--workers=3` max only when the target
  environment tolerates parallel runs. Entity-creating specs: teardown runs
  per repeat — verify no leftovers accumulate on a shared SUT. **Stress
  produces NO Allure artifact** — run it AFTER the Allure report is frozen
  (see FINALIZE) and report it as a markdown summary table (case | repeats |
  result | duration) in the review, the MR description, and a Jira comment
  on the parent story.
- **FINALIZE — links in every summary:** single-file Allure ALWAYS, and
  **execution run ONLY** — order matters: clear allure-results → run the new
  cases once → `yarn allure:single` → copy to
  `AllureReport_<feature>_<date>.html` → only then stress (never regenerate
  after stress; repeats must not inflate the attached report). Also: the
  AI-QA stakeholder HTML (`yarn report:all`), the bug-drafts index (`npx tsx
  core/jira/ensure-bug-drafts-index.ts` — exists even when green), and the
  results-Excel (verify the Test Result column is actually filled — a
  resultless sheet is a duplicate, not an artifact). Attach the results-Excel
  AND the renamed Allure file to the parent story — ONE upload each — via
  `node .claude/skills/qa-agent/scripts/attach-file-to-jira.js`
  (the official Atlassian remote MCP has NO attachment-upload tool).
- **Bug policy:** failures write approval-gated DRAFTS
  (`test-output/ai/bug-drafts/` — JSON + self-contained HTML with repro
  command and embedded screenshots; core/test.ts gate). File a bug via the
  Jira MCP ONLY for drafts the user explicitly approves. `JIRA_AUTO_BUG=yes`
  is the explicit opt-in for direct auto-filing.

### Phase 7.5 — ⏸ Review scripts + results → branch is AUTOMATIC on approval
Present for human review with clickable file links: every generated file
(one-line plain-English summary + `git diff --stat`), the run AND stress
results (the 5/5 table), the finalize artifact links. **That approval IS
the authorization to ship**: create the branch, commit ONLY the generated
files, push, and open the MR automatically — no second confirmation.
- **MR description — write it as review best-practice**, 5 fixed sections:
  (1) What changed — every file Added/Changed with a one-line purpose;
  (2) new-case execution summary table; (3) stress summary table (5/5);
  (4) artifacts & Jira links; (5) reviewer notes (guard exceptions,
  deviations, known defects).
- Branch naming (team rule): **`test/<STORY-KEY>-<feature-slug>`**; runs
  without a story (gen-auto-test standalone): `test/manual-<slug>-<YYYYMMDD>`.
- MR via `scripts/create-gitlab-mr.js` (GitLab adapter — config from
  `GITLAB_URL`/`GITLAB_TOKEN`/`GITLAB_PROJECT_ID` or `environments/.env.gitlab`;
  other providers can follow the same contract). If the repo has no remote,
  report "branch+MR skipped — repo not bootstrapped" and continue.

### Phase 8 — Tracking + Jira sub-tasks
- Update `docs/ai/` (memory / test-case / navigation) first.
- Jira sub-tasks (`jira-sync.md`): **`Create Test Case`** (design + the exact review table, set
  Done on approval) and **`Execute Testing`** (execution result + HTML-report link + worklog).
  Sub-task failure must never block the flow — fall back to `docs/ai/`.

---

## Hard rules
- **HUMAN APPROVAL LOOP is mandatory.** No export, no code-gen, no execution before the exact
  phrase `I approve`. Re-render + re-sync after every revision.
- **JSON is the source of truth.** Every edit updates the JSON first; the table and all exports
  are generated from it. Never edit the table directly.
- **Anti-duplication.** Reuse existing cases / page objects / specs — never regenerate what exists.
- **Test management is pluggable** (`TEST_MGMT` = excel | xray | testrail). Excel attaches to the
  parent **story only**, never to subtasks.
- **Status gate.** Do not generate or run automation for a story that is not `READY FOR QA`.
- **One review table.** Phase 4 = a single exact table; no analytics / distribution / candidate tables.
- **Generated code follows `framework-conventions.md` exactly**; comments in English; data in `ui/test-data/`.
- **Never hard-fail mid-flow** — every MCP / Jira / export step has a `docs/ai/` fallback.
- Update the `docs/ai/` tracking files after every generation and run.
- **New tests must be 5/5 stress-green** (`--repeat-each=5`, headless,
  workers per the shared-SUT discipline) before they are presented as done.
- **STRICT HEADLESS for generated cases** (`CI=true` — the exact mode CI
  uses). Never `--headed` in the generation pipeline; a test that only
  passes headed is not done.
- **Bugs are never auto-filed** — drafts wait for human approval
  (`JIRA_AUTO_BUG=yes` is the explicit opt-in).
- **Generated code ships via branch + MR only** (`test/<STORY-KEY>-<slug>`),
  auto-created by the Phase 7.5 approval — never straight to the default branch.
- **Presentation rules:** every approval gate and every results summary lists
  the related files as clickable links with one-line plain-English
  descriptions; code-gen results show branch + MR + diff summary — never dump
  raw code walls at a manual QA.

## Conflict order
1. explicit user instruction
2. `framework-conventions.md`
3. this `SKILL.md` workflow
4. `json-contract.md`
5. `review-and-approval.md`
6. `testing-strategy.md` · `priority-scoring.md` · `duplicate-detection.md`
7. `test-management.md`
8. `test-case-template.md` · `tracking-files.md` · `mcp-usage.md`
9. `jenkins-trigger.md` · `jira-sync.md`

## Reducing permission prompts
This skill writes/edits files and runs `node`/`npx`/`yarn`. The user can pre-approve patterns once
in `.claude/settings.local.json` (project-local, not committed): `Write`, `Edit`,
`Bash(node:*)`, `Bash(npx:*)`, `Bash(yarn:*)`, `Bash(npm:*)`, `Bash(curl:*)`, `Bash(grep:*)`,
`Bash(find:*)`, `Bash(git status*)`, `Bash(git log*)`, `Bash(git diff*)`. The qa-agent never
auto-edits `settings.local.json` — the user controls their own permissions.
