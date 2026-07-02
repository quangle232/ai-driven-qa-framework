/**
 * Creates a WebdriverIO + Appium session (the native-mobile "driver").
 *
 * One session is created PER Playwright worker (see helper/mobile/test-mobile.ts),
 * which is how "parallel drivers" works: Playwright's `workers` decide how many
 * concurrent device sessions run. Local Appium by default; cloud device grids
 * (BrowserStack / Sauce Labs) via `DEVICE_GRID` + creds — all env-driven.
 */
import { remote, type Browser } from "webdriverio";
import ENV from "@core/env-config";
import { resolveCapabilities } from "@mobile/capabilities";

export async function createDriver(): Promise<Browser> {
    return remote({
        logLevel: "warn",
        capabilities: resolveCapabilities(),
        ...connectionOptions(),
    });
}

function connectionOptions() {
    const grid = (ENV.DEVICE_GRID ?? "local").toLowerCase();

    if (grid === "browserstack") {
        return {
            protocol: "https",
            hostname: "hub.browserstack.com",
            port: 443,
            path: "/wd/hub",
            user: process.env.BROWSERSTACK_USERNAME,
            key: process.env.BROWSERSTACK_ACCESS_KEY,
        };
    }
    if (grid === "saucelabs") {
        return {
            protocol: "https",
            hostname: "ondemand.us-west-1.saucelabs.com",
            port: 443,
            path: "/wd/hub",
            user: process.env.SAUCE_USERNAME,
            key: process.env.SAUCE_ACCESS_KEY,
        };
    }

    // Local Appium 2 (base path is "/").
    const url = new URL(ENV.APPIUM_URL);
    return {
        protocol: url.protocol.replace(":", ""),
        hostname: url.hostname,
        port: Number(url.port || 4723),
        path: url.pathname || "/",
    };
}
