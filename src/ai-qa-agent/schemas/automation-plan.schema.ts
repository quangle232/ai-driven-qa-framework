/**
 * Automation Plan — schemaVersion `aiqa.automation-plan.v1`.
 *
 * Output of the Automation Planning Agent (Phase 7). The Builder Agent
 * consumes this to draft Playwright code in the existing framework style.
 */

export const AUTOMATION_PLAN_SCHEMA_VERSION = "aiqa.automation-plan.v1" as const;

export interface AutomationPlan {
    schemaVersion: typeof AUTOMATION_PLAN_SCHEMA_VERSION;

    automationCandidates: Array<{ tcId: string; reason: string }>;
    notRecommendedForAutomation: Array<{ tcId: string; reason: string }>;
    requiredPageObjects: string[];
    requiredFixtures: string[];
    requiredTags: string[];
    dataStrategy: string;
    teardownStrategy: string;
}
