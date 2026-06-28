import { MobileActionKeyword } from "../../helper/mobile/mobile-action-keyword";

/**
 * BaseScreen — shared base for native Screen Objects (the mobile analogue of
 * page-objects/base-page.ts). Holds the `MobileActionKeyword`; screens only
 * depend on `this.keyword`, never on WebdriverIO directly.
 */
export class BaseScreen {
    constructor(protected readonly keyword: MobileActionKeyword) {}
}
