import { BasePage } from '../base-page';

/**
 * SamplePage — example page object showing the framework conventions:
 *   - extends BasePage (gives `this.page` and `this.actionKeyword`)
 *   - locators grouped in a private readonly object
 *   - methods are page actions / getters that ONLY call `this.actionKeyword.*`
 *     (never `this.page.locator(...)` directly)
 *
 * Replace this with real page objects for your app.
 */
export class SamplePage extends BasePage {

    private readonly locators = {
        heading: 'h1',
        // Prefer test-only attributes — kept in priority order in
        // ActionKeyword.healLocator: data-zcqa → data-test-id → data-id → data-title.
        emailInput: '[data-test-id="email"]',
        submitButton: 'button[type="submit"]',
        flashMessage: '[data-test-id="flash"]',
    };

    /** Navigate to a path on the app (relative or absolute URL). */
    async open(url: string) {
        await this.actionKeyword.goto(url);
    }

    async getHeadingText(): Promise<string> {
        return this.actionKeyword.getElementText(this.locators.heading);
    }

    async fillEmail(email: string) {
        await this.actionKeyword.waitAndFill(this.locators.emailInput, email);
    }

    async submit() {
        await this.actionKeyword.waitAndClick(this.locators.submitButton);
    }

    async verifyFlashVisible(reason = 'Expected a flash message') {
        await this.actionKeyword.verifyElementVisible(this.locators.flashMessage, reason);
    }
}
