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
- **CRUD / test data lifecycle**: if the test only NEEDS data (search/edit/list),
  create the precondition **via API** (`ui/helpers/api-support.ts`), not the UI, then
  exercise the UI. If the test IS the UI create, drive the UI and capture the new id.
  EITHER way, track every created id and delete it **via API** in `afterEach` (runs on
  failure too; tolerate 404) — leave the SUT clean. Full rule + skeleton:
  `framework-conventions.md` §12; build payloads with the `data-factory` skill.
- Tag every spec with `@ui` + `@regression` + a priority (`@P0/@P1/@P2`).
