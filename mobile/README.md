# Mobile testing layer

Two complementary mobile stacks, both on the **single Playwright Test runner**
(one report / Jira / AI-QA / CI pipeline):

| Stack | What | When | Infra |
|---|---|---|---|
| **Mobile-web** | Playwright device emulation (Pixel 7 / iPhone 14) | responsive web, PWAs | none (reuses the web stack) |
| **Mobile-native** | Appium via WebdriverIO | real iOS/Android **apps** | device/emulator + Appium server (or a cloud grid) |

## Layout

```
mobile/capabilities/index.ts        Appium capability matrix (android/ios, cloud grids)
mobile/screen-objects/*.screen.ts   native Screen Objects (mobile POM)
helper/mobile/driver-factory.ts     creates a WDIO+Appium session (per worker)
helper/mobile/mobile-action-keyword.ts  the native "ActionKeyword" (a11y-id first)
helper/mobile/test-mobile.ts        `test` with driver + mobileKeyword fixtures
tests/mobile-web/*.spec.ts          device-emulation specs (reuse the web POM)
tests/mobile/*.spec.ts              native specs (skip-gated)
```

## Parallel drivers

Parallelism comes from Playwright `workers`: each worker owns **one** Appium
session (the `driver` fixture is worker-scoped), so N workers = N concurrent
device sessions. Mobile-web runs the two device projects in parallel the same
way. Sessions are isolated per worker — no shared state.

## Run

```bash
yarn test:mobile:web      # Pixel 7 + iPhone 14 emulation (needs the SUT, like the web suite)
yarn test:mobile:native   # Appium native — sets ALLOW_MOBILE_NATIVE=1
```

Native prerequisites: a running Appium 2 server (`appium`), a device/emulator,
and the app build via `MOBILE_APP`. For a cloud grid set `DEVICE_GRID=browserstack`
(or `saucelabs`) + the vendor creds (see environments/.env.example).

The **`mobile-native` Playwright project is only registered when
`ALLOW_MOBILE_NATIVE=1`**, so an ordinary `playwright test` never loads the
WebdriverIO/Appium code or tries to start a device — the native suite can never
wedge the shared regression.

## Best principles applied

- **Object model + single keyword layer** — Screen Objects call
  `MobileActionKeyword`; specs call Screen Objects; nothing touches WDIO directly.
- **Accessibility-id-first locators** (`~id`) — the one strategy stable across
  iOS + Android and resilient to UI churn.
- **Explicit waits** — every interaction `waitForDisplayed` first; no sleeps.
- **Session isolation + parallel safety** — one session per worker, torn down after.
- **Capability matrix from env** — platform/device/app/grid never hard-coded.
- **Cloud-grid ready** — BrowserStack / Sauce Labs via `DEVICE_GRID` + creds.
- **Infra-dependent suite is skip-gated** — never blocks the shared regression.
- **Mobile-web reuses the web POM** — zero duplication for responsive checks.
