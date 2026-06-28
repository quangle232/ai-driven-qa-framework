/**
 * Appium capability matrix for native mobile.
 *
 * `MOBILE_PLATFORM` (android|ios) picks the base set; `DEVICE_GRID`
 * (local|browserstack|saucelabs) layers vendor options on top. `MOBILE_APP` is
 * the build under test (local path, URL, or a cloud app id). Nothing is
 * hard-coded — everything comes from env (see environments/.env.example).
 */
import ENV from "../../helper/env-config";

export type AppiumCapabilities = Record<string, unknown>;

export function resolveCapabilities(): AppiumCapabilities {
    const platform = (ENV.MOBILE_PLATFORM ?? "android").toLowerCase();
    return platform === "ios" ? iosCapabilities() : androidCapabilities();
}

function androidCapabilities(): AppiumCapabilities {
    return {
        platformName: "Android",
        "appium:automationName": "UiAutomator2",
        "appium:deviceName": process.env.ANDROID_DEVICE ?? "Android Emulator",
        "appium:app": ENV.MOBILE_APP,
        "appium:newCommandTimeout": 240,
        ...gridOptions("android"),
    };
}

function iosCapabilities(): AppiumCapabilities {
    return {
        platformName: "iOS",
        "appium:automationName": "XCUITest",
        "appium:deviceName": process.env.IOS_DEVICE ?? "iPhone 15",
        "appium:app": ENV.MOBILE_APP,
        "appium:newCommandTimeout": 240,
        ...gridOptions("ios"),
    };
}

/** Vendor-specific options for cloud device grids. */
function gridOptions(platform: "android" | "ios"): AppiumCapabilities {
    const grid = (ENV.DEVICE_GRID ?? "local").toLowerCase();
    if (grid === "browserstack") {
        return {
            "bstack:options": {
                userName: process.env.BROWSERSTACK_USERNAME,
                accessKey: process.env.BROWSERSTACK_ACCESS_KEY,
                projectName: "ai-driven-qa-framework",
                deviceName: platform === "ios" ? "iPhone 15" : "Google Pixel 8",
            },
        };
    }
    if (grid === "saucelabs") {
        return {
            "sauce:options": {
                username: process.env.SAUCE_USERNAME,
                accessKey: process.env.SAUCE_ACCESS_KEY,
                build: "ai-driven-qa-framework",
            },
        };
    }
    return {};
}
