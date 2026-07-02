---
name: fix-test
description: Repair a failing test when the TEST (not the product) is at fault. Use for "fix this test", "the spec is broken", "update the selector/wait", "repair the failing test". Diagnoses test-side breakage and proposes a convention-compliant fix — never weakens assertions, skips, or auto-heals until green.
---

# fix-test — convention-compliant repair of a broken test

For failures caused by the **test**, not the product (broken selector, missing/hard wait,
stale data/setup, timing). If it's a product defect → **create-bug**; if intermittent →
**flaky-triage**.

## Diagnose
Read the failure (`read-report` / trace / error). Classify the test-side cause:
selector drift · implicit/hard wait · data setup/teardown · order-dependence · wrong expectation.

## Fix (through the keyword layer, per conventions)
- **Selector** → use the priority order `data-zcqa → data-test-id → data-id → data-title`; if the
  element has no stable attribute, record the gap + recommend adding a `data-test-id` (don't invent one).
- **Wait** → replace `waitForTimeout`/sleep with an `ActionKeyword` explicit wait / `getElementText`
  poll. **API/gRPC** → fix `expectedStatus` / schema, not the assertion.
- **Data** → fix setup/teardown so the case is isolated + leaves the SUT clean.

## Hard rules (forbidden)
- NEVER weaken/delete an assertion, `test.skip` failing logic, or loop-retry until it passes.
- NEVER change the expected result to match a wrong actual without human/spec approval.
- Validate with `yarn aiqa:guard --files <spec>`, re-run once, then hand to **review-code**.
