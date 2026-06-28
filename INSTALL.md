# Installing AI QA Agent in your product repo

This is a starter test framework. You take the whole repo (or copy the
listed dirs into an existing one) and fill in 4 product-specific stubs.
The framework itself stays untouched — your customisations live in
`helper/authenticate-set-up.ts`, `environments/`, `tests/`,
`page-objects/`, `test-data/`, and `.aiqa-memory/`.

Two scenarios:

- **A. Fresh test repo** — clone this repo as your test suite. Most teams do this.
- **B. Merge into existing Playwright repo** — copy specific dirs/files. Use this if you already have specs you want to keep.

---

## Scenario A — Fresh test repo (recommended)

### 1. Clone

```bash
git clone <this-repo-url> my-product-tests
cd my-product-tests
yarn install
npx playwright install --with-deps
```

### 2. Bootstrap environment files

```bash
yarn aiqa:init-project \
  --env=test \
  --app-url=https://app.example.com \
  --auth-url=https://auth.example.com/signin
```

Optional — wire Jira:

```bash
yarn aiqa:init-project \
  --env=test \
  --app-url=https://app.example.com \
  --jira-url=https://your-org.atlassian.net \
  --jira-project=PROJ
```

This creates `environments/.env.test` (and `environments/.env.jira` if
you passed Jira flags) from the templates. Open them and fill in any
credentials by hand:

```
# environments/.env.jira
JIRA_EMAIL=you@example.com
JIRA_TOKEN=<your-atlassian-api-token>
```

### 3. Fill in the login flow

`helper/authenticate-set-up.ts` ships with a stub. Open it, find the
`// TODO` block, replace with your product's actual sign-in flow.

The framework runs this **once** at the start of every test session and
saves a `.auth/storage-state.json` that all parallel workers reuse — no
per-test login.

### 4. Add feature tags

Open `helper/test-tags.ts`. Add one entry per feature your product has —
the tag value must equal the Jira label you use for that feature:

```ts
export const TAGS = {
    REGRESSION: "@regression",
    SMOKE: "@smoke",
    P0: "@P0", P1: "@P1", P2: "@P2",
    BUG: "@bugs",

    // ─── your features below ───
    AUTH: "@auth",
    CHECKOUT: "@checkout",
    DASHBOARD: "@dashboard",
} as const;
```

### 5. Health check

```bash
yarn aiqa:doctor
```

This verifies Node version, deps, env file, auth stub customisation, tags,
Playwright browsers, and the MCP servers. Fix any `✗` lines before
continuing.

### 6. Generate your first test from manual test cases

Create `test-cases/login.md`:

```markdown
---
feature: Login
jiraStoryKey: PROJ-42
tags: ["@regression", "@auth", "@P0"]
---

| TC ID | Summary | Pre-condition | Steps | Expected | Pr. |
|---|---|---|---|---|---|
| TC-1 | Valid login lands on dashboard | User has valid credentials | 1. Open login page\n2. Enter email\n3. Enter password\n4. Click submit | Dashboard heading "Welcome" appears | P0 |
| TC-2 | Invalid password shows error | User has an account | 1. Open login\n2. Enter wrong password\n3. Submit | Toast "Invalid credentials" appears | P1 |
```

Two ways to generate the code:

**Mode A — inside Claude Code (no API key, recommended).** Tell Claude
Code: "Generate code from `test-cases/login.md` following framework
conventions". Claude Code reads `yarn aiqa:scan --prompt`, writes the
spec + page object, runs `yarn aiqa:guard --files=...` on its own output.

**Mode B — autonomous LLM (needs `ANTHROPIC_API_KEY`).**

```bash
export ANTHROPIC_API_KEY=sk-ant-...
yarn aiqa:generate-automation --test-cases=test-cases/login.md
# review test-output/ai/patches/login/
yarn aiqa:generate-automation --test-cases=test-cases/login.md --apply
```

Either way the safety gate ([patch-guard](src/ai-qa-agent/analyzers/patch-guard.ts))
refuses to write anything that violates framework conventions (wrong
import, hard waits, missing `TAGS.REGRESSION`, etc.).

### 7. Delete the sample (when ready)

The starter ships `tests/sample/`, `page-objects/sample/`, and
`test-data/sample-data.ts` as a working example. Once you have your own
specs, you can remove them:

```bash
rm -rf tests/sample page-objects/sample test-data/sample-data.ts
```

### 8. Run + report

```bash
# One command — playwright + watcher + critical-scanner + auto-report:
yarn aiqa:run-regression

# Or pieces individually:
yarn test:test                              # just Playwright
yarn aiqa:collect && yarn aiqa:diagnose     # post-run analysis
yarn aiqa:report:html                       # stakeholder HTML
```

Open `test-output/ai/stakeholder-report.html` in a browser — share with
PM/BO.

---

## Scenario B — Merge into existing Playwright repo

If you already have Playwright + specs and just want to layer AI QA Agent
on top:

### Copy these dirs verbatim

```
src/ai-qa-agent/      ← all of the framework
mcp/                  ← MCP servers
tsconfig.aiqa.json    ← separate typecheck scope
```

### Copy these helper files (rename / merge as needed)

```
helper/test.ts                 ← framework-wide failure → Jira-bug auto-fixture
helper/jira-bug-reporter.ts
helper/jira-story.ts
helper/test-tags.ts            ← tag catalogue; merge with yours
```

### Merge package.json

Add the `aiqa:*` scripts and these `devDependencies`:

```json
{
  "devDependencies": {
    "@anthropic-ai/sdk": "^0.98.0",
    "@modelcontextprotocol/sdk": "^1.29.0",
    "chokidar": "^3.6.0",
    "concurrently": "^9.1.0",
    "tsx": "^4.19.2",
    "zod": "^3.25"
  }
}
```

Copy the `aiqa:*` lines from this repo's `package.json`.

### Merge .gitignore

```
/test-output/
/test-output/ai/
.aiqa-cache/
.auth/
```

### Verify

```bash
yarn aiqa:doctor
yarn aiqa:scan        # should index your existing POMs + specs
yarn aiqa:mcp:list    # should show 4 servers / 25 tools
```

### Update your existing specs

Every spec needs to import `{ test, expect }` from `helper/test` (not
`@playwright/test`) for the failure → Jira-bug auto-fixture to apply.
The patch-guard catches missing imports — run `yarn aiqa:guard` to
inventory which specs need to be migrated.

---

## Hooking into Claude Code / Cursor

```bash
yarn aiqa:mcp:config --out=.claude/mcp.json     # for Claude Code
yarn aiqa:mcp:config --out=.cursor/mcp.json     # for Cursor
```

Restart the editor. The four MCP servers (`aiqa-qa-report`,
`aiqa-framework-context`, `aiqa-memory`, `aiqa-test-runner`) appear with
25 tools total. See [mcp/README.md](mcp/README.md) for the full tool
catalogue.

In Claude Code, you can now ask:

- "What failed in the last run?" → calls `aiqa.qa.get_failure_clusters`
- "What conventions does this framework follow?" → `aiqa.fw.get_conventions`
- "Has this failure happened before?" → `aiqa.mem.match_known_issues`
- "List @regression tests for the auth feature" → `aiqa.run.list_available_tests`

---

## Adding domain knowledge

Curated team memory lives under `.aiqa-memory/`:

| File | What goes here | When to edit |
|---|---|---|
| `domain-glossary.json` | Project terms (e.g. "Offer", "B2B flow") + plain-English definitions | Day 1 — 10–30 terms is enough |
| `known-issues.json` | Tracked bugs / quirks with `affects` filters | Whenever the team finds a stable defect |
| `failure-patterns.json` | Fingerprints + how the team resolved them | After fixing a recurring failure |
| `flaky-history.json` | Per-test flake counts | Auto-populated by the framework |

Two ways to write to memory:

- **Hand-edit the JSON files.** Simplest. They're designed for this.
- **Via the agent.** Set `AIQA_ALLOW_MEMORY_WRITE=true` and ask Claude
  Code (or any MCP client) to call `aiqa.mem.add_known_issue` /
  `aiqa.mem.add_glossary_term` / `aiqa.mem.annotate_failure_pattern`.

---

## Adding your own project MCP server

The framework provides 4 generic servers. Your domain isn't generic. Drop
a project-specific server next to them — see the "Project-MCP extension
point" section in [mcp/README.md](mcp/README.md).

---

## CI integration

The framework's Jenkins pipeline (`ci/jenkins/regression-pipeline`) stays
exactly as it is — the AI QA Agent's post-run analysis is opt-in. To add
it, append this to the pipeline's `post { always { ... } }` block:

```groovy
sh '''
  yarn aiqa:collect
  yarn aiqa:diagnose
  yarn aiqa:finalize
  yarn aiqa:report:html
'''
archiveArtifacts artifacts: 'test-output/ai/**/*', allowEmptyArchive: true
```

For **GitHub Actions** and **GitLab CI**, ready-to-copy samples live in
[`ci/`](ci/README.md): `ci/github-actions/regression.yml` (+ `pr-smoke.yml`)
and `ci/gitlab/.gitlab-ci.yml`. They already run those four commands via
`yarn report:all` in an `if: always()` / always-run block and set `CI_PROVIDER`
explicitly (it is also auto-detected via env vars). Copy a sample to its active
location (`.github/workflows/` or repo-root `.gitlab-ci.yml`) to switch it on —
see `ci/README.md` for the cross-provider contract.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `yarn aiqa:doctor` says `auth-setup ⚠` | `helper/authenticate-set-up.ts` still has the example URLs | Replace the TODO block with your sign-in flow |
| `yarn aiqa:doctor` says `env-file ✗` | `environments/.env.test` missing | `yarn aiqa:init-project --env=test --app-url=...` |
| `yarn aiqa:generate-automation` says `provider=noop` | `ANTHROPIC_API_KEY` not set | Either set the key, or use Claude Code interactively (Mode A) |
| Spec runs but no Jira bug created on failure | `environments/.env.jira` missing or wrong creds | Re-init with `--jira-url=... --jira-project=...` + fill in `JIRA_EMAIL` + `JIRA_TOKEN` |
| `yarn aiqa:guard` rejects a generated spec | LLM produced non-conforming code | Either fix the file manually, or re-run `aiqa:generate-automation` (the builder has the reviewer in the loop) |
| MCP server won't start in Claude Code | `@modelcontextprotocol/sdk` not installed | `yarn install` then restart the editor |

---

## Reference

- [README.md](README.md) — framework overview
- [src/ai-qa-agent/README.md](src/ai-qa-agent/README.md) — agent architecture, modes, guardrails
- [mcp/README.md](mcp/README.md) — MCP servers + project-extension convention
- [helper/](helper/) — single-keyword layer, auth, Jira reporter
- [ci/README.md](ci/README.md) — CI samples (Jenkins · GitHub Actions · GitLab CI) + the cross-provider contract
- [ci/jenkins/regression-pipeline](ci/jenkins/regression-pipeline) — declarative pipeline (params, allure, email)
