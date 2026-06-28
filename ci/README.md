# CI samples — Jenkins · GitHub Actions · GitLab CI

Sample, **provider-agnostic** CI pipelines for this framework. All three run the
*same* Playwright suite, produce the *same* artifacts, and feed the *same* AI QA
Agent report pipeline — so you can pick a provider (or align a generated one)
without re-learning the contract.

> **These are samples.** Each file is inert where it sits. Copy it to the
> provider's active location to switch it on (table below). The whole `ci/` tree
> is also write-protected from generated patches
> (`src/ai-qa-agent/analyzers/patch-guard.ts`).

| Provider | Sample file | Activate by | Triggers in the sample |
|---|---|---|---|
| **Jenkins** | [`ci/jenkins/regression-pipeline`](jenkins/regression-pipeline) | Point a Pipeline job at it (*Pipeline script from SCM*) | Parameterised manual build |
| **GitHub Actions** | [`ci/github-actions/regression.yml`](github-actions/regression.yml) · [`pr-smoke.yml`](github-actions/pr-smoke.yml) | `cp ci/github-actions/*.yml .github/workflows/` | `workflow_dispatch` (+ optional nightly) · PR smoke |
| **GitLab CI** | [`ci/gitlab/.gitlab-ci.yml`](gitlab/.gitlab-ci.yml) | `cp ci/gitlab/.gitlab-ci.yml .gitlab-ci.yml` | schedule / web / default-branch · MR smoke |

## The contract every pipeline follows

1. **Install** — `yarn install --frozen-lockfile` + `npx playwright install --with-deps chromium`
   (only the `WEB CHROME` project is enabled in `config/playwright.config.ts`).
2. **Provision env** — write `environments/.env.<env>` from CI secrets
   (`AUTH_URL`, `APP_URL`, `APP_USER`, `APP_PASS` — see `environments/.env.example`).
   `.env.*` is gitignored, so CI must create it.
3. **Run the canonical command:**
   ```bash
   npx cross-env test_env=<env> playwright test -c config/playwright.config.ts \
     --grep "<tags>" [--grep-invert "@bugs"] --workers=<n> --retries=<n>
   ```
4. **Run the AI-QA report pipeline** (always, even on failure): `yarn report:all`
   → writes `test-output/ai/` (`ci-summary.md`, `diagnosis.md`, `test-report.html`,
   bug reports). Deterministic without `ANTHROPIC_API_KEY`; LLM diagnosis when set.
5. **Publish the summary** — GitHub: `test-output/ai/ci-summary.md` → `$GITHUB_STEP_SUMMARY`;
   Jenkins: HTML stats e-mail; GitLab: job log + artifact.
6. **Upload artifacts** — `test-output/html`, `test-output/ai`,
   `test-output/allure-results`, `test-output/playwright-report.json`.

## How the samples align with the AI QA Agent

`CI_PROVIDER` is **auto-detected**, but each sample sets it explicitly. The
normaliser in [`src/ai-qa-agent/collectors/ci-metadata-collector.ts`](../src/ai-qa-agent/collectors/ci-metadata-collector.ts)
reads these per-provider env vars (all auto-set by the platform except where noted):

| `CI_PROVIDER` | Run URL | Job | Branch | Commit | Triggered by |
|---|---|---|---|---|---|
| `jenkins` | `BUILD_URL` | `JOB_NAME` | `GIT_BRANCH`/`BRANCH` | `GIT_COMMIT` | `BUILD_USER` |
| `github-actions` | `GITHUB_SERVER_URL`+`GITHUB_REPOSITORY`+`GITHUB_RUN_ID` | `GITHUB_WORKFLOW` | `GITHUB_REF_NAME` | `GITHUB_SHA` | `GITHUB_ACTOR` |
| `gitlab-ci` | `CI_PIPELINE_URL` | `CI_JOB_NAME` | `CI_COMMIT_REF_NAME` | `CI_COMMIT_SHA` | `GITLAB_USER_LOGIN` |

The environment slug (`dev`/`test`/`prod`) comes from `test_env` (or `ENVIRONMENT`).
The valid `CI_PROVIDER` values are the `CiProvider` union in
[`schemas/ci-metadata.schema.ts`](../src/ai-qa-agent/schemas/ci-metadata.schema.ts):
`jenkins | github-actions | gitlab-ci | local`.

## Secrets / variables

| Key | Purpose | Required |
|---|---|---|
| `AUTH_URL`, `APP_URL`, `APP_USER`, `APP_PASS` | SUT sign-in (`environments/.env.example`) | yes |
| `JIRA_URL`, `JIRA_EMAIL`, `JIRA_TOKEN`, `JIRA_PROJECT` | failure → Bug auto-reporter (`helper/jira-bug-reporter.ts`) | optional |
| `ANTHROPIC_API_KEY` | LLM root-cause diagnosis in `yarn report:all` | optional |

GitHub → repo *Secrets*; GitLab → *CI/CD Variables* (mark Masked); Jenkins →
credential store (the sample inlines a demo token with a TODO to migrate). Never
commit real credentials.

## Operating discipline baked into the samples

From [`docs/ai/LESSONS-LEARNED.md`](../docs/ai/LESSONS-LEARNED.md):

- **Shared/demo SUT → `--workers=1`.** One server-side session; parallel workers
  race and hang. Samples default `WORKERS=1` (Jenkins exposes a `WORKERS` param).
- **`--retries=2`** so count/reconciliation flakes self-heal.
- **Green slice = `--grep-invert "@bugs"`.** `@bugs` tests assert
  currently-broken behaviour (expected to fail); exclude them for a clean pass.
- **Tags map 1:1:** `@regression` (full suite), `@smoke` (PR/MR gate), the
  feature tag `== Jira label`. `tag` is the same value across Jira labels,
  Playwright `--grep`, the Jenkins `TAGS` param, and these workflows.

## Testing surfaces (UI · API · gRPC · mobile)

All sample pipelines run `--grep "@regression"`, which already includes the API,
gRPC, and mobile-web specs (they carry `@regression`). To run a single surface,
override the `tags` input / `TAGS` param:

- `@api` / `@grpc` — mock-backed, no backend needed (passes in CI out of the box).
- `@mobile-web` — Playwright device emulation; needs the SUT like the web suite.
- `@mobile-native` — Appium; **needs a device farm** (BrowserStack/Sauce or a
  self-hosted emulator + Appium server) and `ALLOW_MOBILE_NATIVE=1`. Wire it as a
  separate job with `DEVICE_GRID` + creds; it is skip-gated otherwise.

Example fast backend-only gate: set the GitHub Actions `tags` input (or Jenkins
`TAGS`) to `@api|@grpc`.

## Trigger Jenkins from the qa-agent

Separate from these pipeline *definitions*, the qa-agent can fire the Jenkins job
by tag at runtime via `.claude/skills/qa-agent/scripts/trigger-jenkins.js`
(see the skill's `references/jenkins-trigger.md`).
