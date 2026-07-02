# Framework Conventions — ai-driven-qa-framework

Generated code MUST match these conventions exactly. They are derived from the
live framework — read the referenced source files before generating code.

## 1. Project structure
```
core/          shared: env, test-tags, base test (Jira-bug fixture), jira reporter — via @core/*
ui/            Playwright web — ui/page-objects/ helpers/(action-keywords) tests/ ui/test-data/ (ui/conventions.md)
api/rest/      REST (axios) — clients/ services/ models/(zod) mock/ (api/conventions.md)
api/grpc/      gRPC — proto/ clients/ mock/ models/
api/graphql/   GraphQL — client.ts operations.ts models/ mock/
mobile/        Appium native + Playwright mobile-web — screen-objects/ helpers/ tests/
performance/   k6 + JMeter load tests
config/        playwright.base.ts + root config; each module has <module>/playwright.config.ts
environments/  .env.dev / .env.test / .env.prod (selected at runtime via test_env)
ci/            Sample CI pipelines (see ci/README.md)
docs/ai/       qa-agent tracking; each module also has memory/

Imports use path aliases: @core/* @ui/* @api/* @mobile/* (tsconfig paths).
```

## 1a. Per-module conventions & memory — READ FIRST for the target surface
Every surface is a self-contained module with its OWN `conventions.md`, `memory/`,
`helpers/`, `README.md`, and `playwright.config.ts`. Before generating for a
surface, READ that module's `conventions.md` and load its `memory/` (plus the
cross-story `docs/ai/`):
- UI → `ui/conventions.md` · `ui/memory/`
- API → `api/conventions.md` (+ `api/rest|grpc|graphql/README.md`) · `api/memory/`
- Mobile → `mobile/conventions.md` · `mobile/memory/`
- Performance → `performance/conventions.md` · `performance/memory/`
- Shared spine (env · tags · base `test` · jira reporter) → `core/` (`core/README.md`) —
  imported via `@core/*`; NEVER generate into it (patch-guarded).

The sections below are the framework-wide defaults; a module's `conventions.md`
refines them for that surface.

## 2. Page Object Model
- One class per screen, file `ui/page-objects/<name>-page.ts`.
- Every page object `extends BasePage` — this gives `this.page` and
  `this.actionKeyword` (see `ui/page-objects/base-page.ts`).
- Group locators in `private readonly` objects near the top. Two patterns are
  in use:
  - `fields` — the SUT field `data-id` values (the bare id string, no selector
    syntax; the method wraps it as `[data-id="..."]`).
  - `locators` — full CSS / XPath selector strings.
- Methods are page actions or getters; they call `this.actionKeyword.*` only —
  never the Playwright API directly.
- Provide a one-call orchestration method when a screen has a complete flow
  (see `CreateCasePage.createComplaintCase`).

Skeleton:
```ts
import { BasePage } from '../base-page';
import { SomeInput } from '../../ui/test-data/some-data';

/**
 * SomePage - <screen description>.
 * <Verified-against-live notes, e.g. which data-id attributes are stable.>
 */
export class SomePage extends BasePage {

    /** Verified test-only attributes of the form fields. */
    private readonly locators = {
        someField: '[data-test-id="some-field"]',
        submitButton: 'button[type="submit"]',
    };

    async fillForm(input: SomeInput) {
        await this.actionKeyword.waitAndFill(this.locators.someField, input.someField);
    }

    async submit() {
        await this.actionKeyword.waitAndClick(this.locators.submitButton);
    }
}
```

## 3. ActionKeyword — the single keyword layer
- `ui/helpers/action-keywords.ts` is the ONLY place that calls the Playwright API
  (`page.locator`, `click`, `fill`, `expect`, …).
- In page objects, NEVER call `page.locator` directly. Use the wrappers:
  `waitAndClick`, `waitAndFill`, `waitAndGetText`, `waitAndGetValue`,
  `getElement`, `getElements`, `verifyElementVisible`, `verifyTextContent`,
  `healLocator`, `friendlyWait`, `getElementText`, …
- New SHARED keywords (reusable across pages) go INTO the existing
  `ActionKeyword` class — do not create a new keyword file or class.
- App-specific keywords (e.g. a custom widget selector helper) live on the
  same `ActionKeyword` — add them per project as you encounter the pattern.

## 4. Selectors
- Priority: `data-zcqa` → `data-test-id` → `data-id` → `data-title` → `id`
  → role + text. (`ActionKeyword.healLocator` honours this priority.)
- Discover real selectors with the Playwright MCP against the live app. Do not
  invent selectors. If an element has no stable attribute, record it in
  `docs/ai/memory.md` "Known gaps" rather than guessing a brittle selector.

## 5. Async values (SPA timing)
- Many SPAs paint inputs and labels BEFORE populating them, so reading a value
  right after the element is visible is flaky.
- Use `ActionKeyword.getElementText(...)` — it polls for a non-empty value via
  the private `waitForNonEmptyValue` helper.
- A new getter that reads an asynchronously-populated value MUST follow the
  same poll-until-non-empty pattern. For values that only render after a
  reload (server-side automation), use `verifyElementVisibleWithReload`.

## 6. Tags & the Jira label link
- `core/test-tags.ts` exports the `TAGS` map and the `tags(...)` helper.
- A test declares its tags as the second argument:
  `tags(TAGS.REGRESSION, TAGS.SMOKE, TAGS.AUTH, TAGS.P0)`.
- Tag categories: type (`@regression`, `@smoke`), priority (`@P0`/`@P1`/`@P2`),
  feature (project-specific, e.g. `@auth`, `@checkout`), and `@bugs`.
- HARD LINK: the feature tag value MUST equal the Jira label value. Jira label
  `auth` → tag `@auth`. This lets the Jenkins regression job and `--grep`
  select the test by the same value used in Jira.
- If a needed feature tag is missing, add it to the `TAGS` map (kebab-case,
  `@`-prefixed) — keep every tag in this one file.

## 7. Spec conventions
- Location: `ui/tests/<feature>.spec.ts`, kebab-case file name. Generated
  specs go here so the Jenkins job (`TEST_FOLDER=sample`) picks them up.
- Imports: `import { test, expect } from '@playwright/test';` and
  `import { TAGS, tags } from '../../core/test-tags';`.
- No per-test login — authentication runs once in `global-setup` and the session
  is reused via `use.storageState`. Start the test by opening the app with that
  saved session (e.g. `loginPage.openDeskApp()`).
- Wrap each logical block in `await test.step('...', async () => { ... })`.
- For multi-assertion verification chains, use `expect.soft` so the whole chain
  is validated in one run instead of stopping at the first mismatch.
- A file-top JSDoc block explains the scenario and which AC it covers.

## 8. Test data
- Inputs and expected values live in `ui/test-data/` modules, not inline in specs.
- A generated spec imports its data from `ui/test-data/<feature>-data.ts`.

## 9. Comments
- All code comments in English — concise, explaining "why", not "what".

## 10. Running
- Local: `yarn test:test` (see `package.json` scripts).
- Tag slice:
  `npx cross-env test_env=test playwright test -c config/playwright.config.ts --grep @service-request`
- Exclude known defects: add `--grep-invert @bugs`.

## 11. Scripts vs framework code — file types
- **Test framework code** — page objects, helpers, specs, test-data — is
  **TypeScript (`.ts`)**. It is run by Playwright, which compiles TS itself;
  the repo has no general-purpose TS runner.
- **Standalone Node scripts** — anything run directly with `node` (CI helpers,
  the qa-agent `scripts/`) — is **JavaScript (`.js`), ESM**. `package.json` sets
  `"type": "module"`, so a plain `.js` file is ALREADY an ES module: use
  `import` (not `require`), and do NOT use the `.mjs` extension. Precedent:
  `ci/jenkins/scripts/collect-playwright-stats.js`.
- Do not write a `.ts` script meant to be run with bare `node` — without a TS
  runner (`tsx` / `ts-node`) it will not execute. Keep generated skill scripts
  as `.js`.

## Multi-surface testing layers (API · gRPC · mobile)

Beyond UI, the framework tests REST, gRPC, and mobile — all on the SAME
Playwright runner, each mirroring POM's "object model + single keyword layer":

- **API** (`api/rest/tests`, import `api/rest/helpers/test-api`): call `api/services/*`
  (Service-Object Model), never the raw client. `api/clients/api-client.ts` is the
  only HTTP layer; validate responses with the `zod` models in `api/models`.
  Mocks: MSW (node-`fetch` specs) + the Express server (Playwright-`request` specs).
- **gRPC** (`api/grpc/tests`, import `api/grpc/helpers/test-grpc`): call `api/grpc/clients/*`,
  set a deadline on every call, assert gRPC STATUS CODES (not just payloads),
  auth via metadata. The mock implements `api/grpc/proto`.
- **Mobile**: native (`mobile/tests`, import `mobile/helpers/test-mobile`) uses
  Screen Objects + `MobileActionKeyword` (accessibility-id-first) and is
  skip-gated; mobile-web (`mobile/tests`) reuses the web POM.

Tags: `@api` / `@grpc` / `@mobile` (+ `@mobile-web` / `@mobile-native`) on top of
`@regression`. Do NOT generate into `api/contracts/` or `api/grpc/proto/` (contracts
are source-of-truth and patch-guarded). Full rules: `api/README.md`,
`grpc/README.md`, `mobile/README.md`.
