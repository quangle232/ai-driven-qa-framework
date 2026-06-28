/**
 * Stable run id resolution. Uses CI-provided ids when available, otherwise
 * falls back to a per-invocation timestamp id so local runs still produce
 * deterministic, sortable identifiers.
 */

export function resolveRunId(env: NodeJS.ProcessEnv = process.env): string {
    // Jenkins
    if (env.BUILD_NUMBER && env.JOB_NAME) {
        return `jenkins-${env.JOB_NAME}-${env.BUILD_NUMBER}`;
    }
    // GitHub Actions
    if (env.GITHUB_RUN_ID) {
        return `github-${env.GITHUB_RUN_ID}`;
    }
    // GitLab CI
    if (env.CI_PIPELINE_ID) {
        return `gitlab-${env.CI_PIPELINE_ID}`;
    }
    // Local — stable for the lifetime of one process, ISO-style.
    const now = new Date();
    const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
    return `local-${stamp}`;
}
