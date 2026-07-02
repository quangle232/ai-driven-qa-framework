/**
 * MobileActionKeyword — the native-mobile analogue of `ActionKeyword`.
 *
 * The ONLY layer that touches WebdriverIO/Appium. Screen Objects
 * (mobile/screen-objects/*) call this; specs call Screen Objects. Locator
 * strategy is **accessibility id first** (`~id`) — the one selector that works
 * the same on iOS and Android and is stable across UI tweaks.
 */
import type { Browser } from "webdriverio";

export class MobileActionKeyword {
    readonly DEFAULT_TIMEOUT = 20_000;

    constructor(private readonly driver: Browser) {}

    /** Select by accessibility id (iOS accessibilityIdentifier / Android content-desc). */
    private byA11y(accessibilityId: string) {
        return this.driver.$(`~${accessibilityId}`);
    }

    async tap(accessibilityId: string): Promise<void> {
        const el = this.byA11y(accessibilityId);
        await el.waitForDisplayed({ timeout: this.DEFAULT_TIMEOUT });
        await el.click();
    }

    async type(accessibilityId: string, text: string): Promise<void> {
        const el = this.byA11y(accessibilityId);
        await el.waitForDisplayed({ timeout: this.DEFAULT_TIMEOUT });
        await el.setValue(text);
    }

    async getText(accessibilityId: string): Promise<string> {
        const el = this.byA11y(accessibilityId);
        await el.waitForDisplayed({ timeout: this.DEFAULT_TIMEOUT });
        return el.getText();
    }

    async isDisplayed(accessibilityId: string): Promise<boolean> {
        return this.byA11y(accessibilityId).isDisplayed();
    }

    async waitForVisible(accessibilityId: string): Promise<void> {
        await this.byA11y(accessibilityId).waitForDisplayed({ timeout: this.DEFAULT_TIMEOUT });
    }

    /** Vertical swipe (ratio of screen height); useful for scrolling lists. */
    async swipeUp(ratio = 0.5): Promise<void> {
        const { width, height } = await this.driver.getWindowSize();
        const startX = Math.round(width / 2);
        const startY = Math.round(height * (0.5 + ratio / 2));
        const endY = Math.round(height * (0.5 - ratio / 2));
        await this.driver.action("pointer")
            .move({ x: startX, y: startY })
            .down()
            .move({ x: startX, y: endY, duration: 300 })
            .up()
            .perform();
    }
}
