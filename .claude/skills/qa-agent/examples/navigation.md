# App Navigation Map — EXAMPLE

EXAMPLE of `docs/ai/navigation.md`. How to reach each screen; reused so a
known screen is not re-explored by the Playwright MCP.

| Screen | Route / URL | How to reach | Page Object |
|--------|-------------|--------------|-------------|
| Sign-in | `/signin` | `loginPage.open(AUTH_URL)` | LoginPage |
| Dashboard | `/` | post-login redirect | DashboardPage |
| Account settings | `/settings/account` | header menu → "Account" | AccountSettingsPage |

## Notes
- Auth runs once in global-setup; every test starts at `/` already signed in.
