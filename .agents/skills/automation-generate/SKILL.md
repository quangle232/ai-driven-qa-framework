---
name: automation-generate
description: Generate automation code that follows this framework's conventions, from test cases. Use when the user asks to "generate automation", "write the spec/test for these cases", "automate these test cases", for UI / API / gRPC / GraphQL / performance. Accepts detailed step-by-step cases OR summary cases (then explore the app/contract step-by-step to understand before generating). Anti-duplication: reuse existing code.
---

# automation-generate — cases → framework-compliant code

Turn approved/provided test cases into automation code for the right surface.

## Input (either form)
- **Detailed cases** — per-case steps + element + expected → generate directly.
- **Summary cases** — high-level intent only → **EXPLORE first, then generate**:
  - UI → drive the live app with the Playwright MCP; read the real DOM for true selectors/routes.
  - API/GraphQL → read the OpenAPI contract / GraphQL schema; confirm request/response shapes.
  - gRPC → read `api/grpc/proto/`; confirm messages + status codes.
  - Performance → confirm the target flow, load profile, and SLO thresholds.
  Do NOT invent selectors / fields / endpoints — verify them first.

## Load the rules
`.agents/skills/qa-agent/references/framework-conventions.md` (+ §1a) and the target
`<module>/conventions.md`. Query the `aiqa-framework-context` MCP
(`get_existing_code_index`, `find_page_object`, `list_action_keywords`, `search_tests`).

## Generate by surface (never the transport in a spec)
- **UI** → Page Object in `ui/page-objects/…` (extends `BasePage`, `this.actionKeyword.*`) + spec in `ui/tests`.
- **API REST** → service in `api/rest/services` over `RestClient` (axios) + zod models + spec in `api/rest/tests`.
- **gRPC** → `api/grpc/clients` (deadline + metadata + `StatusCode.*`) + spec in `api/grpc/tests`.
- **GraphQL** → `api/graphql` (client + operations + zod) + spec in `api/graphql/tests`.
- **Performance** → k6 script in `performance/k6` with `thresholds` (+ JMeter if requested).
- Tag `@<surface>` + `@regression` + priority; `@jira("KEY")`; data in `*/test-data` or `*/models`.

## Anti-duplication + gate (mandatory)
- If an equivalent page/service/spec exists → **extend/reuse**, never regenerate.
- Validate every file with `yarn aiqa:guard --files <paths>` before finalising.
- Optionally run it (`yarn test:<surface>`) and hand off to **read-report**.

> This is the automation half of the qa-agent — see `qa-agent/references/framework-conventions.md`
> + `test-case-template.md`. It does NOT design new cases (use `user-story-test` / qa-agent for that).
