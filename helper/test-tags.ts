/**
 * Tag catalogue used by `tags(...)` and Playwright `--grep <tag>`.
 *
 * Convention:
 * - Tag values are kebab-case, '@'-prefixed.
 * - A FEATURE tag's value MUST EQUAL the Jira label on the parent user story.
 *   That single value links the spec → Playwright --grep → Jenkins job param
 *   `TAGS` → Jira label, so qa-agent can trigger / find tests by label.
 *
 * Add per-project feature tags under "feature" below.
 */
export const TAGS = {
    // test type
    REGRESSION: "@regression",
    SMOKE: "@smoke",

    // priority
    P0: "@P0",
    P1: "@P1",
    P2: "@P2",

    // feature — add your own here, one per Jira label.
    // Example:
    //   AUTH: "@auth",
    //   CHECKOUT: "@checkout",

    // known defect
    BUG: "@bugs",
} as const;

/** Convenience for `test('title', tags(TAGS.REGRESSION, TAGS.P0), async (...) => {...})`. */
export function tags(...t: string[]) {
    return { tag: t };
}
