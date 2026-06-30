# Test management — pluggable target (Excel · Xray · TestRail)

The approved canonical JSON is published to the team's test-management tool. The
target is **client-chosen** via `meta.testMgmt` in the JSON (or env `TEST_MGMT`);
default **`excel`**. The same JSON drives every target — pick the adapter, don't
re-author the cases.

## Adapter contract (every target implements)
1. **publish_cases(json)** — create/update the test cases in the tool from the JSON.
2. **create_run()** — open an execution run/cycle (where applicable).
3. **push_results(results)** — write pass/fail/blocked per case after Phase 7.
4. **update_status(caseId, status)** — keep case/run status current on the server.

Always also persist the frozen JSON artifact under `docs/ai/` (the note-context analogue).

## Field mapping (canonical JSON → target)
| JSON | Excel column | Xray (Jira Test issue) | TestRail |
|---|---|---|---|
| `tcId` | TC ID | external id / label | custom id |
| `feature`/`subFeature` | Feature / Sub-feature | components/labels | section path |
| `summaryPrecondition` | Summary & pre-condition | summary + precondition | title + preconds |
| `stepDetails[]` | Step details | Test steps (action/data/expected) | steps (separated) |
| `priority` | Pr. | priority | priority |
| `acIds`/`tags` | Notes | linked story + labels | refs |
| `testResult`/`bugId` | Test Result / Bug ID | execution status + defect | status + defect |

## excel  (default)
```bash
node .claude/skills/qa-agent/scripts/export-testcases-excel.mjs \
  --json docs/ai/testcases.<feature>.json \
  --out  test-output/ai/TestCases_<feature>.xlsx
```
- Attach the xlsx to the **parent Jira user story only** (never to a sub-task).
- After execution, re-run with `--results` (or update the `Test Result` column) and re-attach.

## xray  (Jira-native)
- Xray tests ARE Jira issues (issue type **Test**). Use the Atlassian/Jira MCP
  (`createJiraIssue`) to create one Test per case from the JSON, set the manual steps, and
  **link each to the user story**. (Steps via the Xray REST/GraphQL API when the MCP can't set them.)
- Execution: create a **Test Execution** issue and import results
  (`POST /api/v2/import/execution`) mapping each case's pass/fail; link the execution to the story.
- `update_status` = the test's execution status in that Test Execution.

## testrail  (external)
- **Requires** TestRail config + a TestRail MCP/connector:
  `TESTRAIL_URL`, `TESTRAIL_USER`, `TESTRAIL_API_KEY`, `TESTRAIL_PROJECT_ID` (gitignored).
- `publish_cases` → ensure suite/sections, `add_case` per JSON case.
- `create_run` → `add_run` (the approved case ids). `push_results` → `add_results_for_cases`.
- Status map: pass→1 · blocked→2 · untested→3 · retest→4 · fail→5.
- If the TestRail MCP/config is absent: fall back to **excel** + note the gap in `docs/ai/`.

## Status mapping (common)
`passed → pass` · `failed → fail` · `skipped → untested/skipped` · `flaky → retest` ·
`@bugs expected-fail → blocked/known-defect`.

## Hard rules
- Publish/export only AFTER `I approve` (frozen JSON).
- Excel attaches to the parent **story only**. Xray/TestRail status updates happen in Phase 7
  after execution. Any target failure → fall back to `excel`/`docs/ai/`, never block the flow.
