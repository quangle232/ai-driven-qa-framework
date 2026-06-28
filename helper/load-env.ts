/**
 * Single source of truth for "which env file do we load?".
 *
 * Selection is driven by `process.env.test_env`:
 *   cross-env test_env=prod  → loads environments/.env.prod
 *   cross-env test_env=dev   → loads environments/.env.dev
 *   (unset)                  → loads environments/.env.<DEFAULT_ENV>
 *
 * Used by both config/playwright.config.ts and helper/global-setup.ts so the
 * resolution logic is never duplicated. Real `.env.<env>` files are gitignored;
 * commit only the `*.example` templates.
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

export const KNOWN_ENVS = ["dev", "test", "prod"] as const;
export type TestEnv = (typeof KNOWN_ENVS)[number];

/** Default when `test_env` is not provided. Never `prod` (avoid accidents). */
export const DEFAULT_ENV: TestEnv = "test";

/** Normalise `test_env` → an env name. Warns (never throws) on an unknown value. */
export function resolveTestEnv(value: string | undefined = process.env.test_env): string {
    const env = (value ?? "").trim().toLowerCase() || DEFAULT_ENV;
    if (!(KNOWN_ENVS as readonly string[]).includes(env)) {
        console.warn(
            `[env] test_env="${env}" is not one of ${KNOWN_ENVS.join("/")}; ` +
                `will load environments/.env.${env} if it exists.`,
        );
    }
    return env;
}

/** Absolute path to the env file for the selected (or given) env. */
export function envFilePath(env: string = resolveTestEnv()): string {
    return path.resolve(process.cwd(), "environments", `.env.${env}`);
}

/**
 * Load `environments/.env.<test_env>` into process.env (override). Returns the
 * resolved env name. Missing file only warns — so mock-only suites (api/grpc)
 * still run without an env file present.
 */
export function loadEnvFile(): string {
    const env = resolveTestEnv();
    const file = envFilePath(env);
    if (fs.existsSync(file)) {
        dotenv.config({ path: file, override: true });
    } else {
        console.warn(
            `[env] ${file} not found — copy environments/.env.${env}.example to it ` +
                `(or set test_env to dev/test/prod). Continuing with current process.env.`,
        );
    }
    return env;
}
