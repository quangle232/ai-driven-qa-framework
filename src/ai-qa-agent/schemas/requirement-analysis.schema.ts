/**
 * Requirement Analysis — schemaVersion `aiqa.requirement-analysis.v1`.
 *
 * Produced by the Requirement Analysis Agent (Phase 6). Phase 0/1 only
 * declares the shape so downstream code can be typed.
 */

export const REQUIREMENT_ANALYSIS_SCHEMA_VERSION = "aiqa.requirement-analysis.v1" as const;

export interface RequirementAnalysis {
    schemaVersion: typeof REQUIREMENT_ANALYSIS_SCHEMA_VERSION;

    sourceKey: string;              // e.g. Jira key "PROJ-123"
    feature: string;
    businessRules: string[];
    acceptanceCriteria: string[];
    ambiguities: string[];
    riskAreas: string[];
    suggestedQuestions: string[];

    /** True once a Requirement Reviewer round has cleared the output. */
    reviewed: boolean;
}
