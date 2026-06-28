/**
 * CI Metadata — schemaVersion `aiqa.ci-metadata.v1`.
 *
 * Normalized view of the build environment so the diagnosis / notification /
 * report writers do not care whether the run is on Jenkins, GitHub Actions,
 * or GitLab CI. Populated by `collectors/ci-metadata-collector.ts`.
 */

export const CI_METADATA_SCHEMA_VERSION = "aiqa.ci-metadata.v1" as const;

export type CiProvider = "jenkins" | "github-actions" | "gitlab-ci" | "local";

export interface CiMetadata {
    schemaVersion: typeof CI_METADATA_SCHEMA_VERSION;

    provider: CiProvider;
    runId: string;
    runUrl: string | null;

    jobName: string | null;
    branch: string | null;
    commit: string | null;
    environment: string | null;     // sandbox / uat / etc.

    triggeredBy: string | null;
    startedAt: string | null;       // ISO-8601
}
