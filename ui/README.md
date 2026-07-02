# UI module (Playwright web)

Self-contained Playwright web-testing module. Run in isolation:

```bash
npx cross-env test_env=test playwright test -c ui/playwright.config.ts   # or: yarn test:ui
```

## Structure
```
ui/
  page-objects/   BasePage + per-screen POM classes (sample/)
  helpers/        action-keywords.ts (single keyword layer) · global-setup.ts ·
                  auth-config.ts · authenticate-set-up.ts · storage-and-cookies-helper.ts ·
                  api-support.ts  (Playwright `request` to seed/verify data for web tests)
  test-data/      inputs + expected values
  tests/          *.spec.ts (import `@core/test`, `@core/test-tags`)
  playwright.config.ts   conventions.md   memory/   README.md
```

## Key idea
`api-support.ts` is **API used to support web tests** (seed a record via API, then
assert it in the UI) — this is why the Playwright-`request` client lives in the UI
module, not in `api/` (which is Playwright-free). Shared cross-module code (env,
tags, base `test`, Jira reporter) lives in `@core/*`.
