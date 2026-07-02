---
name: mcp-setup
description: Connect the MCP servers the qa-agent depends on. Use for "set up MCP", "connect Jira/Figma/TestRail MCP", "MCP not reachable", "configure .mcp.json". Guides the user to add + authorize Jira (Atlassian), Figma, Playwright, and TestRail MCPs, plus the 4 built-in aiqa-* servers.
---

# mcp-setup — connect + authorize MCP servers

Front-ends the guided setup in `.claude/skills/qa-agent/references/mcp-usage.md`.
Agent writes `.mcp.json` entries (with confirmation); the **user** approves via `/mcp`
and completes any OAuth — the agent cannot sign in. A new server only loads after approval.

## Servers
- **Jira (Atlassian)** — story fetch + sub-tasks. Add:
  ```json
  "atlassian": { "type": "sse", "url": "https://mcp.atlassian.com/v1/sse" }
  ```
  Then `/mcp` → approve → OAuth. (Xray tests are Jira issues — same server.)
- **Playwright** — live DOM exploration (used by explore-app / automation-generate):
  ```json
  "playwright": { "command": "npx", "args": ["@playwright/mcp@latest"] }
  ```
- **Figma** — design context (Dev Mode MCP; open the Figma desktop Dev Mode server):
  ```json
  "figma": { "type": "sse", "url": "http://127.0.0.1:3845/sse" }
  ```
- **TestRail** — no official MCP; use a community/custom TestRail MCP + env
  (`TESTRAIL_URL`/`TESTRAIL_USER`/`TESTRAIL_API_KEY`), else fall back to its REST API.
- **Built-in aiqa-\*** (already in `.mcp.json`): `aiqa-qa-report`, `aiqa-framework-context`,
  `aiqa-memory`, `aiqa-test-runner` — read-only; approve once via `/mcp`.

## Steps
1. Ask which servers to connect. 2. Read `.mcp.json`, add the chosen entries next to the
   `aiqa-*` servers (keep the rest), confirm before writing. 3. Tell the user to run `/mcp`,
   approve each, and finish OAuth. 4. Verify (e.g. fetch a story / snapshot a page); if still
   unreachable, keep the note-context fallback and record the gap in `docs/ai/`.

## Rules
- Never put real tokens in `.mcp.json` (use OAuth / env / a credential store). Never fail the
  workflow on MCP absence — degrade gracefully (`mcp-usage.md`).
