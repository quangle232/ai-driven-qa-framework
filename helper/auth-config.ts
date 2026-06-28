import path from 'path';

/**
 * Absolute path to the saved browser storage state (cookies + localStorage)
 * produced by `helper/authenticate-set-up.ts` and reused by every test via
 * `use.storageState` in `playwright.config.ts`.
 *
 * Resolved from the process CWD (the repo root when `playwright test` runs)
 * so the config and global-setup agree on the same absolute path.
 */
export const APP_STORAGE_STATE = path.resolve(
    process.cwd(),
    '.auth/storage-state.json',
);
