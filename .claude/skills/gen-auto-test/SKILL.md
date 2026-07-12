---
name: gen-auto-test
description: Generate Playwright automation code directly from MANUAL test cases — no Jira story required. Use when the user types /gen-auto-test, pastes manual steps or a test-case table in the conversation, or points at a test-cases file (Excel .xlsx, Markdown table, or canonical JSON) and wants automation code that follows this framework's conventions (POM + single ActionKeyword layer). Normalizes the cases to the canonical JSON, checks every automatable case for auto-friendly steps, and when steps are missing or vague EXPLORES THE LIVE APP with the Playwright MCP (open the web, walk the flow, capture real steps + selectors) before writing code. Human approval gate on the enriched case table; patch-guard on all generated files; runs the new specs headless with a 5/5 stress gate; scripts+results review whose approval auto-creates the branch + MR; finalizes with the standard artifacts; updates the docs/ai tracking files. Jira wrap-up only if the cases carry a story key.
---

# gen-auto-test — Manual test cases → automation code

## Role
Same Senior QA Automation Agent as the `qa-agent` skill, same framework, same
conventions — but the entry point is **manual test cases**, not a Jira story.
Typical users: manual QAs who already have cases written down (Excel sheet,
Markdown table, or just steps in their head) and want them automated.

## How to load this skill
This skill REUSES the qa-agent reference set — read these before acting:

1. `../qa-agent/references/framework-conventions.md` — how generated code MUST look
2. `../qa-agent/references/json-contract.md` — the canonical test-case JSON (single source of truth)
3. `../qa-agent/references/test-case-template.md` — fields, coverage + priority rules
4. `../qa-agent/references/tracking-files.md` — the docs/ai/ memory, test-case, navigation files
5. `../qa-agent/references/mcp-usage.md` — Playwright MCP exploration rules + shared-SUT safety
6. `../qa-agent/references/test-management.md` — Excel export/attach

Scripts:
- `./scripts/import-testcases-excel.js` — Excel (.xlsx, the 11 review columns) → canonical JSON
- `../qa-agent/scripts/export-testcases-excel.mjs` — canonical JSON → Excel (results re-export)
- `../qa-agent/scripts/attach-file-to-jira.js` — attach xlsx/HTML to a story (the Atlassian MCP has no upload tool)
- `../qa-agent/scripts/create-mr.js` — open the MR/PR for a pushed branch (GitLab · GitHub · Bitbucket · Azure DevOps · Gitea; auto-detects from `origin`)

## Invocation contract
Any of these starts the flow:
- `/gen-auto-test` followed by pasted steps / a pasted table
- a file path: `.xlsx` (review-column format), `.md` (pipe table per
  test-case-template), or `.json` (canonical contract)
- plain language: "generate automation for these test cases", "convert
  TestCases_login.xlsx to automation"

No Jira fetch, no status gate. If the input carries a `userStoryKey`, the
Jira wrap-up (sub-tasks + attachments) is OFFERED at the end — never forced.

**Called by qa-agent (shared-engine mode):** qa-agent's Phase 6 shares this
engine. When invoked with an ALREADY-APPROVED canonical JSON, skip Phase 1
(ingest) and the Phase 3 case-review gate — enter at **Phase 2** (step
completeness) and run Phases 2 → 6 as written. The story key rides along for
branch naming and the caller's Jira wrap-up.

---

## Workflow — phases

### Phase 0 — Load context
Same as qa-agent Phase 0: read `docs/ai/{memory,test-case,navigation}.md` and
the framework surface (`ui/helpers/action-keywords.ts`, `core/test-tags.ts`,
`ui/page-objects/`, module `tests/` dirs) so generation REUSES what exists.
Run `yarn aiqa:scan` when the index feels stale.

### Phase 1 — Ingest the cases (any source → canonical JSON)
- **Pasted in conversation**: normalize free-form steps / tables into the
  canonical JSON (`json-contract.md`). One action per step; keep the user's
  wording in `summaryPrecondition`/`testDescription`.
- **Excel**: `node .claude/skills/gen-auto-test/scripts/import-testcases-excel.js
  --xlsx <file> --out test-output/ai/testcases-<feature>.json` (11 review
  columns; extra/missing columns are tolerated and reported).
- **Markdown**: parse the pipe table per `test-case-template.md`.
- **JSON**: validate against the contract; fix field gaps.
- Fill the required fields the source lacks (`tcId` — generate
  `TC-<FEATURE>-<NNN>` continuing from `docs/ai/test-case.md`; `priority`,
  `tags`, `surface`, `coverageType`, `automatable`) and MARK every inferred
  value so the reviewer sees what was assumed.
- Cross-check `docs/ai/test-case.md`: if an equivalent case already exists,
  reuse / re-run instead of duplicating — same rule as qa-agent.

### Phase 2 — Step completeness check + LIVE EXPLORATION
For every `automatable: Y` case, judge the steps against the auto-friendly
bar (one action per step, explicit element and data, deterministic expected
result). Three situations:

1. **Steps are complete** → proceed.
2. **Steps are vague** ("log in", "check it works") → rewrite them into
   explicit steps; verify anything uncertain on the live app.
3. **Steps are missing** (user gave only a title/goal) → **open the web and
   find the steps**: navigate the live app with the Playwright MCP
   (start from `docs/ai/navigation.md` routes; never re-explore a mapped
   screen), walk the flow a user would take, and record each action as an
   explicit step with the REAL selector (priority `data-zcqa → data-test-id →
   data-id → data-title`; never invent selectors).

Exploration rules (`mcp-usage.md` — they all still apply): prefer
snapshot/read tools on shared SUTs, clean up anything created, never run a
destructive flow without confirmation. New screens/routes discovered go into
`docs/ai/navigation.md`.

### Phase 3 — ⏸ Human review (gate)
Present ONE table of the normalized cases (template columns + `coverageType`),
with **discovered/rewritten steps highlighted** and every inferred field
marked. List the files involved as clickable links (input file, canonical
JSON). Wait for the exact `I approve` — no code before that. On approval,
export Excel (`export-testcases-excel.mjs`) so the reviewed set is shareable.

### Phase 4 — Code generation (THE shared engine)
Same rules as qa-agent Phase 6: reuse page objects/flows per the tracking
files and the existing-code index; new shared keywords go INTO
`ActionKeyword`; specs per surface (`ui/tests/`, `api/rest/tests/`, …)
importing `{ test, expect }` from `helper/test`; `setJiraStory('<KEY>')`
when a story key exists; `tags(TAGS.…)` with `TAGS.REGRESSION` + the feature
tag (== Jira label; add missing tags to `core/test-tags.ts` — patch-guard
allows exactly that file); test data in the module's `test-data/`; validate
every generated file with `yarn aiqa:guard` and fix rejections.

### Phase 5 — Run + STRESS TEST (5/5 gate) + FINALIZE
- **STRICT HEADLESS:** every run of newly generated cases — first run,
  re-runs, stress — is headless (`CI=true`, the exact mode CI uses;
  `config/playwright.base.ts` sets `headless: isCI`). Never `--headed` for
  generated cases.
- Run the new specs normally first (headless) and fix anything red. This
  single execution run is what the Allure artifact will show.
- **FINALIZE order — freeze Allure BEFORE stress** so repeats never inflate
  the report: clear allure-results → run the new cases once →
  `yarn allure:single` → copy to `AllureReport_<feature>_<date>.html` →
  only then stress. Stress gets NO Allure artifact.
- **Stress rule — mandatory for every NEW auto case:** re-run it with
  `--repeat-each=5`. **All 5 repeats must pass** — 5/5 green is the bar for
  calling a generated test stable. Any failed repeat = flakiness: fix the
  test (selector, wait, data) and re-stress. Workers: `--workers=1` on a
  shared SUT (default discipline); up to `--workers=3` only when the target
  tolerates parallel. Report stress as a markdown summary table (case |
  repeats | result | duration) — review gate, MR description, and (when a
  story key exists) a Jira comment on the parent story. Data-creating specs:
  teardown runs per repeat — verify no leftovers on a shared SUT.
- Remaining FINALIZE links: the AI-QA stakeholder HTML (`yarn report:all`),
  the bug-drafts index (`npx tsx core/jira/ensure-bug-drafts-index.ts` —
  exists even when green), results-Excel re-export (verify the Test Result
  column is filled — a resultless sheet is a duplicate). Failures produce
  approval-gated bug DRAFTS only (core/test.ts gate; `JIRA_AUTO_BUG=yes` is
  the explicit opt-in).

### Phase 6 — ⏸ Review scripts + results → branch is AUTOMATIC on approval
Present for human review, with clickable links: every generated file (a
one-line plain-English summary each + `git diff --stat`), the run + stress
results per case (the 5/5 table), and the finalize artifact links. The MR
description follows the qa-agent best-practice format: what changed /
execution table / stress table / artifacts+Jira / reviewer notes. Wait for
explicit approval. **That approval IS the authorization to ship**: create
the branch, commit ONLY the generated files, push and open the MR
automatically — no second confirmation.
- Branch naming (team rule): **`test/manual-<feature-slug>-<YYYYMMDD>`**;
  when the cases carry a story key use **`test/<STORY-KEY>-<feature-slug>`**.
- MR/PR via `../qa-agent/scripts/create-mr.js` (multi-provider: GitLab ·
  GitHub · Bitbucket · Azure DevOps · Gitea; auto-detects from the `origin`
  remote, config in `environments/.env.git`) — title
  `<feature>: qa-agent generated tests (manual cases)`, description = the
  review summary + artifact links. Show branch + MR link in the summary.
- Skippable on request; report "branch+MR skipped — repo not bootstrapped"
  if the remote is missing.

### Phase 7 — Update tracking (+ optional Jira)
- `docs/ai/test-case.md` — catalogue rows + statuses; `memory.md` — generated
  work, decisions, run history; `navigation.md` — new screens from Phase 2.
- Archive the frozen canonical JSON under `docs/ai/`.
- **Only if the cases carry a `userStoryKey`** and the user wants it: attach
  the Excel/Allure to the story (`attach-file-to-jira.js`) and create the
  qa-agent sub-tasks (`../qa-agent/references/jira-sync.md`).

## Hard rules
- Everything in the qa-agent Hard rules applies (approval gates, bug drafts
  never auto-filed, shared-SUT safety, anti-duplication, conventions,
  presentation rules — clickable file lists at every gate and summary).
- **Never fabricate steps.** A step the user didn't give and the live app
  didn't show does not go into a case; record it as an open question instead.
- **Exploration is read-first.** Creating data during exploration follows the
  framework's CRUD lifecycle discipline; destructive flows need explicit
  confirmation.

## Conflict order
1. explicit user instruction
2. `../qa-agent/references/framework-conventions.md`
3. this SKILL.md workflow
4. `../qa-agent/references/json-contract.md` / `test-case-template.md`
5. `../qa-agent/references/tracking-files.md` / `mcp-usage.md` / `test-management.md`
