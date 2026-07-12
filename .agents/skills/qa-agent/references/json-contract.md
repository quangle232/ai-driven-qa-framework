# Canonical test-case JSON — the source of truth

JSON is the single source of truth across the whole review cycle. The review
table and every export (Excel / Xray / TestRail) are rendered FROM this JSON.
Never treat the table as the source; every edit updates the JSON first.

## Structure
```json
{
  "schemaVersion": "aiqa.qa.testcases.v1",
  "meta": {
    "feature": "",
    "userStoryKey": "",
    "figmaDesignLink": "",
    "generatedAt": "",
    "testMgmt": "excel",            // excel | xray | testrail
    "approvalRequired": true,
    "approvalStatus": "draft"        // draft | revised | awaiting-approval | approved
  },
  "testCases": [],
  "assumptions": [],
  "openQuestions": []
}
```

## Test-case fields
- `tcId` · `feature` · `subFeature`
- `summaryPrecondition` · `testDescription`
- `stepDetails`: `[{ "step": 1, "detail": "Open page", "element": "" }]`
- `priority` (P0/P1/P2) · `priorityReason`
- `duplicateStatus` (none | duplicate | possible-overlap) · `duplicateOf` · `duplicateReason`
- `acIds`: `["AC1"]`
- **`automatable`** (Y/N) · **`coverageType`** (happy | negative | edge — drives the Phase 2 coverage matrix) · **`surface`** (ui | api | grpc | mobile)
- `tags`: feature tag(s) == Jira label(s) (drives `--grep`/CI)
- `testResult` (empty until executed) · `bugId` · `notes`
- `specFile`: filled once the case is automated (Phase 6) — used for anti-duplication

## Rules
- Element selector priority: `data-zcqa → data-test-id → data-id → data-title`; empty string if
  unknown (recommend adding a `data-test-id`) — never fabricate selectors.
- Every case maps to ≥1 AC when possible (`acIds`).
- Keep cases automation-ready (clear, one action + element per step).
