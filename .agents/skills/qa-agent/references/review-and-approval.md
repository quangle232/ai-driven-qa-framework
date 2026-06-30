# Review table + HUMAN APPROVAL LOOP

## Source of truth
Always render the table FROM the latest JSON. Never edit the table directly —
update the JSON, re-enrich, then re-render.

## Required columns (exact order)
```
| TC ID | Feature | Sub-feature | Summary & Specific pre-condition | Test Description | Step details | Element | Pr. | Test Result | Bug ID | Notes |
```
- Markdown table; `<br>` for multiline cells; one case per row; never omit a column.
- `Pr.` ← `priority`. `Test Result` / `Bug ID` empty unless filled.
- **Step details:** compact multiline — `1. Open page<br>2. Enter email<br>3. Click submit`.
  If `element` exists, append `| element: [data-test-id="login-submit"]`.
- **Notes:** surface review signals concisely — `Priority: P0 — core flow`,
  `Duplicate: possible-overlap with TC-003`, `Question: clarify empty-password behaviour`.

## Sync target order (mirror the EXACT table)
1. `Create Test Case` Jira sub-task comment (if created) →
2. parent Jira user-story comment →
3. `docs/ai/` (note-context fallback).

Comment structure: `### QA Review Status` · `### Assumptions` · `### Open Questions` ·
`### Exact Review Table` · `### Review Guidance` (use `EDIT_TABLE`, `CHANGESET`, or `I approve`).

**Hard rule:** exactly ONE primary review table. No summary / analytics / priority-distribution /
automation-candidate / derived tables — before, after, or instead of it.

## Approval loop
Wait for one of: `EDIT_TABLE`, `CHANGESET`, direct revision comments, or the exact phrase `I approve`.
On any revision:
1. update the canonical JSON first,
2. re-run priority scoring + duplicate detection,
3. re-render the table from JSON,
4. re-sync to the same target,
5. update the JSON artifact under `docs/ai/`.

Proceed to export / code-gen / execution **only** after the exact phrase `I approve`. The JSON is
then frozen (`approvalStatus: "approved"`) and is the single input to every export.
