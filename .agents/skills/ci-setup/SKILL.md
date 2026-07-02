---
name: ci-setup
description: Wire a CI pipeline from the framework's ci/ samples. Use for "set up CI", "add GitHub Actions / GitLab CI / Jenkins", "wire the pipeline". Copies a sample to its active location, sets up secrets guidance + per-surface slices, and keeps the AI-QA report step.
---

# ci-setup — activate a CI provider from ci/ samples

The `ci/` folder holds ready samples; this activates one. See `ci/README.md`.

## Activate (ask which provider)
- **GitHub Actions** → `cp ci/github-actions/*.yml .github/workflows/` (regression + pr-smoke).
- **GitLab CI** → `cp ci/gitlab/.gitlab-ci.yml .gitlab-ci.yml` (repo root).
- **Jenkins** → point a Pipeline job at `ci/jenkins/regression-pipeline` (Pipeline script from SCM).

## Configure
- **Secrets/vars** (never commit): `AUTH_URL`, `APP_URL`, `APP_USER`, `APP_PASS`;
  optional `JIRA_URL/JIRA_EMAIL/JIRA_TOKEN/JIRA_PROJECT`, `ANTHROPIC_API_KEY`,
  and (mobile/perf) `DEVICE_GRID`/grid creds.
- **Slices**: `--grep "@regression"` (all surfaces) or per-surface (`@ui`/`@api`/`@grpc`/`@graphql`/
  `@mobile-web`); native-mobile needs a device farm; add a perf job (`perf:k6`/`perf:jmeter`).
- Keep the canonical flow: install → `playwright install` → run → **`yarn report:all`** (AI-QA) → artifacts.
  Env via `test_env` (dev|test|prod).

## Rules
- `.github/` is patch-guarded — confirm before writing there. Put real secrets in the CI secret store,
  never in the yaml. Mirror the same commands across providers so results stay comparable.
