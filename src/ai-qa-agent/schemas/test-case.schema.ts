/**
 * Test Case — schemaVersion `aiqa.test-case.v1`.
 *
 * The Markdown review table and the eventual Excel export share this shape.
 * Columns mirror agents/core/test-design-agent.md.
 */

export const TEST_CASE_SCHEMA_VERSION = "aiqa.test-case.v1" as const;

export type Priority = "P0" | "P1" | "P2" | "P3";
export type CoverageDimension =
    | "happy_path"
    | "negative"
    | "edge_case"
    | "boundary"
    | "permission_auth"
    | "data_validation"
    | "api"
    | "mobile_desktop"
    | "accessibility"
    | "security_smoke"
    | "regression";

export interface TestCase {
    schemaVersion: typeof TEST_CASE_SCHEMA_VERSION;

    tcId: string;
    feature: string;
    subFeature: string;
    summary: string;
    preCondition: string;
    description: string;
    priority: Priority;
    testResult: "" | "Pass" | "Fail" | "Blocked" | "Not Run";
    bugId: string;
    notes: string;

    coverage: CoverageDimension[];
    jiraStoryKey: string | null;
    suggestedTags: string[];
}
