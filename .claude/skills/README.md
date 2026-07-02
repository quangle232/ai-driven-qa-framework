# Skills — ai-driven-qa-framework (Claude Code)

Auto-invocable entry points that drive this framework. **You don't run these manually** —
just describe what you want in natural language and Claude Code picks the matching skill by
its `description` trigger phrases (or type `/<skill-name>`). Each skill is a thin, focused
entry point that delegates to the **qa-agent** engine + references + the per-module
`conventions.md`/`memory/`, so behaviour stays consistent.

- **Where they live:** `.claude/skills/<name>/SKILL.md` (this dir). Codex uses the identical
  mirror at [`.agents/skills/`](../../.agents/skills/README.md) — same 22 skills, `.agents/` paths.
- **What they operate on:** the modules (`ui/ api/ mobile/ performance/`), the `aiqa:*` CLI,
  the 4 `aiqa-*` MCP servers, and Jira/Figma/Playwright/test-management MCPs.
- **Guardrails they respect:** single ActionKeyword/client layer, `tag == Jira label`,
  patch-guarded paths, human-approval loop, "leave the SUT clean". See
  [qa-agent/references/framework-conventions.md](qa-agent/references/framework-conventions.md).

## Catalogue (22 skills, by QA lifecycle)

### Onboard & connect
| Skill | What it does | Say / type |
|---|---|---|
| **setup** | Install deps + browsers, provision `.env` files, wire the auth stub, optional MCPs, health check. | "set up", "onboard", "get started" |
| **mcp-setup** | Add + authorize the MCPs the agent needs (Jira/Figma/Playwright/TestRail + `aiqa-*`). | "set up MCP", "Jira MCP not reachable" |
| **ci-setup** | Activate a CI pipeline from the `ci/` samples (Jenkins · GitHub Actions · GitLab) with per-surface slices. | "set up CI", "add GitHub Actions" |
| **new-module** | Scaffold a NEW testing-surface module with the standard anatomy (config, alias, tags, scripts). | "add a new module / test surface" |

### Design test cases
| Skill | What it does | Say / type |
|---|---|---|
| **user-story-test** | Full end-to-end flow from a Jira story: design → approve → publish → generate + run → report. | "test EAST-123", "qa this story" |
| **create-test-cases** | The DESIGN half only — canonical-JSON cases + review table, stops at human approval. | "design test cases for this AC" |
| **explore-app** | Explore the live SUT (Playwright MCP) → real selectors/routes → navigation memory. | "explore the app", "map the SUT" |
| **coverage-gap** | Map specs/cases vs Jira AC + labels → list uncovered AC, untagged specs, surfaces/P0 with no tests. | "coverage gap", "what's not tested" |
| **data-factory** | Typed, deterministic factories + seed/teardown data via API/gRPC; leaves the SUT clean. | "seed test data", "create fixtures" |

### Automate
| Skill | What it does | Say / type |
|---|---|---|
| **automation-generate** | Generate convention-compliant Playwright code from cases (UI/API/gRPC/GraphQL/perf); anti-duplication. | "generate automation", "write the spec" |
| **scaffold-screen** | Quick-scaffold ONE object layer (Page Object / service / gRPC client / GraphQL ops / mobile screen). | "scaffold a page object for <screen>" |
| **visual-regression** | Playwright screenshot baselines + diff triage (mask/threshold), per-device; `@visual`. | "visual regression", "screenshot test" |

### Run & report
| Skill | What it does | Say / type |
|---|---|---|
| **run-tests** | Pick the right module config + markers + env, apply shared-SUT discipline, run, hand off to report. | "run smoke", "run the api tests on test" |
| **read-report** | Parse `test-output`, cluster + root-cause failures with fixes, stakeholder summary + Allure. | "read the report", "why did tests fail" |
| **qa-status** | One-page QA health/standup: pass-rate, flaky, coverage, open bugs + the one thing to fix first. | "qa status", "test health", "standup" |

### Triage & fix
| Skill | What it does | Say / type |
|---|---|---|
| **review-code** | Strict review against framework conventions + the deterministic `aiqa:guard`. | "review my code", "is this compliant" |
| **fix-test** | Repair test-side breakage (selector/wait/data) — never weakens asserts, skips, or auto-heals. | "fix this test", "the spec is broken" |
| **flaky-triage** | Separate flakes from real defects via run history + reruns; quarantine + record; never bugs a flake. | "flaky tests", "flake or real bug?" |
| **create-bug** | File a Jira Bug on-demand for a confirmed defect — deduped, evidence-backed, linked to the story. | "create a bug", "log this defect" |

### Publish & maintain
| Skill | What it does | Say / type |
|---|---|---|
| **publish-testcases** | Publish approved canonical-JSON cases to Excel · Xray · TestRail; attach to Jira; sync statuses. | "publish to Xray/TestRail", "export to Excel" |
| **update-conventions** | Audit docs ↔ code drift + `.claude`/`.agents` mirror parity; fix the docs. | "audit conventions", "sync docs with code" |

### Engine
| Skill | What it does |
|---|---|
| **qa-agent** | The underlying AI-QA engine (parse AC → design → enrich → approve → publish → generate → run → report). The skills above are focused entry points into it; use directly for the full workflow. |
