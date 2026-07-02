---
name: scaffold-screen
description: Quick-scaffold the object layer for one surface (Page Object / API service / gRPC client / GraphQL ops / mobile screen) from a URL or a contract. Use for "scaffold a page object", "add a POM/service for <screen>", "create the client for this endpoint". For full test-cases→code use automation-generate.
---

# scaffold-screen — scaffold one object-layer file

Fast "add one screen/service" — generates the object layer (+ a minimal stub spec), not full cases.

## Input
A URL (UI/mobile-web) or a contract (REST OpenAPI · gRPC proto · GraphQL schema).

## Steps
1. **Discover** (don't invent): UI → **explore-app** / Playwright MCP for real selectors + route;
   API → read `api/rest/contracts` / `api/grpc/proto` / GraphQL schema.
2. **Generate** per the target `<module>/conventions.md`:
   - UI → `ui/page-objects/<feature>/<name>-page.ts` (`extends BasePage`, `this.actionKeyword.*`).
   - REST → `api/rest/services/<name>.service.ts` over `RestClient` + zod model in `api/rest/models`.
   - gRPC → a client wrapper in `api/grpc/clients`. GraphQL → operations + zod in `api/graphql`.
   - Mobile → `mobile/screen-objects/<name>.screen.ts` (accessibility-id).
3. Add a **minimal stub spec** in the module's `tests/` (tagged `@<surface>` + `@regression`).
4. **Anti-dup**: if it already exists (framework-context MCP), extend/reuse — don't recreate.
   Validate with `yarn aiqa:guard`.

> Object layer only. To turn test cases into full specs use **automation-generate**.
