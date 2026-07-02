---
name: visual-regression
description: Add + manage Playwright visual-regression (screenshot) tests. Use for "visual regression", "screenshot test", "visual diff", "pixel/UI comparison", "toHaveScreenshot", "update baselines". Creates stable visual checks, manages baselines, and separates real UI diffs from noise.
---

# visual-regression — screenshot baselines + diffs (UI module)

Catch unintended UI changes with Playwright's built-in visual comparison. Lives in the **ui** module.

## Write the check
- `await expect(page).toHaveScreenshot('name.png', { … })` (or `toMatchSnapshot`), driven through the
  Page Object where possible. Tag the spec `@ui` + `@visual` + `@regression` + a priority.
- **Per-device baselines**: run under the mobile-web projects too (Pixel 7 / iPhone 14) — Playwright
  keys snapshots per project/OS, so baselines are separate.

## Stabilize (avoid flaky diffs → see flaky-triage)
- Disable animations (`animations: 'disabled'`), wait for fonts + network idle before snapping.
- **Mask** dynamic regions (dates, avatars, ads): `mask: [page.locator('[data-test-id="ts"]')]`.
- Set a tolerance: `maxDiffPixelRatio` / `maxDiffPixels` — small, not zero.

## Baselines
- First run / intentional UI change → update with `--update-snapshots` (review the new PNG!).
- Baselines are committed next to the spec (`*-snapshots/`); keep them small + reviewed.

## Triage a diff
- **Real, unintended** change → UI bug → **create-bug** (attach the diff image).
- **Intended** change → update the baseline. **Environment/rendering noise** → stabilize (mask/threshold),
  don't just bump tolerance blindly.

## Rules
- Don't blanket-raise thresholds to force green (that hides regressions). Never commit a baseline you
  didn't visually review. Cross-OS rendering differs — generate baselines in CI (or a fixed image).
