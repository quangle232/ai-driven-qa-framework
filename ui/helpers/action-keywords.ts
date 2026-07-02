import { expect, Locator, Page } from "@playwright/test";
import axios from "axios";

export class ActionKeyword {

    readonly page: Page;
    readonly DEFAULT_TIMEOUT = 60_000;

    constructor(page: Page) {
        this.page = page;
    }

    /*==================== Stakeholder-friendly errors ====================*/
    /* Raw Playwright timeouts dump the locator string (often a long XPath)
       which is not useful for non-technical readers of the test report. The
       two helpers below translate a selector to a short human label and
       rewrap waitFor failures into a sentence like:
         "Step failed: could not click option \"Demolition Request\" —
          not visible within 15s."
       The raw selector is still appended at the end as a debug hint. */

    /** Turn a CSS/XPath selector into a short stakeholder-friendly phrase. */
    private friendlyLabel(selector: string): string {
        // XPath: normalize-space()="text"  (optionally combined with @role="...")
        const xpathText = selector.match(/normalize-space\([^)]*\)\s*=\s*["']([^"']+)["']/);
        if (xpathText) {
            const role = selector.match(/@role\s*=\s*["']([^"']+)["']/);
            return role ? `${role[1]} "${xpathText[1]}"` : `"${xpathText[1]}"`;
        }
        // [data-zcqa="..."], [data-test-id="..."], [data-id="..."], [data-title="..."]
        const dataAttr = selector.match(/\[data-(?:zcqa|test-id|id|title)\s*=\s*["']([^"']+)["']\]/);
        if (dataAttr) return `element "${dataAttr[1]}"`;
        // text=... or text="..."
        const textSel = selector.match(/(?:^|\s)text\s*=\s*["']?([^"'\]]+?)["']?$/);
        if (textSel) return `text "${textSel[1].trim()}"`;
        // #some-id (optionally with a :pseudo)
        const idSel = selector.match(/^#([\w-]+)/);
        if (idSel) return `element #${idSel[1]}`;
        // generic fallback — truncate so the message stays one line
        return selector.length > 70 ? selector.slice(0, 67) + '...' : selector;
    }

    /** Rewrap Playwright's waitFor timeout into a stakeholder-friendly error. */
    private async friendlyWait(
        element: Locator,
        state: 'visible' | 'attached' | 'hidden',
        timeout: number,
        action: string,
        selector: string
    ): Promise<void> {
        try {
            await element.waitFor({ state, timeout });
        } catch (error) {
            if (error instanceof Error && /Timeout/i.test(error.message)) {
                const label = this.friendlyLabel(selector);
                throw new Error(
                    `Step failed: could not ${action} ${label} — `
                    + `not ${state} within ${timeout / 1000}s.\n`
                    + `  (selector: ${selector})`
                );
            }
            throw error;
        }
    }

    async goto(url: string, timeout: number = this.DEFAULT_TIMEOUT * 2) {
        await this.page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout
        });
    }

    async getColor(locator: string, index: number = 0) {
        let element = this.page.locator(locator).nth(index);
        const actualColor = await element.evaluate(value => {
            return window.getComputedStyle(value).getPropertyValue("color")
        })
        return actualColor;
    }

    async getBackGroundColor(locator: string) {
        let element = this.page.locator(locator);
        const actualColor = await element.evaluate(value => {
            return window.getComputedStyle(value).getPropertyValue("background-color")
        })
        return actualColor;
    }

    async fillElementInFrame(
        frameLocator: string,
        locator: string,
        text: string,
        timeout: number = this.DEFAULT_TIMEOUT
    ) {
        const element = this.page.frameLocator(frameLocator).locator(locator);
        await element.click({ timeout });
        await element.fill(text, { timeout });
    }

    async clickItemByText(text: string, timeout: number = this.DEFAULT_TIMEOUT) {
        await this.waitAndClick(`text='${text}'`, 0, timeout);
    }

    async isElementVisible(
        locator: string,
        index: number = 0,
        timeout: number = 3000
    ): Promise<boolean> {
        const element = this.page.locator(locator).nth(index);

        try {
            await element.waitFor({
                state: 'visible',
                timeout
            });
            return true;
        } catch {
            return false;
        }
    }

    async isElementDisabled(
        locator: string,
        index: number = 0,
        timeout: number = 3000
    ): Promise<boolean> {
        const element = this.page.locator(locator).nth(index);

        try {
            await element.waitFor({
                state: 'visible',
                timeout
            });

            // Native disabled
            if (await element.isDisabled()) {
                return true;
            }

            // MUI / custom disabled
            const ariaDisabled = await element.getAttribute('aria-disabled');
            if (ariaDisabled === 'true') {
                return true;
            }

            return false;
        } catch {
            return false;
        }
    }

    async waitForElementHidden(
        locator: string,
        index: number = 0,
        timeout: number = this.DEFAULT_TIMEOUT
    ) {
        const element = this.page.locator(locator).nth(index);
        await element.waitFor({
            state: "hidden",
            timeout
        });
    }

    async waitAndClick(locator: string, index: number = 0, timeout: number = this.DEFAULT_TIMEOUT) {
        const element = this.page.locator(locator).nth(index);
        await this.friendlyWait(element, 'visible', timeout, 'click', locator);
        await element.click({ timeout });
    }

    async waitAndClickInPopup(
        page: Page,
        locator: string,
        index: number = 0,
        timeout: number = this.DEFAULT_TIMEOUT
    ) {
        const element = page.locator(locator).nth(index);
        await element.waitFor({
            state: "visible",
            timeout
        });
        await element.click({ timeout });
    }

    async waitAndFill(
        locator: string,
        value: string,
        index: number = 0,
        timeout: number = this.DEFAULT_TIMEOUT
    ) {
        const element = this.page.locator(locator).nth(index);
        await this.friendlyWait(element, 'visible', timeout, 'fill', locator);
        await element.clear({ timeout });
        await element.fill(value, { timeout });
    }

    async waitAndFillInPopup(
        page: Page,
        locator: string,
        value: string,
        index: number = 0,
        timeout: number = this.DEFAULT_TIMEOUT
    ) {
        const element = page.locator(locator).nth(index);
        await element.waitFor({
            state: "visible",
            timeout
        });
        await element.clear({ timeout });
        await element.fill(value, { timeout });
    }

    async waitAndClickInFrame(
        frameSelector: string,
        locator: string,
        index = 0,
        timeout: number = this.DEFAULT_TIMEOUT
    ) {
        const el = this.page.frameLocator(frameSelector).locator(locator).nth(index);
        await this.friendlyWait(el, 'visible', timeout, 'click (in iframe)', locator);
        await el.click({ timeout });
    }

    async waitAndSelectByValue(
        locator: string,
        value: string,
        index: number = 0,
        timeout: number = this.DEFAULT_TIMEOUT
    ) {
        const element = this.page.locator(locator).nth(index);
        await element.waitFor({
            state: "visible",
            timeout
        });
        await element.selectOption({ value: value }, { timeout });
    }

    async waitAndSelectByLabel(
        locator: string,
        value: string,
        index: number = 0,
        timeout: number = this.DEFAULT_TIMEOUT
    ) {
        const element = this.page.locator(locator).nth(index);
        await element.waitFor({
            state: "visible",
            timeout
        });
        await element.selectOption({ label: value }, { timeout });
    }

    async waitAndSelectByIndex(
        locator: string,
        value: number,
        _index: number = 0,
        timeout: number = this.DEFAULT_TIMEOUT
    ) {
        const element = this.page.locator(locator).nth(0);
        await element.waitFor({
            state: "visible",
            timeout
        });
        await element.selectOption({ index: value }, { timeout });
    }

    async waitAndGetText(
        locator: string,
        index: number = 0,
        timeout: number = this.DEFAULT_TIMEOUT
    ): Promise<string> {
        const element = this.page.locator(locator).nth(index);
        await element.waitFor({
            state: "visible",
            timeout
        });
        let elementText = await element.innerText();
        if (elementText === null) {
            return "Element Text is null, Pls check element locator or its textContent";
        } else {
            return elementText;
        }
    }

    async waitAndGetValue(
        locator: string,
        index: number = 0,
        timeout: number = this.DEFAULT_TIMEOUT
    ): Promise<string> {
        const element = this.page.locator(locator).nth(index);

        await element.waitFor({
            state: 'visible',
            timeout
        });

        const elementValue = await element.inputValue();

        if (!elementValue) {
            return "";
        }

        return elementValue;
    }

    async getElement(
        locator: string,
        index: number = 0,
        timeout: number = this.DEFAULT_TIMEOUT
    ): Promise<Locator> {
        const element = this.page.locator(locator).nth(index);
        await this.friendlyWait(element, 'visible', timeout, 'find', locator);
        return element;
    }

    async getElements(locator: string, timeout: number = this.DEFAULT_TIMEOUT): Promise<Locator> {
        const elements = this.page.locator(locator);
        await this.friendlyWait(elements.first(), 'attached', timeout, 'find', locator);
        return elements;
    }

    async waitAndSelectLiCustomDropDownByDataValue(
        locator: string,
        dataValue: string,
        timeout: number = this.DEFAULT_TIMEOUT
    ) {
        await this.waitAndClick(locator, 0, timeout);
        const selectOption = `[role="listbox"] li[role="option"][data-value="${dataValue}"]`;
        await this.waitAndClick(selectOption, 0, timeout);
    }

    async waitAndSelectLiCustomDropDownByDataOptionIndex(
        locator: string,
        dataOptionIndex: string,
        timeout: number = this.DEFAULT_TIMEOUT
    ) {
        await this.waitAndClick(locator, 0, timeout);
        const selectOption = `[data-option-index = "${dataOptionIndex}"]`;
        await this.waitAndClick(selectOption, 0, timeout);
    }

    async waitAndSelectCustomYearPicker(
        locator: string,
        year: string,
        timeout: number = this.DEFAULT_TIMEOUT
    ) {
        await this.waitAndClick(locator, 0, timeout);
        const selectOption = `//button[contains(@class, "MuiPickersYear-yearButton") and text() = "${year}"]`;
        await this.waitAndClick(selectOption, 0, timeout);
        const okButoon = '//button[text() = "OK"]'
        await this.waitAndClick(okButoon, 0, timeout);
    }

    /**
    * Upload file after ensuring the input element is visible.
    * This prevents flaky tests when the upload input is not yet rendered.
    *
    * @param locator - locator string of the file input
    * @param filePath - path to the file to upload
    * @param timeout - optional timeout (default 30s)
    */
    async waitAndUploadFile(locator: string, filePath: string, timeout: number = this.DEFAULT_TIMEOUT) {
        const element = this.page.locator(locator);
        await element.waitFor({
            state: "attached",
            timeout
        });
        await this.page.setInputFiles(locator, filePath);
    }

    async waitAndVerifyText(
        locator: string,
        text: string,
        index: number = 0,
        timeout: number = this.DEFAULT_TIMEOUT
    ) {
        const element = this.page
            .locator(locator, {
                hasText: `/^${text}$/g`,
            })
            .nth(index);
        await element.waitFor({
            state: "visible",
            timeout
        });
    }

    async waitForResponseSuccess(url: string, timeout: number = this.DEFAULT_TIMEOUT) {
        await this.page.waitForResponse(
            (response) => response.url().includes(url) && response.status() === 200,
            { timeout }
        );
    }

    async waitForPageLoaded(url: string, timeout: number = this.DEFAULT_TIMEOUT) {
        await this.page.waitForResponse(
            (response) => response.url().includes(url) && response.status() === 304,
            { timeout }
        );
    }

    /*==================Verification==============*/

    async verifyTextContent(
        locator: string,
        text: string,
        index: number = 0,
        timeout: number = this.DEFAULT_TIMEOUT
    ) {
        const element = this.page.locator(locator).nth(index);

        await element.waitFor({
            state: 'visible',
            timeout,
        });

        const elementText = (await element.textContent())?.trim();

        expect(elementText).toContain(text);
    }

    async verifyValueContent(locator: string, text: string, index: number = 0) {
        let value = await this.page.locator(locator).nth(index).getAttribute("value");
        expect(value).toContain(text);
    }

    async verifyElementVisibleWithReload(
        locator: string,
        options?: {
            timeout?: number;
            interval?: number;
            index?: number;
            reason?: string;
        }
    ) {
        const {
            timeout = 180_000,
            interval = 30_000,
            index = 0,
            reason = ''
        } = options || {};

        const start = Date.now();
        let attempt = 0;

        const isElementVisible = async () => {
            const element = this.page.locator(locator).nth(index);

            try {
                return await element.isVisible();
            } catch {
                return false;
            }
        };

        while (Date.now() - start < timeout) {
            attempt++;

            if (await isElementVisible()) {
                console.log(`✅ Element found before reload on attempt ${attempt}: ${locator}`);
                return;
            }

            console.log(`⏳ Attempt ${attempt}: element not found, reloading page...`);

            await this.page.reload({ waitUntil: 'domcontentloaded' });

            if (await isElementVisible()) {
                console.log(`✅ Element found right after reload on attempt ${attempt}: ${locator}`);
                return;
            }

            const elapsed = Date.now() - start;
            const remaining = timeout - elapsed;

            if (remaining <= 0) {
                break;
            }

            const waitTime = Math.min(interval, remaining);
            console.log(`⏳ Still not found. Waiting ${waitTime}ms before next retry...`);
            await this.page.waitForTimeout(waitTime);
        }

        throw new Error(`
            ❌ Element not visible after timeout
            Locator: ${locator}
            Index: ${index}
            Timeout: ${timeout}ms
            Interval: ${interval}ms
            Reason: ${reason}
        `);
    }

    async verifyElementVisible(
        locator: string,
        reason: string = '',
        index: number = 0,
        timeout: number = this.DEFAULT_TIMEOUT
    ) {
        const element = this.page.locator(locator).nth(index);
        try {
            await expect(element).toBeVisible({ timeout });
        } catch {
            const label = this.friendlyLabel(locator);
            const because = reason.trim() ? ` — ${reason.trim()}` : '';
            throw new Error(
                `Step failed: expected ${label} to be visible within ${timeout / 1000}s.${because}\n`
                + `  (selector: ${locator})`
            );
        }
    }

    async verifyElementNotVisible(
        locator: string,
        reason: string = '',
        index: number = 0,
        timeout: number = this.DEFAULT_TIMEOUT
    ) {
        const element = this.page.locator(locator).nth(index);
        try {
            await expect(element).not.toBeVisible({ timeout });
        } catch {
            const label = this.friendlyLabel(locator);
            const because = reason.trim() ? ` — ${reason.trim()}` : '';
            throw new Error(
                `Step failed: expected ${label} to NOT be visible within ${timeout / 1000}s.${because}\n`
                + `  (selector: ${locator})`
            );
        }
    }

    async verifyElementDisabled(locator: string, timeout: number = this.DEFAULT_TIMEOUT) {
        const element = this.page.locator(locator).first();
        await expect(element).toBeDisabled({ timeout });
    }

    async verifyElementDisableWithAttribute(
        locator: string,
        index: number = 0,
        timeout: number = this.DEFAULT_TIMEOUT
    ) {
        const element = this.page.locator(locator).nth(index);
        await expect(element).toHaveAttribute("aria-disabled", "true", { timeout });
    }

    async verifyElementHasClass(
        locator: string,
        className: string,
        index: number = 0,
        timeout: number = this.DEFAULT_TIMEOUT
    ) {
        const element = this.page.locator(locator).nth(index);
        await expect(element).toHaveClass(className, { timeout });
    }

    async verifyBackgroundColor(locator: string, color: string, index: number = 0) {
        let element = this.page.locator(locator).nth(index);
        const actualColor = await element.evaluate(value => {
            return window.getComputedStyle(value).getPropertyValue("background-color")
        })
        expect(color).toBe(actualColor)
    }

    async verifyElementColor(locator: string, color: string, index: number = 0) {
        let element = this.page.locator(locator).nth(index);
        const actualColor = await element.evaluate(value => {
            return window.getComputedStyle(value).getPropertyValue("color")
        })
        expect(color).toBe(actualColor)
    }

    async softVerifyElementVisible(locator: string, timeout: number = this.DEFAULT_TIMEOUT) {
        const element = this.page.locator(locator).first();
        await expect.soft(element).toBeVisible({ timeout });
    }

    async softVerifyElementNotVisible(locator: string, timeout: number = this.DEFAULT_TIMEOUT) {
        const element = this.page.locator(locator).first();
        await expect.soft(element).not.toBeVisible({ timeout });
    }

    async verifyPageStatus(url: string, timeout: number = this.DEFAULT_TIMEOUT) {
        await expect(this.page).toHaveURL(url, { timeout });
        const response = await this.page.goto(url, { timeout });
        expect(response?.status()).toBe(200);
    }

    async validatePageURLgaleryResponse() {
        // verifies the HTTP status of the currently open URL
        const pageURL = this.page.url();
        const response = await axios.get(pageURL);
        expect(response.status).toEqual(200);
    }

    async validatePageURLgaleryResponsePopup(page: Page) {
        // verifies the HTTP status of the currently open URL
        const pageURL = page.url();
        const response = await axios.get(pageURL);
        expect(response.status).toEqual(200);
    }

    async validateResponse(url: string) {
        // verifies the HTTP status of a URL opened from another URL
        const response = await axios.get(url);
        expect(response.status).toEqual(200);
    }

    /*==================== Async-safe getters ====================*/
    /* Many SPAs (especially those built on web-component frameworks) paint
       inputs / labels BEFORE populating them — reading a value right after
       the element is visible is flaky. The helpers below poll for a
       non-empty string before returning. */

    /**
     * Poll an async string getter until it returns a non-empty value (or until
     * `timeout` elapses). Use as a building block for SPA-safe getters.
     */
    private async waitForNonEmptyValue(
        read: () => Promise<string>,
        timeout: number = 5000
    ): Promise<string> {
        const deadline = Date.now() + timeout;
        let value = ((await read()) ?? "").trim();
        while (value === "" && Date.now() < deadline) {
            await this.page.waitForTimeout(200);
            value = ((await read()) ?? "").trim();
        }
        return value;
    }

    /**
     * Read the visible text of an element by CSS / XPath selector. Waits for
     * the element to be visible and for its text to be populated (non-empty).
     */
    async getElementText(
        locator: string,
        index: number = 0,
        timeout: number = this.DEFAULT_TIMEOUT
    ): Promise<string> {
        const element = await this.getElement(locator, index, timeout);
        return this.waitForNonEmptyValue(
            async () => (await element.innerText()).replace(/\s+/g, " ")
        );
    }

    /*==================== Self-healing locators ====================*/
    /* Prefer stable test-only attributes in priority order: try `data-zcqa`,
       `data-test-id`, `data-id`, `data-title`. The helpers below pick the
       first one that matches; a single attribute change in the app then does
       not break the test. Customise `DATA_ATTRS` for your app's convention. */

    private readonly DATA_ATTRS = ['data-zcqa', 'data-test-id', 'data-id', 'data-title'];

    /**
     * Build a CSS union selector matching an element that carries `value` on
     * ANY supported data-* attribute. Use when the stable identifier is known
     * but not which attribute the app exposes it on.
     */
    dataAttrSelector(value: string): string {
        return this.DATA_ATTRS.map((attr) => `[${attr}="${value}"]`).join(', ');
    }

    /**
     * Self-healing locator: try each candidate selector in order and return the
     * first that resolves to a visible element. A page object can list a
     * primary selector plus fallbacks; if the app changes one attribute the
     * next candidate still matches. Throws only when every candidate fails.
     */
    async healLocator(
        candidates: string[],
        timeout: number = this.DEFAULT_TIMEOUT
    ): Promise<Locator> {
        const perCandidate = Math.max(2000, Math.floor(timeout / candidates.length));
        let lastError: unknown;
        for (const selector of candidates) {
            try {
                const element = this.page.locator(selector).first();
                await element.waitFor({ state: 'visible', timeout: perCandidate });
                console.log(`✅ healLocator matched: ${selector}`);
                return element;
            } catch (error) {
                lastError = error;
                console.log(`↪️  healLocator candidate missed: ${selector}`);
            }
        }
        throw new Error(
            `healLocator: no candidate matched a visible element:\n  `
            + `${candidates.join('\n  ')}\nLast error: ${lastError}`
        );
    }

    /**
     * Resolve an element by a stable data-* `value`. If the value is generic
     * and matches several elements, pass `ancestorValue` - the data-* id of the
     * nearest unique wrapper - to scope the search. the SUT often puts the unique
     * id on a wrapper, not the leaf element that shows the text.
     */
    async healByData(
        value: string,
        ancestorValue?: string,
        timeout: number = this.DEFAULT_TIMEOUT
    ): Promise<Locator> {
        const leaf = this.dataAttrSelector(value);
        const selector = ancestorValue
            ? `${this.dataAttrSelector(ancestorValue)} ${leaf}`
            : leaf;
        const element = this.page.locator(selector).first();
        await element.waitFor({ state: 'visible', timeout });
        return element;
    }

    /** Read an attribute value, waiting for the element to be attached first. */
    async getAttributeValue(
        locator: string,
        attribute: string,
        index: number = 0,
        timeout: number = this.DEFAULT_TIMEOUT
    ): Promise<string> {
        const element = this.page.locator(locator).nth(index);
        await element.waitFor({ state: 'attached', timeout });
        return (await element.getAttribute(attribute)) ?? '';
    }

    /** Scroll an element into view (the SUT lazy-loads related-list sections). */
    async scrollIntoView(
        locator: string,
        index: number = 0,
        timeout: number = this.DEFAULT_TIMEOUT
    ) {
        const element = this.page.locator(locator).nth(index);
        await element.waitFor({ state: 'attached', timeout });
        await element.scrollIntoViewIfNeeded({ timeout });
    }

    /**
     * Fixed pause. Use sparingly - only where the app gives no deterministic
     * signal to wait on (e.g. a the SUT list re-render after applying a filter).
     */
    async wait(ms: number) {
        await this.page.waitForTimeout(ms);
    }

    /*==================== iframe helpers ====================*/
    /* Some the SUT related lists are Canvas widgets rendered in a (possibly
       cross-origin) iframe. Playwright's frameLocator handles cross-origin
       frames transparently. */

    /** Wait for an element inside an iframe to be visible and return it. */
    async getElementInFrame(
        frameSelector: string,
        locator: string,
        index: number = 0,
        timeout: number = this.DEFAULT_TIMEOUT
    ): Promise<Locator> {
        const element = this.page.frameLocator(frameSelector).locator(locator).nth(index);
        await element.waitFor({ state: 'visible', timeout });
        return element;
    }

    /** Assert an element inside an iframe is visible. */
    async verifyElementVisibleInFrame(
        frameSelector: string,
        locator: string,
        reason: string = '',
        timeout: number = this.DEFAULT_TIMEOUT
    ) {
        const element = this.page.frameLocator(frameSelector).locator(locator).first();
        try {
            await expect(element).toBeVisible({ timeout });
        } catch {
            const label = this.friendlyLabel(locator);
            const because = reason.trim() ? ` — ${reason.trim()}` : '';
            throw new Error(
                `Step failed: expected ${label} to be visible inside the iframe `
                + `within ${timeout / 1000}s.${because}\n`
                + `  (iframe: ${frameSelector}; selector: ${locator})`
            );
        }
    }

    /** Count elements matching a locator inside an iframe (waits for the first). */
    async getCountInFrame(
        frameSelector: string,
        locator: string,
        timeout: number = this.DEFAULT_TIMEOUT
    ): Promise<number> {
        const elements = this.page.frameLocator(frameSelector).locator(locator);
        try {
            await elements.first().waitFor({ state: 'visible', timeout });
        } catch {
            return 0;
        }
        return elements.count();
    }

    /** Read the visible text of an element inside an iframe. */
    async getTextInFrame(
        frameSelector: string,
        locator: string,
        index: number = 0,
        timeout: number = this.DEFAULT_TIMEOUT
    ): Promise<string> {
        const element = this.page.frameLocator(frameSelector).locator(locator).nth(index);
        await element.waitFor({ state: 'visible', timeout });
        return (await element.innerText()).replace(/\s+/g, ' ').trim();
    }
}
