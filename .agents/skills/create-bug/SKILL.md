---
name: create-bug
description: File a Jira Bug on-demand for a real defect. Use for "create a bug", "file a Jira bug", "report this defect", "log a bug for this failure". Confirms it's a real defect (not env/flaky), gathers evidence, dedupes against existing OPEN bugs, and links the bug to the parent user story.
---

# create-bug — on-demand Jira bug (search-first, linked)

Complements the automatic failure→bug reporter (which fires on FINAL-attempt failures);
this is the **user-triggered** path for a defect you found.

## Steps
1. **Confirm it's a real defect** — not an environment issue or a flake. If unsure, re-run
   (see **flaky-triage**); a pass-on-retry is NOT a bug. Only deterministic failures qualify.
2. **Verify UI defects with evidence** — capture a screenshot + the relevant DOM (Playwright MCP)
   before declaring a UI bug. Collect: failing test/steps, expected vs actual, error, env
   (`test_env`), browser/surface.
3. **Parent story** — get the `user_story_key` (from the spec's `@jira("KEY")` / the user).
4. **Search-first dedupe** — reuse an existing **OPEN** bug with the same summary instead of creating
   a duplicate (same behaviour as `core/jira/jira-bug-reporter.ts`). A Done/Closed bug → the new
   failure is a regression → create fresh.
5. **Create + link** the Bug to the story via the Jira MCP (or the reporter's REST path). Report the
   key + whether it was created or reused.

## Rules
- Never file a bug for a flake or an env timeout. Confirm with the user before creating on-demand.
- Don't hard-code Jira creds; use the Jira MCP / `environments/.env.jira`. If Jira is unreachable,
  write the bug draft to `docs/ai/memory.md` and tell the user to paste it (never block).
