# Mobile conventions (Appium native + Playwright mobile-web)

- **Native**: Screen Objects (`mobile/screen-objects/`) call `MobileActionKeyword`
  (`mobile/helpers/mobile-action-keyword.ts`) — accessibility-id-first; never touch
  WebdriverIO in a spec. One Appium session per worker (parallel drivers). Native
  specs are **skip-gated** (`ALLOW_MOBILE_NATIVE=1`); capability matrix in
  `mobile/capabilities/`; cloud grid via `DEVICE_GRID`.
- **Mobile-web**: reuse the UI POM (`@ui/page-objects/*`) unchanged; the project
  sets the device viewport (`devices['Pixel 7' | 'iPhone 14']`).
- Specs import `@core/test`, `@core/test-tags`; tag `@mobile` (+ `@mobile-web` /
  `@mobile-native`) + `@regression` + a priority.
- File names: `*.mobile-web.spec.ts` (emulation) vs `*.native.spec.ts` (Appium) —
  the config routes each to the right project.
