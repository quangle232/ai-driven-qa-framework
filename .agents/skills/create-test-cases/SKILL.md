---
name: create-test-cases
description: Design reviewable test cases from a story / acceptance criteria / notes — the DESIGN half only (no code, no run). Use for "create test cases", "design test cases", "write manual cases for this AC/story", "draft test cases". Produces canonical-JSON cases + a review table and stops at human approval.
---

# create-test-cases — design cases (JSON-first) → approve

The **design half** of the qa-agent, standalone (no automation, no execution).

## Input
A Jira story key/URL, pasted acceptance criteria, or an issue note.

## Steps (follow the qa-agent references)
1. Parse AC → `AC1, AC2, …` (`qa-agent/references/ac-parsing.md`). Never invent AC.
2. Generate **manual cases into the canonical JSON** — the source of truth (`json-contract.md`).
3. Enrich: testing-strategy coverage (`testing-strategy.md`), auto priority `P0/P1/P2`
   (`priority-scoring.md`), duplicate detection (`duplicate-detection.md`).
4. Render the **exact 11-column review table** and run the **HUMAN APPROVAL LOOP**
   (`review-and-approval.md`): `EDIT_TABLE` / `CHANGESET` / exact `I approve`. JSON updates first.
5. On approval: freeze the JSON, save it under `docs/ai/` + update `docs/ai/test-case.md` and the
   target module's `memory/`.

## Then
Hand off: **publish-testcases** (Excel/Xray/TestRail) and/or **automation-generate** (code).
For the whole story→report flow instead, use **user-story-test**.

## Rules
- JSON is the source of truth; never treat the table as source. One primary review table only.
- Reuse existing cases (check `docs/ai/test-case.md`); mark each new vs existing. Don't stop the
  approval loop early.
