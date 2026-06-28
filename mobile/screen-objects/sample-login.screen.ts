import { BaseScreen } from "./base-screen";

/**
 * SAMPLE native Screen Object — replace with your app's screens.
 *
 * Convention (mirrors POM):
 *   - accessibility ids grouped in a private readonly object
 *   - methods are screen actions / getters that ONLY call `this.keyword.*`
 *   - provide a one-call flow method where a screen has a complete journey
 */
export class SampleLoginScreen extends BaseScreen {
    private readonly ids = {
        username: "login_username",
        password: "login_password",
        submit: "login_submit",
        welcome: "home_welcome",
    };

    async login(username: string, password: string): Promise<void> {
        await this.keyword.type(this.ids.username, username);
        await this.keyword.type(this.ids.password, password);
        await this.keyword.tap(this.ids.submit);
    }

    getWelcomeText(): Promise<string> {
        return this.keyword.getText(this.ids.welcome);
    }
}
