/**
 * `test` for NATIVE mobile specs — adds `driver` (WebdriverIO/Appium session,
 * worker-scoped → parallel drivers) + `mobileKeyword` fixtures, built on the
 * framework `test` so the failure → Jira-bug auto-reporter still applies.
 *
 *     import { test, expect } from '@mobile/helpers/test-mobile';
 *
 * Native specs are skip-gated (they need a device/emulator + a running Appium
 * server). The `mobile-native` Playwright project is only added when
 * ALLOW_MOBILE_NATIVE=1, so this module's WebdriverIO import never loads during
 * an ordinary web/api/grpc run. Use `yarn test:mobile:native`.
 */
import { test as base, expect } from "@core/test";
import { createDriver } from "./driver-factory";
import { MobileActionKeyword } from "./mobile-action-keyword";
import type { Browser } from "webdriverio";

type MobileWorkerFixtures = {
    driver: Browser;
};
type MobileTestFixtures = {
    mobileKeyword: MobileActionKeyword;
};

export const test = base.extend<MobileTestFixtures, MobileWorkerFixtures>({
    driver: [
        async ({}, use) => {
            const driver = await createDriver();
            try {
                await use(driver);
            } finally {
                await driver.deleteSession();
            }
        },
        { scope: "worker" },
    ],

    mobileKeyword: async ({ driver }, use) => {
        await use(new MobileActionKeyword(driver));
    },
});

export { expect };
