# AI-Driven QA Framework

A reusable starter kit for a UI test-automation suite — **Playwright +
TypeScript**, Page Object Model, a single ActionKeyword layer, a
framework-wide failure → Jira-bug auto-reporter, and an **AI QA Agent
layer** that generates Playwright code from test cases, scans failures
during runs, and exposes its data to any LLM client (Claude Code,
Cursor, …) via MCP servers.

Clone this repo, fill in three or four project-specific files (login flow,
env URLs, Jira credentials), and you have a CI-ready test suite for any web
app.

**New in 0.2** (see [CHANGELOG.md](CHANGELOG.md)):
- **[CLAUDE.md](CLAUDE.md)** — auto-loaded guide so any LLM understands the project on day one.
- **[.mcp.json](.mcp.json)** — the 4 AI-QA MCP servers wired for Claude Code (read-only by
  default) so the LLM queries compact JSON instead of parsing files — cheaper LLM runs.
- **`yarn report:bugs`** — regression (HTML) + bug (HTML/MD/DOCX) reports for stakeholders.
- **[docs/ai/LESSONS-LEARNED.md](docs/ai/LESSONS-LEARNED.md)** — the QA playbook distilled
  from real engagements (read this before testing a shared/demo SUT).

**To migrate this framework into your product, read [INSTALL.md](INSTALL.md).**

---

## What you get out of the box

| | |
|---|---|
| 🔐 **Login once, reuse everywhere** | One headless sign-in in `global-setup`, saved `storageState` reused by every test & every parallel worker — no per-test login, no daily rate-limit pain. Headed only when you need 2FA. |
| 📦 **Page Object Model** | `BasePage` + per-screen classes. Locators grouped, methods call `ActionKeyword` only. UI change → fix in one class. |
| ⚙️ **Single ActionKeyword layer** | The only file that touches the Playwright API. Async-safe getters, self-healing locators (`data-zcqa` → `data-test-id` → `data-id` → `data-title`), iframe helpers, reload-poll. |
| 🪶 **Stakeholder-friendly errors** | Raw Playwright timeouts → `"Step failed: could not click option \"X\" — not visible within 15s"`. Selector kept as a debug hint on a second line. |
| 🐞 **Auto bug on FINAL failure** | A test that fails ALL retries triggers a Jira Bug, linked to the parent user story (`setJiraStory(...)`). Search-first dedupe → no spam, reuses existing OPEN bugs across runs. Flaky tests (passed-on-retry) never create a bug. |
| ⚡ **Parallel execution** | `--workers 1–10`. Workers share `storageState`. Build time drops 5–10×. |
| 👻 **Headless by default** | CI runs headless; `HEADED` flips to headed for debugging. |
| 🎞️ **Trace · video · screenshot** | Playwright auto-retains all three on failure → `trace.zip` opens in the Inspector for time-travel debugging. |
| 🌐 **Multi-environment** | `cross-env test_env=dev\|test\|prod` + `dotenv` (resolver in `core/load-env.ts`; default `test`). Same suite, any env. |
| 🏗️ **CI pipelines (3 providers)** | Ready-to-copy samples for **Jenkins · GitHub Actions · GitLab CI** in [`ci/`](ci/README.md) — same canonical Playwright command, same artifacts, same `yarn report:all` AI-QA pipeline. Jenkins is a parameterised declarative pipeline (`BRANCH`, `TAGS`, `ENVIRONMENT`, `INVERT_BUGS`, `REFRESH_STORAGE`, `RETRIES`, `WORKERS`, `HEADED`; Allure + artifact archive + HTML stats e-mail). |
| 🏷️ **Tag-based trigger** | `trigger-jenkins.js <tag>` fires the regression job by tag (== Jira label) from PR / CI / qa-agent. `--no-wait` + `--status` for long builds. |
| 📧 **E-mail + Allure** | Per-build HTML summary mailed to stakeholders, plus the per-build Allure report. |
| 🤖 **qa-agent AI skill** | `.claude/skills/qa-agent/` for Claude and `.agents/skills/qa-agent/` for Codex — given a Jira `user_story_key`, generate manual + automation test cases, generate Playwright code in this framework's conventions, run + report. Status-gated, search-then-reuse Jira bug dedupe, 3 sub-tasks on completion. |
| 🧠 **AI QA Agent runtime** | `src/ai-qa-agent/` — deterministic watcher + failure clustering + LLM-backed diagnosis (bounded recursive loops) + stakeholder HTML report. `yarn aiqa:run-regression` runs Playwright + a live failure scanner sub-agent + auto-generates a self-contained HTML report for PM/BO. See [src/ai-qa-agent/README.md](src/ai-qa-agent/README.md). |
| 🔌 **MCP servers** | `mcp/` — 4 read-only servers (qa-report, framework-context, memory, test-runner) exposing 25 tools so Claude Code / Cursor / Windsurf can query the framework directly. Memory persists known issues / flaky history / domain glossary for the LLM to recall. See [mcp/README.md](mcp/README.md). |
| 🧪 **API · gRPC · mobile testing** | Beyond UI: REST (Service-Object Model + zod validation + MSW & Express/Prism mocks), gRPC (sample casino proto with all RPC types + in-process mock server), and mobile (Appium native + Playwright mobile-web, parallel drivers). All on the **one** Playwright runner → same Allure / Jira-bug / AI-QA / CI pipeline. See [api/](api/README.md), [api/grpc/](api/grpc/README.md), [mobile/](mobile/README.md). |
| 🛡️ **Patch-guard** | `yarn aiqa:guard` — deterministic safety gate that refuses generated code violating framework conventions (wrong import, hard waits, missing `TAGS.REGRESSION`, raw `this.page.click`, hardcoded secrets, path traversal). Runs automatically on every `aiqa:generate-automation --apply`. |

---

## 5-minute setup for a new project

1. **Clone & install**
   ```bash
   git clone <this-repo> my-test-suite
   cd my-test-suite
   yarn install
   npx playwright install --with-deps
   ```

2. **Fill in the SUT login** — `ui/helpers/authenticate-set-up.ts` is a stub
   with a marked TODO block. Replace it with your app's sign-in flow.

3. **Set per-env values** — copy the template and edit:
   ```bash
   cp environments/.env.test.example environments/.env.test
   # AUTH_URL=, APP_URL=, APP_USER=, APP_PASS=, ...
   ```

4. **(Optional) Wire Jira** — for the failure → bug reporter:
   ```bash
   cp environments/.env.jira.example environments/.env.jira
   # JIRA_URL=, JIRA_EMAIL=, JIRA_TOKEN=, JIRA_PROJECT=
   ```

5. **Write your first spec** — copy `ui/tests/sample.spec.ts` and
   `ui/page-objects/sample/sample-page.ts`, adapt to your screens, then:
   ```bash
   yarn test:test
   ```

---

## Repository layout

```
core/          Shared: env resolver, test-tags, base test (Jira-bug fixture), jira reporter (@core/*).
ui/            Playwright web module — ui/page-objects/ helpers/ tests/ ui/test-data/ + api-support (ui/README.md).
api/           Playwright-free API testing — rest/ (axios) · grpc/ · graphql/ (api/README.md).
mobile/        Appium native + Playwright mobile-web (mobile/README.md).
performance/   Load/perf — k6 (primary) + JMeter sample (performance/README.md).
config/        playwright.base.ts + root config; each module has its own playwright.config.ts.
environments/  .env.example + per-env + .env.jira.example.
ci/            Sample CI pipelines (jenkins/, github-actions/, gitlab/) — see ci/README.md.
docs/          Architecture / execution-flow / capabilities diagrams (HTML
               + PNG for slides). docs/ai/ tracks qa-agent progress.
.claude/       Claude qa-agent skill (SKILL.md, references/, examples/, scripts/).
.agents/       Codex qa-agent skill (SKILL.md, references/, examples/, scripts/).
```

---

## Where to extend

| Task | File |
|------|------|
| Your app's login flow | `ui/helpers/authenticate-set-up.ts` (TODO block) |
| Per-env URLs / creds | `environments/.env.<env>` |
| Jira credentials | `environments/.env.jira` (gitignored / not committed for real projects) |
| Feature tags | `core/test-tags.ts` (add one tag per Jira label) |
| Custom Playwright wrappers | `ui/helpers/action-keywords.ts` (single keyword layer) |
| Page objects | `ui/page-objects/<feature>/<screen>-page.ts` |
| Specs | `<module>/tests/<feature>.spec.ts` (import `test` from `@core/test`) |
| Claude qa-agent conventions | `.claude/skills/qa-agent/references/framework-conventions.md` |
| Codex qa-agent conventions | `.agents/skills/qa-agent/references/framework-conventions.md` |

---

## AI QA Agent commands (quick reference)

| Command | What it does |
|---|---|
| `yarn aiqa:doctor` | Health-check the install (Node, deps, env, auth stub, tags, MCP). |
| `yarn aiqa:init-project --env=test --app-url=…` | Scaffold `.env.<env>` + seed `.aiqa-memory/`. |
| `yarn aiqa:scan` / `--prompt` | Index existing POMs / specs / tags / keywords. The LLM reads this before generating code. |
| `yarn aiqa:generate-automation --test-cases=<file>` | Generate Playwright code from manual test cases. Add `--apply` to write to disk. |
| `yarn aiqa:guard` / `--files=…` | Deterministic safety gate — accept/reject per file. |
| `yarn aiqa:run-regression` | Spawn Playwright + watcher + critical-scanner sub-agent + auto-generate the stakeholder HTML report. |
| `yarn aiqa:diagnose` | Cluster failures + LLM-classify each cluster (uses Claude if `ANTHROPIC_API_KEY` set; otherwise deterministic). |
| `yarn aiqa:report:html` | Stakeholder HTML — single self-contained file for PM/BO. |
| `yarn aiqa:mcp:list` / `:config` / `:start` | List MCP servers, generate Claude Code / Cursor config snippet, start a server on stdio. |

Full migration / setup guide: **[INSTALL.md](INSTALL.md)**.

---

## Skills — drive the framework in plain language

23 auto-invocable skills ship for **both Claude Code** (`.claude/skills/`) and **Codex**
(`.agents/skills/`) — identical, mirror-verified. You don't run them by hand: describe what
you want and the tool picks the matching skill by its trigger phrases (or type `/<name>`).
Each is a focused entry point into the **qa-agent** engine + per-module conventions.
Full catalogue: **[.claude/skills/README.md](.claude/skills/README.md)**.

| Skill | Module / scope | Feature | Does | Short description |
|---|---|---|---|---|
| `setup` | All | Onboard | Onboard the framework | Install deps + browsers, provision `.env` files, wire the auth stub, optional MCPs, run health check |
| `mcp-setup` | MCP | Onboard | Connect MCP servers | Add + authorize Jira/Figma/Playwright/TestRail + the 4 built-in `aiqa-*` servers |
| `ci-setup` | CI | Onboard | Wire a CI pipeline | Activate a `ci/` sample (Jenkins · GitHub Actions · GitLab) with per-surface slices |
| `new-module` | Framework | Onboard | Scaffold a new surface | Add a new testing module with the standard anatomy (config, alias, tags, scripts) |
| `user-story-test` | All | Full flow | End-to-end from a Jira story | Design → approve → publish → generate + run → report (surface-routed) |
| `create-test-cases` | All | Design | Design test cases | Canonical-JSON cases + review table; stops at human approval (no code) |
| `explore-app` | UI | Design | Map the live SUT | Discover real selectors/routes via Playwright MCP → navigation memory |
| `coverage-gap` | All | Design | Find coverage gaps | Specs/cases vs Jira AC + labels → uncovered AC, untagged specs, P0 holes |
| `data-factory` | API · UI | Design | Seed test data | Typed deterministic factories + seed/teardown via API/gRPC; leaves the SUT clean |
| `automation-generate` | All | Automate | Generate automation code | Cases → convention-compliant code (UI/API/gRPC/GraphQL/perf); anti-duplication |
| `scaffold-screen` | All | Automate | Scaffold one object layer | One Page Object / API service / gRPC client / GraphQL ops / mobile screen |
| `visual-regression` | UI | Automate | Add screenshot tests | Baselines + diff triage (mask/threshold), per-device; `@visual` |
| `run-tests` | All | Run | Run a test slice | Pick module config + markers + env, apply shared-SUT discipline, then report |
| `read-report` | All | Report | Analyze the last run | Cluster + root-cause failures with fixes; stakeholder summary + Allure |
| `qa-status` | All | Report | One-page QA health | Pass-rate, flaky, coverage, open bugs + the one thing to fix first |
| `review-code` | All | Triage | Review vs conventions | Single-layer rule, tags, no hard waits, anti-dup, schema; runs `aiqa:guard` |
| `fix-test` | All | Triage | Repair a broken test | Fix test-side breakage (selector/wait/data) — never weakens asserts or auto-heals |
| `flaky-triage` | All | Triage | Triage flaky tests | Flake vs real bug via run history + reruns; quarantine + record; never bugs a flake |
| `create-bug` | All | Triage | File a Jira bug | Confirmed defect only — deduped, evidence-backed, linked to the story |
| `publish-testcases` | All | Publish | Publish approved cases | Export to Excel · Xray · TestRail; attach to Jira; sync statuses after runs |
| `update-conventions` | Framework | Maintain | Audit docs ↔ code | Drift check + `.claude`/`.agents` mirror parity; fixes the docs |
| `qa-agent` | All | Engine | The AI-QA engine | parse AC → design → enrich → approve → publish → generate → headless run + 5/5 stress → review → auto branch+MR → report |
| `gen-auto-test` | UI · API | Engine | Manual cases → automation | Pasted steps / .xlsx / .md / .json → normalized cases; missing steps discovered on the live app; shared code-gen engine, stress + ship gates — no Jira story required |

*Module / scope:* **All** = works across `ui/ api/ mobile/ performance/`; **Framework** = maintainer/scaffolding; **CI**/**MCP** = infra. Everything runs on the `yarn aiqa:*` CLI + the `aiqa-*` MCP servers, respecting the single-keyword-layer rule, `tag == Jira label`, patch-guarded paths, the human-approval loop, and "leave the SUT clean".

---

## License

MIT.
