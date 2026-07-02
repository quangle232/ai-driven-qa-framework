# Test Case Template & Coverage Rules

## Test case fields
Every generated test case (manual or automation) uses these fields:

| Field | Notes |
|-------|-------|
| `id` | `TC-<FEATURE>-<NNN>`, e.g. `TC-SR-001` |
| `title` | Concise scenario name |
| `userStoryKey` | Jira key, e.g. `EAST-123` |
| `type` | `Manual` or `Automation` |
| `priority` | `@P0` / `@P1` / `@P2` |
| `tags` | Feature tag(s); value == Jira label(s) |
| `preconditions` | State required before the steps run |
| `steps` | Numbered, one action per step |
| `expectedResult` | Observable expected outcome |
| `automatable` | `Y` or `N` |
| `status` | `Draft` / `Generated` / `Reviewed` / `Passed` / `Failed` |
| `acIds` | Mapped AC ids, e.g. `["AC1"]` |
| `specFile` | Path to the generated spec (Automation cases, once generated) |

## Markdown table form (used in the Phase 5 review)
| ID | Title | Type | Pr. | Tags | Preconditions | Steps | Expected Result | Automatable | Status |
|----|-------|------|-----|------|---------------|-------|-----------------|-------------|--------|

- Multiline cell content uses `<br>`.
- One test case per row.
- This is also the row format of the `docs/ai/test-case.md` catalogue.

## JSON form (machine-readable)
```json
{
  "id": "TC-SR-001",
  "title": "Log a service request with valid data",
  "userStoryKey": "EAST-123",
  "type": "Automation",
  "priority": "@P0",
  "tags": ["@service-request"],
  "preconditions": "Logged in to the SUT",
  "steps": [
    "Open the service request form",
    "Select request type and priority, enter description, pick a contact",
    "Submit"
  ],
  "expectedResult": "A reference number is generated and the request is saved",
  "automatable": "Y",
  "status": "Generated",
  "acIds": ["AC1"],
  "specFile": "ui/tests/service-request.spec.ts"
}
```

## Coverage rules (testing strategy)
- Per AC: generate at least **1 happy-path** and **1 negative** case.
- Add **edge / boundary**, **validation**, **security** and **data** cases where
  they are meaningful for the feature — minimal but sufficient.
- Ordering: happy path → UI sanity → validation → negative → edge / boundary →
  exploratory / adhoc.
- Map every case to at least one AC when possible.
- Do not invent AC. If AC is missing, generate with stated assumptions and add
  an open question.
- Avoid duplicate coverage — cross-check `docs/ai/test-case.md` first and reuse
  an equivalent existing case instead of creating a near-duplicate.

## Priority rules
- **@P0** — core business path; auth / authorization; payment / sign-off;
  destructive or irreversible action; data integrity risk; security-sensitive
  behavior; system-blocking regression risk.
- **@P1** — important business validations; common alternate flows; common
  negative scenarios; high-frequency user actions.
- **@P2** — lower-risk edge cases; cosmetic or secondary behavior; rare
  combinations; exploratory coverage without clear production criticality.
- Do not mark everything @P0. Prefer business impact over UI complexity. When
  uncertain and the impact is user-blocking, choose the higher priority.

## Automatable decision (Y / N)
- `Y` — the flow is deterministic, has stable selectors, and needs no human
  judgement.
- `N` — exploratory, visual/UX-subjective, or needing data or steps not
  reachable through the UI or API.
- `N` cases stay in `test-case.md` as Manual — they are catalogued, not dropped.
