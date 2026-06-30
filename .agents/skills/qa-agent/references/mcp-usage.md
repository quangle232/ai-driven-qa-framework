# MCP Usage & Fallback Rules

Three MCP integrations support the workflow. Each MUST degrade gracefully —
**never hard-fail the workflow** because an MCP is missing or errors. Always log
what was skipped and surface it in the Phase 5 review.

---

## Jira MCP — requirements (Phase 1)
- Use the Jira MCP tools available in the session to fetch the issue by
  `user_story_key`.
- Extract: `title`, `description`, acceptance criteria, **labels**, **status**,
  and any attachment / link (e.g. a Figma URL).
- The Jira label(s) become the feature tag value(s) — `tag == label`.

### If the Jira MCP is UNREACHABLE — guided recovery (do this BEFORE the paste fallback)
"Unreachable" = no Jira/Atlassian MCP tools in the session, connection/auth error,
or the story can't be fetched. Don't silently drop to paste mode — try to connect it:

1. **Warn the user clearly.** e.g.
   `⚠️ Jira MCP is not reachable — I can't fetch <user_story_key>. Let's connect it first.`
2. **Guide setup.** The agent uses the Atlassian (Jira) MCP. Easiest is the official
   Atlassian **remote** MCP. Add a server to `.mcp.json` → `mcpServers`:
   ```json
   "atlassian": { "type": "sse", "url": "https://mcp.atlassian.com/v1/sse" }
   ```
   (CLI equivalent: `claude mcp add --transport sse atlassian https://mcp.atlassian.com/v1/sse`.)
3. **Config it for the user.** Offer to write that entry yourself: read `.mcp.json`, add the
   `atlassian` server next to the `aiqa-*` servers (keep the rest intact), and save. **Confirm
   before writing** — `.mcp.json` is a config file.
4. **Authenticate + load.** Tell the user to run **`/mcp`** in Claude Code, approve the `atlassian`
   server, and complete the Atlassian **OAuth** sign-in (browser flow — only the user can do this).
   A newly added MCP only becomes available after approval / a session reload.
5. **Re-run + re-fetch.** Ask the user to re-run the qa-agent (or just retry Phase 1). On the retry,
   attempt the fetch again and confirm whether `<user_story_key>` is now reachable. If yes →
   continue the workflow with the live Jira data.
6. **Still unreachable or setup declined →** fall back: ask the user to paste the AC (+ the intended
   label), log `Jira: skipped — <reason>` in `docs/ai/memory.md` "Known gaps", and continue without
   blocking.

Never block the workflow — but always attempt the guided recovery before the paste fallback.

## Figma MCP — design / elements (Phase 1)
- Only when the Jira description contains a Figma link.
- Use the Figma MCP to extract sections, element labels, states and any
  declared component names or selectors.

**Fallback** — Figma MCP missing / link absent / access fails:
- Skip UI extraction. Do NOT fabricate UI structure or selectors.
- Recommend adding `data-test-id` to the relevant elements.
- Log `Figma: skipped — <reason>`.

## Playwright MCP — live exploration + run (Phases 3–5)
Tools (prefix `mcp__playwright__`): `browser_navigate`, `browser_snapshot`,
`browser_click`, `browser_type`, `browser_fill_form`, `browser_evaluate`,
`browser_console_messages`, `browser_network_requests`, `browser_take_screenshot`.

- **Phase 3 — exploration:** navigate the live app, snapshot screens, and read
  the real DOM to discover true selectors, routes and navigation. Prefer
  `data-test-id` → `data-id` → `data-title`. Record new routes in
  `docs/ai/navigation.md`; do not re-explore a screen already mapped there.
- **Phase 4 / 5 — run:** drive or confirm the generated flows.
- Reuse the saved auth session where possible. Do NOT perform a destructive
  action (delete, irreversible submit) without explicit human confirmation.

**Fallback** — Playwright MCP unavailable:
- Generate code from Figma + existing page objects + `navigation.md` only.
- Mark every selector that still needs live verification in
  `docs/ai/memory.md` "Known gaps".
- Ask the user to run the spec locally:
  `npx cross-env test_env=test playwright test -c config/playwright.config.ts --grep <tag>`.
- Log `Playwright MCP: skipped — <reason>`.

---

## General rule
Partial completion is allowed. Whenever a fallback is taken, log it, continue
the workflow, and report it in the Phase 5 review so the human reviewer can
decide how to fill the gap.
