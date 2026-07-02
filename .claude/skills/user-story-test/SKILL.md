---
name: user-story-test
description: Entry point for testing a Jira user story end-to-end. Use when the user gives a Jira story KEY (e.g. EAST-123) or a Jira URL and wants the full QA flow — design test cases → human approval → publish to test management → generate + run automation → report. Trigger phrases: "test this story", "qa EAST-123", "run the qa agent on <link>", "user story test".
---

# user-story-test — full QA workflow from a Jira story

Thin entry point that runs the **qa-agent** workflow for one user story.

## Input
A Jira story **key** (`EAST-123`) or a **URL** (`https://…/browse/EAST-123` — extract the key).

## What to do
1. Normalise the input to a `user_story_key`.
2. **Load and follow `.claude/skills/qa-agent/SKILL.md`** — run its full workflow verbatim:
   parse AC → canonical-JSON manual cases → enrich (strategy + priority + duplicate) →
   review table + **HUMAN APPROVAL LOOP** → publish (Excel / Xray / TestRail) →
   generate Playwright automation (anti-duplication, per-module conventions) →
   execute new + related → update statuses → HTML report → Jira sub-tasks.
3. If the Jira MCP is unreachable, run the **guided recovery** in
   `qa-agent/references/mcp-usage.md` before any paste fallback.

## Hard rules (inherited from qa-agent)
- Never skip the human approval loop (`I approve`). JSON is the source of truth.
- Anti-duplication: reuse existing cases / page objects / services / specs.
- Respect the status gate (automation runs only when `READY FOR QA`).

> This skill delegates; the real workflow, references, and scripts live in `qa-agent/`.
