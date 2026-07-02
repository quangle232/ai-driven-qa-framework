# UI conventions (Playwright web)

- **POM**: one class per screen in `ui/page-objects/`, `extends BasePage`
  (gives `this.page`, `this.actionKeyword`). Group selectors in a private object.
- **Single keyword layer**: only `ui/helpers/action-keywords.ts` touches the
  Playwright API. Page objects call `this.actionKeyword.*` — never `page.locator`
  in a spec or page object. New shared keywords go INTO `ActionKeyword`.
- **Selectors**: `data-zcqa → data-test-id → data-id → data-title` (honoured by
  `ActionKeyword.healLocator`). Never invent selectors.
- **Specs** (`ui/tests`): `import { test, expect } from '@core/test'`,
  `import { TAGS, tags } from '@core/test-tags'`, `setJiraStory('KEY')` first,
  wrap blocks in `test.step`, data from `@ui/test-data/*`.
- **Auth**: one-time sign-in in `global-setup.ts`; reused via `storageState`.
- **api-support.ts**: use for API-assisted setup/teardown inside a web test only.
- Tag every spec with `@ui` + `@regression` + a priority (`@P0/@P1/@P2`).
