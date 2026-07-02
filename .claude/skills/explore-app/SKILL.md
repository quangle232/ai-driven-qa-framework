---
name: explore-app
description: Explore the live SUT with the Playwright MCP to discover real selectors, routes, and navigation, and save them to navigation memory. Use for "explore the app", "map the SUT", "find the selectors for <screen>", "build the navigation map". Feeds automation-generate so code uses verified selectors, never guesses.
---

# explore-app — discover selectors/routes → navigation memory

Map the real app so later code-gen uses **verified** selectors, not guesses.

## Steps
1. **Auth**: reuse the saved session (`.auth/`) where possible; otherwise the user signs in.
2. **Navigate + snapshot** with the Playwright MCP (`browser_navigate`, `browser_snapshot`,
   `browser_take_screenshot`, `browser_evaluate`). For each target screen read the real DOM.
3. **Extract**, per screen:
   - stable selectors in priority order `data-zcqa → data-test-id → data-id → data-title`
     (flag elements with no stable attribute → recommend adding a `data-test-id`),
   - route / URL and how to reach it (nav path),
   - key elements + states.
4. **Persist to navigation memory**: `docs/ai/navigation.md` **and** `ui/memory/memory.md`
   (`Screen | Route | How to reach it | Page Object`). Don't re-explore a screen already mapped.

## Rules
- Do NOT perform destructive actions (delete / irreversible submit) without explicit confirmation.
- Never invent selectors — if unknown, record the gap; don't fabricate.
- Read-only discovery; hand the map to **automation-generate** to build POMs/specs.
