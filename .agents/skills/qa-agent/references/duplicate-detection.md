# Duplicate detection (cases) + anti-duplication (code-gen)

## A. Case-level dedupe (Phase 3)
Reduce duplicate / near-duplicate cases BEFORE approval.

- **Exact duplicate** — same feature + sub-feature + intent + precondition + expected behaviour.
  Mark `duplicateStatus: "duplicate"` + `duplicateOf` → suggest removal in the review.
- **Near duplicate** — same AC mapping + same validation intent, only wording differs, or a narrow
  variation with no real coverage gain. Mark `duplicateStatus: "possible-overlap"` for human review.
- **Keep both only if** they differ by: platform · role/permission · meaningful data boundary ·
  API-vs-UI layer · business outcome.
- Never auto-delete — preserve traceability (`duplicateReason`) in the approval loop.
- Signals: normalized `summaryPrecondition` / `testDescription`, mapped `acIds`, step intent,
  expected-result intent.

## B. Anti-duplication for code generation (Phase 6) — MANDATORY
Before generating any spec / page object / service / screen:
1. Run `node .agents/skills/qa-agent/scripts/find-related-tests.js <tag>` and query the
   `aiqa-framework-context` MCP (`get_existing_code_index`, `find_page_object`, `search_tests`).
2. Check `docs/ai/test-case.md` + each case's `specFile` field in the JSON.
3. If a page object / spec / case **already exists**: EXTEND or REUSE it — never regenerate.
   Cite the reused artifact in the JSON `notes` and the Jira sub-task.
4. New shared keywords go INTO the existing `ActionKeyword` (or the surface's keyword layer),
   not a new duplicate class.
5. `yarn aiqa:guard` is the final gate — it rejects writes that duplicate or violate conventions.
