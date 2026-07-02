import { test } from '@playwright/test';

/**
 * Annotation type used by the failure → Jira-bug reporter (helper/jira-bug-
 * reporter.ts) to find the parent user story of a failing test.
 *
 * Per-test, not per-describe: a single `test.describe` block can hold tests
 * from different user stories, so each test declares its own story.
 */
export const JIRA_STORY_ANNOTATION = 'jira-story';

/**
 * Tag the CURRENT test with its parent Jira user-story key. Call it as the
 * first line of the test body (or wrap it inside a `test.step` if you want
 * the story to show in the report's step list as well):
 *
 *   test('...', tags(TAGS.SMOKE), async () => {
 *       setJiraStory('PROJ-1');
 *       // test body…
 *   });
 *
 * The annotation also surfaces in the Playwright HTML / Allure report.
 */
export function setJiraStory(storyKey: string): void {
    test.info().annotations.push({
        type: JIRA_STORY_ANNOTATION,
        description: storyKey,
    });
}

/**
 * Read the parent story key set on the current test (`undefined` if the test
 * did not call `setJiraStory`). Used by the failure → Bug afterEach hook.
 */
export function getJiraStory(): string | undefined {
    return test
        .info()
        .annotations.find((a) => a.type === JIRA_STORY_ANNOTATION)?.description;
}
