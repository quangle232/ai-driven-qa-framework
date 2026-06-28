/**
 * Deterministic file watcher.
 *
 * Watches the Playwright JSON reporter file and the Allure results dir. On
 * change, runs `collectors/failure-summary-builder.ts` and writes normalized
 * `FailureEvent` JSON files to `test-output/ai/events/`. NEVER invokes an LLM.
 *
 * The LLM-side diagnosis is a separate, post-run command (`aiqa:diagnose`)
 * that only runs once Playwright is done; this is per the master prompt:
 *   "It must not call Claude/LLM on every file change."
 *
 * `chokidar` is loaded lazily so the watcher subcommand fails with a friendly
 * message (rather than at module-load time) if the optional dep is missing.
 */

import fs from "node:fs";
import path from "node:path";

import { PLAYWRIGHT_JSON_PATH, ALLURE_RESULTS_DIR, aiqaSubdir } from "../utils/paths";
import { readPlaywrightReport } from "../collectors/playwright-report-reader";
import { buildFailureEvents } from "../collectors/failure-summary-builder";
import { resolveRunId } from "../utils/run-id";

export interface WatcherOptions {
    /** Override the JSON reporter path. */
    playwrightJson?: string;
    /** Override the Allure results dir. */
    allureDir?: string;
    /** Override the run id (CI usually injects one). */
    runId?: string;
    /** Custom logger. */
    log?: (msg: string) => void;
}

export interface Watcher {
    close(): Promise<void>;
}

export async function startWatcher(opts: WatcherOptions = {}): Promise<Watcher> {
    const log = opts.log ?? ((msg: string) => console.log(`[aiqa:watch] ${msg}`));
    const jsonPath = opts.playwrightJson ?? PLAYWRIGHT_JSON_PATH;
    const allureDir = opts.allureDir ?? ALLURE_RESULTS_DIR;
    const runId = opts.runId ?? resolveRunId();
    const eventsDir = aiqaSubdir("events");

    // Dynamic import via an indirected specifier keeps chokidar fully
    // optional: the dep is declared in package.json but the watcher must
    // still typecheck on a fresh checkout before `yarn install` has run.
    // TypeScript only resolves `import("string-literal")`; routing the
    // specifier through a variable skips static resolution. The surface we
    // use (`.watch()` + `.on()` + `.close()`) is tiny and stable.
    let chokidar: { watch: (paths: string[], opts: unknown) => unknown };
    try {
        const moduleId = "chokidar";
        chokidar = (await import(moduleId)) as unknown as { watch: (paths: string[], opts: unknown) => unknown };
    } catch {
        throw new Error(
            "[aiqa:watch] `chokidar` is not installed. Run `yarn install` "
            + "(or `npm install`) to pull in the dev dependency, then retry.",
        );
    }

    const watchPaths = [jsonPath, allureDir].filter(p => {
        if (!fs.existsSync(p)) {
            log(`watch path does not exist yet — will pick it up when created: ${p}`);
        }
        return true;
    });

    log(`watching ${watchPaths.map(p => path.relative(process.cwd(), p)).join(", ")} (runId=${runId})`);

    let processing = false;
    let pending = false;

    const handle = async (reason: string) => {
        if (processing) {
            pending = true;
            return;
        }
        processing = true;
        try {
            await processOnce(jsonPath, eventsDir, runId, log, reason);
        } finally {
            processing = false;
            if (pending) {
                pending = false;
                await handle("debounced-followup");
            }
        }
    };

    // The chokidar FSWatcher surface is tiny and stable; type it loosely
    // here so we don't need `@types/chokidar` in the install footprint.
    interface FsWatcher {
        on(event: string, handler: (...args: unknown[]) => void): FsWatcher;
        close(): Promise<void>;
    }
    const watcher = chokidar.watch(watchPaths, {
        ignoreInitial: false,
        awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
        ignorePermissionErrors: true,
    }) as FsWatcher;

    watcher
        .on("add", ((file: string) => { void handle(`add ${path.basename(file)}`); }) as (...args: unknown[]) => void)
        .on("change", ((file: string) => { void handle(`change ${path.basename(file)}`); }) as (...args: unknown[]) => void)
        .on("error", ((err: unknown) => { log(`watch error: ${(err as Error)?.message ?? String(err)}`); }) as (...args: unknown[]) => void);

    return {
        async close() {
            await watcher.close();
        },
    };
}

async function processOnce(
    jsonPath: string,
    eventsDir: string,
    runId: string,
    log: (m: string) => void,
    reason: string,
): Promise<void> {
    const report = readPlaywrightReport(jsonPath);
    if (!report) return;

    const events = buildFailureEvents(report, { runId, failuresOnly: true });
    if (events.length === 0) {
        log(`scanned (${reason}); no failure events yet.`);
        return;
    }

    // Write one file per (testId, attempt) so repeated change events overwrite
    // the same record instead of accumulating.
    let written = 0;
    for (const ev of events) {
        const file = path.join(eventsDir, `${ev.testId}__a${ev.retryAttempt}.json`);
        fs.writeFileSync(file, JSON.stringify(ev, null, 2));
        written++;
    }
    log(`scanned (${reason}); wrote ${written} event(s) to ${path.relative(process.cwd(), eventsDir)}`);
}
