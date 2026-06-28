# Jira sync — status gate, label composition, sub-tasks

This is the Jira side of the qa-agent workflow: which stories run the full
flow, how labels become tags, and what sub-tasks are created at the end.

---

## Status gate — "READY FOR QA"

When the Jira MCP returns the user story (Phase 1), read its **Status** and
normalise case-insensitively. Common board variants:
- `READY FOR QA`, `Ready for QA`, `Ready For QA`, `READY_FOR_QA`.

### Full mode
Status normalises to **`READY FOR QA`** → run the full workflow:
- Phase 2 — trigger Jenkins for related existing tests.
- Phase 3 — generate test case drafts.
- Phase 4 — human review.
- Phase 5 — code generation.
- Phase 6 — run new auto cases.
- Phase 7 — update tracking + create all 3 sub-tasks (all set to Done).

### Draft-only mode
Status is anything else → skip Phases 2 / 5 / 6:
- The code under test is not deployed yet, so running automation is either
  impossible or misleading.
- Still do Phase 3 (generate drafts) and Phase 4 (human review).
- For Phase 7: only Subtask 3 (manual cases) is created, with status **Open**
  — the manual cases are catalogued for later. Subtasks 1 and 2 do not apply.

### Hard rule
Never run / trigger automation against a story that is not READY FOR QA. If
the user explicitly overrides ("run anyway"), surface what is being skipped
and continue — do not silently switch modes.

---

## Label composition

Convert the story's Jira labels into the Playwright / Jenkins `TAGS` value:
- Each label `foo-bar` becomes the tag `@foo-bar` (kebab-case; see
  `framework-conventions.md` §6).
- One label → single tag, e.g. `@crm`.
- Many labels → regex-OR string for Playwright `--grep`, e.g. `@crm|@add-case`.
  The trigger script accepts this verbatim:
  ```
  node .claude/skills/qa-agent/scripts/trigger-jenkins.js "@crm|@add-case" --branch=main --no-wait
  ```
- If a needed feature tag is not yet in `helper/test-tags.ts`, add it to the
  `TAGS` map (the spec then references it as `TAGS.<KEY>`).

The same composed string is passed to `find-related-tests.js` in Phase 2.

---

## Sub-tasks (Phase 7)

After Phase 6 finishes, create three sub-tasks on the parent user story using
the Jira MCP. Detect the supported child issue type (`Subtask` vs `Sub-task`)
once; fall back to a linked `Task` if subtasks are disallowed. Never fail the
workflow because sub-task creation failed — log it and continue.

### Subtask 1 — Execute related test cases
Covers the **Phase 2** Jenkins build that ran the related existing tests.

Description (markdown):
- The body of the run-result email (the framework's
  `jenkins/scripts/collect-playwright-stats.js` builds an HTML summary —
  paste it or its plain-text form here for a nice description).
- The **Allure report link**: `<build-url>/allure/` (Jenkins Allure plugin
  URL pattern; e.g. `http://localhost:8080/job/sample-regression-web/17/allure/`).
- The Jenkins build URL itself: `<build-url>/console`.

Status: **Done** once the build's result is known and the link is attached.

### Subtask 2 — Add new automation cases
Covers the **Phase 6** run of the newly generated automation cases.

Description (markdown):
- A table or bullet list of new auto cases, each with: `TC ID`, title, spec
  file path, Jira AC ids covered.
- The Phase 6 build / local run result, plus the Allure link if a separate
  CI run was triggered.
- A note if any case was REUSED rather than regenerated (cite the existing
  spec).

Status: **Done** once the new auto cases have a passing run (or the failure
is documented as a real defect linked back to the story).

### Subtask 3 — Add new Manual cases
Covers the manual cases (Automatable = N) — the long tail of cases that
cannot be automated this round.

Description (markdown):
- One section per manual case: `TC ID — Title`, Preconditions, numbered
  Steps, Expected Result, mapped AC ids.

Status:
- Full mode → **Done** (manual cases catalogued; execution happens off-tool).
- Draft-only mode → **Open / To Do** (story is not yet READY FOR QA;
  execution will happen later).

### Hard rules
- Sub-task creation must not block the workflow. On Jira MCP / permission
  failure, write the same content to `docs/ai/memory.md` "Run history" so it
  is not lost, and surface the failure in the final report.
- Reused artifacts (existing specs, existing page objects, existing manual
  cases) must be CITED, not duplicated, in the relevant sub-task.
- All three sub-tasks share the same `tags` value (the composed Jira label
  tag) so they are traceable back to the user story by `--grep`.

---

## MCP fallback
If the Jira MCP is missing or errors at sub-task creation time:
- Save the would-be content of each sub-task to a section in
  `docs/ai/memory.md` titled "Pending Jira sub-tasks — <user_story_key>".
- Tell the user the names + bodies so they can paste them into Jira manually.
- Mark this gap in "Known gaps" so the next run reminds you.
