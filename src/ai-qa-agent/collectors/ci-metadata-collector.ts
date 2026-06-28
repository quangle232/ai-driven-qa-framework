/**
 * Normalize CI metadata across Jenkins, GitHub Actions, and GitLab CI.
 *
 * Reads env vars only — no shell calls. Falls back to `local` when none of the
 * provider-specific vars are set.
 */

import {
    CI_METADATA_SCHEMA_VERSION,
    type CiMetadata,
    type CiProvider,
} from "../schemas/ci-metadata.schema";
import { resolveRunId } from "../utils/run-id";

function detectProvider(env: NodeJS.ProcessEnv): CiProvider {
    const explicit = (env.CI_PROVIDER ?? "").trim().toLowerCase();
    if (explicit === "jenkins" || explicit === "github-actions" || explicit === "gitlab-ci" || explicit === "local") {
        return explicit;
    }
    if (env.JENKINS_URL || env.BUILD_NUMBER && env.JOB_NAME) return "jenkins";
    if (env.GITHUB_ACTIONS === "true") return "github-actions";
    if (env.GITLAB_CI === "true") return "gitlab-ci";
    return "local";
}

export function collectCiMetadata(env: NodeJS.ProcessEnv = process.env): CiMetadata {
    const provider = detectProvider(env);

    let runUrl: string | null = null;
    let jobName: string | null = null;
    let branch: string | null = null;
    let commit: string | null = null;
    let triggeredBy: string | null = null;

    switch (provider) {
        case "jenkins":
            runUrl = env.BUILD_URL ?? null;
            jobName = env.JOB_NAME ?? null;
            branch = env.GIT_BRANCH ?? env.BRANCH ?? null;
            commit = env.GIT_COMMIT ?? null;
            triggeredBy = env.BUILD_USER ?? env.CHANGE_AUTHOR ?? null;
            break;
        case "github-actions":
            runUrl = env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
                ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
                : null;
            jobName = env.GITHUB_WORKFLOW ?? null;
            branch = env.GITHUB_REF_NAME ?? null;
            commit = env.GITHUB_SHA ?? null;
            triggeredBy = env.GITHUB_ACTOR ?? null;
            break;
        case "gitlab-ci":
            runUrl = env.CI_PIPELINE_URL ?? null;
            jobName = env.CI_JOB_NAME ?? null;
            branch = env.CI_COMMIT_REF_NAME ?? null;
            commit = env.CI_COMMIT_SHA ?? null;
            triggeredBy = env.GITLAB_USER_LOGIN ?? null;
            break;
        case "local":
        default:
            jobName = "local";
            branch = env.GIT_BRANCH ?? null;
            commit = env.GIT_COMMIT ?? null;
            triggeredBy = env.USER ?? env.USERNAME ?? null;
            break;
    }

    return {
        schemaVersion: CI_METADATA_SCHEMA_VERSION,
        provider,
        runId: resolveRunId(env),
        runUrl,
        jobName,
        branch,
        commit,
        environment: env.test_env ?? env.ENVIRONMENT ?? null,
        triggeredBy,
        startedAt: new Date().toISOString(),
    };
}
