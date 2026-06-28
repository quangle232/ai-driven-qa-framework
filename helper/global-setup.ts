import { FullConfig } from '@playwright/test';
import fs from 'fs';
import dotenv from 'dotenv';
import authenticateSetup from './authenticate-set-up';
import { APP_STORAGE_STATE } from './auth-config';

function parseRefreshFlag(): boolean {
    const value = process.env.refresh;

    // Default behavior when not provided
    if (!value) return false;

    if (value === 'yes') return true;
    if (value === 'no') return false;

    throw new Error(
        `Invalid value for "refresh". Only "yes" or "no" are allowed. Received: "${value}"`
    );
}

/**
 * Global setup: load the selected environment, then make sure an authenticated
 * the SUT storage state exists before any test runs.
 *
 * - `refresh=yes`         -> always re-authenticate.
 * - storage state missing -> authenticate once.
 * - otherwise             -> reuse the existing storage state.
 */
async function globalSetup(config: FullConfig): Promise<void> {
    // Handle environment config
    if (process.env.test_env) {
        dotenv.config({
            path: `./environments/.env.${process.env.test_env}`,
            override: true,
        });
    }

    const appUrl = process.env.APP_URL ?? process.env.URL;
    if (!appUrl) throw new Error('Missing ENV: APP_URL');
    process.env.APP_URL = appUrl;

    const shouldRefresh = parseRefreshFlag();
    const stateMissing = !fs.existsSync(APP_STORAGE_STATE);

    if (shouldRefresh || stateMissing) {
        console.log(
            shouldRefresh
                ? '[globalSetup] refresh=yes -> regenerating the SUT storage state...'
                : '[globalSetup] No storage state found -> generating it now...'
        );
        await authenticateSetup(config);
    } else {
        console.log('[globalSetup] Reusing the existing SUT storage state.');
    }
}

export default globalSetup;
