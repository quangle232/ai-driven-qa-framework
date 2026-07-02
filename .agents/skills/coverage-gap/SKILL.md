---
name: coverage-gap
description: Analyze test coverage and surface the gaps. Use for "coverage gap", "what's not tested", "coverage map", "which AC are covered", "test coverage report". Maps existing specs/cases against Jira AC + labels and lists uncovered AC, untagged specs, surfaces without tests, and P0 areas missing coverage.
---

# coverage-gap — coverage map + gaps

Read-only analysis of what IS vs ISN'T covered, with next actions.

## Inputs
- `aiqa-framework-context` MCP → `get_existing_code_index` (specs, tags, page objects, features)
  and `search_tests`.
- `docs/ai/test-case.md` (case catalogue) + module `memory/`.
- Jira MCP (optional) → the story's acceptance criteria + labels (`@tag == label`).

## Produce
1. **Coverage map** — AC / feature (label) → specs + cases that cover it (by `@tag` / `acIds`).
2. **Gaps**, ranked:
   - AC with **no** covering case/spec,
   - Jira labels with no matching `@tag` spec,
   - **surfaces** with no tests (ui / api / grpc / graphql / mobile / performance),
   - **P0** areas with no coverage; manual-only cases not yet automated,
   - specs missing `@regression` / a priority / `@jira`.
3. **Recommendations** — the next cases to add (hand to **create-test-cases**) and which to
   automate (hand to **automation-generate**).

## Rules
- Read-only; don't generate code/cases here — recommend and delegate.
- Base coverage on `@tag == Jira label` + `acIds`; call out where that link is missing (untraceable).
- Keep the map scannable; put detail in a table.
