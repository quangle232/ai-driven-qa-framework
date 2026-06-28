import { FullConfig, chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { APP_STORAGE_STATE } from './auth-config';

function ensureDir(filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

/**
 * One-time authentication for the suite. Runs once per build via
 * `helper/global-setup.ts`. Tests reuse the saved storage state through
 * `use.storageState` in playwright.config.ts and therefore start already
 * logged in (no per-test login → no rate-limit issues on the SUT).
 *
 * Headless by default. Flip to headed ONLY for demos / when the SUT prompts
 * for 2FA / OTP that must be completed manually.
 *
 * TODO (per project): fill in the LOGIN STEPS below. The function MUST:
 *   1. Navigate to the sign-in page.
 *   2. Submit credentials.
 *   3. Wait until the post-login landing page is loaded.
 *   4. Save `context.storageState({ path: APP_STORAGE_STATE })`.
 */
export default async function authenticateSetup(_config?: FullConfig): Promise<void> {
    console.log('[authSetup] Launching browser to authenticate with the SUT...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // ───────────────────────────────────────────────────────────────
        // TODO — replace this block with your app's login flow. Example:
        //
        //   await page.goto(process.env.AUTH_URL!);
        //   await page.fill('[name="email"]',    process.env.APP_USER!);
        //   await page.fill('[name="password"]', process.env.APP_PASS!);
        //   await page.click('button[type="submit"]');
        //   await page.waitForURL(`${process.env.APP_URL}/**`);
        //
        // If the SUT uses SSO / OAuth, drive the redirect flow here.
        // If it needs 2FA / OTP, switch to `{ headless: false }` above so
        // the prompt can be completed manually before saving the state.
        // ───────────────────────────────────────────────────────────────

        ensureDir(APP_STORAGE_STATE);
        await context.storageState({ path: APP_STORAGE_STATE });
        console.log(`[authSetup] Storage state saved -> ${APP_STORAGE_STATE}`);
    } finally {
        await context.close();
        await browser.close();
    }
}
