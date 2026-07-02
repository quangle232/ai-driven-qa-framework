import { Page } from "@playwright/test";
import { ActionKeyword } from "@ui/helpers/action-keywords";

/**
 * BasePage - shared base for every page object.
 * Holds the Playwright `page` and the `actionKeyword` helper so page objects
 * only depend on `this.actionKeyword`.
 */
export class BasePage {
    readonly page: Page;
    readonly actionKeyword: ActionKeyword;

    constructor(page: Page) {
        this.page = page;
        this.actionKeyword = new ActionKeyword(this.page);
    }
}
