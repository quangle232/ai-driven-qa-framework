---
name: setup
description: Onboard this framework into a project so a user can start fast. Use for "set up", "get started", "onboard", "initialize the framework", "first-time setup". Installs deps + browsers, provisions env files, wires the auth stub, sets up optional MCPs, and runs the health check.
---

# setup — first-time onboarding

Get a new user from clone → green run as fast as possible.

## Steps
1. **Install**: `yarn install` · `npx playwright install --with-deps chromium`.
   Native mobile also needs an Appium server; perf needs the `k6` / `jmeter` binary (document, don't install).
2. **Env**: `cp environments/.env.test.example environments/.env.test` and fill `AUTH_URL`/`APP_URL`
   (+ optional `.env.jira` for the bug reporter). `test_env` picks the file (dev|test|prod, default test).
3. **Auth**: help implement `authenticate()` in `ui/helpers/authenticate-set-up.ts` (the user's SUT
   sign-in) — never type real passwords yourself; the user does.
4. **Per-surface deps** (only what's needed): API/gRPC/GraphQL/mobile/perf — confirm which surfaces
   they'll use so unused heavy deps aren't required.
5. **Optional MCPs**: offer to configure Jira / Figma / TestRail MCPs in `.mcp.json`
   (see `qa-agent/references/mcp-usage.md` guided setup) so the qa-agent can fetch stories.
6. **Health check**: `yarn aiqa:doctor`; then a smoke run: `yarn test:ui` (or a mock-backed
   `yarn test:api`). Report what's green and what still needs the user (auth, SUT URL, MCP OAuth).

## Rules
- Don't create accounts or enter credentials — surface the TODOs for the user.
- Leave the repo runnable; end with the exact next command to try.
