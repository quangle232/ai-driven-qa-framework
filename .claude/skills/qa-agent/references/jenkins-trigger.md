# Triggering the Jenkins regression job by tag

qa-agent Phase 7 (execution) can run the tests on Jenkins CI instead of (or as well as)
locally. Because `tag == Jira label`, the Jira label taken from the user story
is exactly the value passed to the Jenkins job's `TAGS` parameter.

> The Jenkins **pipeline definition** now lives at
> `ci/jenkins/regression-pipeline`, alongside GitHub Actions + GitLab CI
> samples in `ci/` (see `ci/README.md`). This file is about *triggering* an
> already-configured Jenkins job at runtime.

## Script
`./scripts/trigger-jenkins.js <tag>` triggers the Jenkins `web-regression-job`
via the Jenkins Remote API (`buildWithParameters`), waits for the build, and
reports the result. No MCP is required — it is a plain `fetch` call.

```
node .claude/skills/qa-agent/scripts/trigger-jenkins.js @crm
node .claude/skills/qa-agent/scripts/trigger-jenkins.js @crm --env=test --folder=sample --branch=main
node .claude/skills/qa-agent/scripts/trigger-jenkins.js @crm --check     # auth/connectivity only
node .claude/skills/qa-agent/scripts/trigger-jenkins.js @crm --no-wait   # trigger, hand back build URL, exit fast
node .claude/skills/qa-agent/scripts/trigger-jenkins.js --status=<url>   # one-shot check of an existing build
```

Exit codes: `0` build SUCCESS / no-wait fired, `1` build not SUCCESS,
`2` config / trigger / usage error, `3` build IN_PROGRESS (from `--status`).

## When to use which mode (long-running builds)
The default mode triggers AND polls until the build finishes. For builds that
may run **> 10 minutes** — Claude Code's background-command cap — that loop
will be killed before completion and the result lost. Use the split flow:

1. `--no-wait` — trigger and exit fast (~30s, just long enough to capture the
   build URL). Prints the URL + a ready-to-run `--status=<url>` command.
2. `--status=<build-url>` — one-shot check (no polling loop). Returns
   `SUCCESS` / `FAILURE` / `IN_PROGRESS` (exit `0` / `1` / `3`) immediately.

This decouples "fire the build" from "see the result": the agent is free
between calls, and a one-hour build does not block the session.

## Configuration
Credentials are read from env vars, or from an `environments/.env.jenkins`
file. Keep real credentials out of git — use env vars or a credential store,
and gitignore the file (a throwaway local/demo token may be committed):

```
JENKINS_URL    e.g. http://localhost:8080
JENKINS_USER   Jenkins username
JENKINS_TOKEN  Jenkins API token (preferred) or password
JENKINS_JOB    job name (default: web-regression-job)
```

Prefer a Jenkins **API token** (Jenkins → your user → Security → API Token)
over the account password. The user needs Build permission on the job.

## How it works
1. `GET /me/api/json` — verify connectivity + auth.
2. `GET /crumbIssuer/api/json` — fetch the CSRF crumb (skipped if disabled).
3. `POST /job/<job>/buildWithParameters` with `TAGS`, `ENVIRONMENT`,
   `TEST_FOLDER`, `BRANCH` — returns a queue-item URL.
4. Poll the queue item until it becomes a running build.
5. Poll the build until `result` is set; exit 0 only on `SUCCESS`.

## Rules
- Triggering a build is an outward action — it runs CI and the pipeline emails
  the stakeholders. Confirm with the user before triggering a real build;
  `--check` (read-only) is always safe.
- Never hard-code Jenkins credentials in the script or any committed file.
- If Jenkins is unreachable, fall back to running Playwright locally
  (`--grep <tag>`) and report that CI was skipped.
