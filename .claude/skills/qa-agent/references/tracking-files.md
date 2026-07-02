# Tracking Files — docs/ai/

Three files in `docs/ai/` carry context across qa-agent runs. **Read them in
Phase 0; update them in Phase 6** (after every generation and every run).

Purpose: never regenerate code or flows that already exist — reuse or re-run
them instead. If a file is missing, create it from the matching file in
`../examples/`.

---

## docs/ai/memory.md
What has been done. Sections:
- **## Generated work** — table: `Date | User story | Feature | Tag / Jira label
  | Artifacts` (spec + page objects + test-data files).
- **## Decisions** — notable choices, conventions clarified, reuse decisions,
  deliberate deviations.
- **## Known gaps** — missing `data-test-id`s, brittle selectors, manual-only
  areas, MCP steps that were skipped via fallback.
- **## Run history** — table: `Date | Tag run | Result`.

Use this to answer "does code for this flow already exist?" before generating.

## docs/ai/test-case.md
The catalogue of ALL test cases (manual + automation), one row per case, using
the row format and fields from `test-case-template.md`. Includes `Status` and
`Spec File`, and a "Detailed steps" section below the table.

Before generating a case, check here for an equivalent — reuse, do not duplicate.

## docs/ai/navigation.md
The app navigation map: `Screen | Route / URL | How to reach it | Page Object`.
Reused so a known screen is not re-explored with the Playwright MCP.

---

## Per-module memory — `<module>/memory/`
Each surface module keeps memory next to its code — `ui/memory/`, `api/memory/`,
`mobile/memory/`, `performance/memory/` (each a `memory.md`: navigation /
known-issues / flaky / glossary for that surface). **Load the target module's
`memory/` in Phase 0** alongside `docs/ai/`, and **update it** after generating or
running for that surface. Split of duty: `docs/ai/` = cross-story tracking
(what was done, catalogue, run history); `<module>/memory/` = surface-local
knowledge (that module's screens, quirks, terms). Read both before generating so
you reuse — never regenerate — what already exists.

---

## Update rules
- After **Phase 2** (cases generated): update `test-case.md`.
- After **Phase 3** (code generated): update `memory.md` (Generated work,
  Decisions, Known gaps) and `navigation.md` (any new screen/route).
- After **Phase 4 / 5** (run): update each case `Status` in `test-case.md`
  (`Passed` / `Failed`) and append a row to `memory.md` "Run history".
- Append new rows; update an existing `Status` or row in place when it changes.
- Convert relative dates to absolute (`YYYY-MM-DD`).
- These files are committed alongside the generated tests.
