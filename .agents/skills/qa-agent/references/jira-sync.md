# Jira sync — status gate, label→tag, sub-tasks

The Jira side of the workflow: which stories run automation, how labels become
tags, and the two sub-tasks created around the approval + execution flow.

---

## Status gate — "READY FOR QA"
Read the story Status (Phase 1) and normalise case-insensitively
(`READY FOR QA`, `Ready for QA`, `READY_FOR_QA`, …).

- **Design phases (2–5) ALWAYS run** — case design, review, approval, and export to the
  test-management tool don't need deployed code.
- **Automation + execution phases (6–7) run only when status is `READY FOR QA`.** Otherwise stop
  after export and say so (running automation against undeployed code is misleading).
- If the user explicitly overrides ("run anyway"), surface what is being skipped — never silently switch.

## Label → tag composition
- Each Jira label `foo-bar` → tag `@foo-bar` (kebab-case; `framework-conventions.md` §6).
- One label → `@crm`; many → regex-OR for `--grep`, e.g. `@crm|@add-case`.
  ```
  node .agents/skills/qa-agent/scripts/trigger-jenkins.js "@crm|@add-case" --branch=main --no-wait
  ```
- Same string feeds `find-related-tests.js`. Missing feature tag → add it to `helper/test-tags.ts`.
- `tag == Jira label` links Jira ↔ Playwright `--grep` ↔ CI ↔ the test-management tool.

---

## Child issue-type compatibility
Don't assume `Sub-task`. Detect the supported child type once: prefer `Subtask`, else `Sub-task`,
else fall back to a linked `Task`. A type mismatch must never block the workflow.

## Sub-task 1 — `Create Test Case`
Created in Phase 4 as the **review sync target** for the approval loop.
- Description: the exact review table + status + assumptions + open questions (mirror the conversation;
  see `review-and-approval.md`). No derived/summary tables.
- Set **Done** once the JSON is approved (`I approve`).
- NOT an attachment target — the Excel file is **not** attached here.

## Sub-task 2 — `Execute Testing`
Created in Phase 8 for execution tracking / worklog.
- Description: the Phase 7 run result (pass/fail counts), the **HTML execution report** link/path
  (`test-output/ai/test-report.html`), the test-management run link (Xray Test Execution / TestRail
  run), and new auto cases (TC id + title + spec path), citing any REUSED specs.
- Status: **Done** once executed (or the failure is documented as a real defect linked to the story).
- Keep it lightweight — do not attach the main Excel or duplicate all cases here.

## Artifact rules
- **Excel** → attach to the **parent user story only** (never a sub-task). If direct attach is
  unsupported, comment the path + manual-attach note on the story.
- **JSON** (frozen, approved) → always saved under `docs/ai/`.
- **Xray/TestRail** cases/results live in those tools (see `test-management.md`); link them on the story.

## MCP fallback
If the Jira MCP is missing or errors:
- write the sub-task content + review table to `docs/ai/memory.md` ("Pending Jira sub-tasks — <key>"),
- tell the user the names + bodies to paste manually,
- record the gap in "Known gaps". Never fail the workflow over Jira/sub-task problems.
