# Contributing to AI QA Agent

This document is for **extending the framework itself** — adding agents,
adding MCP tools, modifying the convention, updating the safety gate.

If you only want to **use** the framework in a product test suite, read
[INSTALL.md](INSTALL.md) instead.

---

## Layout

```
src/ai-qa-agent/        ← framework engine. Strict-mode TS. Project-agnostic.
  agents/               ← LLM agents (recursive runner, diagnosis, builder, planning)
  analyzers/            ← deterministic logic (clustering, patch-guard, scanner-trigger)
  collectors/           ← read Playwright JSON + Allure into normalized events
  config/               ← policies (agent / severity / token / notification / recursive)
  context/              ← framework-context, existing-code-index, token-budget, caches
  inputs/               ← test-case parsers (Markdown / JSON)
  memory/               ← .aiqa-memory/ store CRUD
  notifications/        ← notification orchestrator (channels off by default)
  orchestration/        ← apply-patches, doctor, init-project, regression-runner, guard-runner
  providers/            ← claude + noop + types
  reports/              ← diagnosis Markdown, CI summary, stakeholder HTML
  schemas/              ← versioned TS types (aiqa.*.v1)
  watchers/             ← chokidar watcher + critical-pattern detector
  cli/aiqa.ts           ← single CLI entrypoint

mcp/                    ← four read-only-by-default MCP servers
  shared/               ← policy + server-base + result helpers
  servers/{qa-report,framework-context,memory,test-runner}/

helper/                 ← framework-provided helpers used by every project
  test.ts               ← extended `test` with Jira-bug auto-fixture (don't touch in projects)
  jira-bug-reporter.ts  ← framework infrastructure (don't touch in projects)
  jira-story.ts
  test-tags.ts          ← starter tags; projects EXTEND this
  action-keywords.ts    ← single keyword layer; projects can extend

config/                 ← playwright.config.ts (framework default; projects rarely change)
jenkins/                ← declarative pipeline (projects customize git URL + stakeholders)
```

## Adding a new MCP tool

1. Pick the right server in `mcp/servers/<server>/server.ts`.
2. Add a `ToolDefinition` entry to the `tools: [...]` array:
   ```ts
   {
       name: "aiqa.<server>.<verb>",
       description: "What it does. Short.",
       inputSchema: { type: "object", properties: { ... } },
       handler: (args) => myFunction(args as MyArgsType),
   }
   ```
3. Tools must return `ok(payload)` / `err(message, detail)` from
   `mcp/shared/result.ts` (handles 80 KB cap).
4. Read-only? You're done. Mutating? Wrap with the relevant env-flag gate:
   ```ts
   const block = requireWrite(); if (block) return block;
   ```
5. Verify with `yarn aiqa:mcp:list --tools` and the in-process smoke pattern
   in `mcp/README.md`.

## Adding a new agent

1. Decide: recursive (multi-round) or one-shot?
   - One-shot → just call `provider.call(...)` once, like `planAutomation`.
   - Recursive → wrap with `runRecursive({...})` from `agents/recursive-runner.ts`.
2. Always provide a noop fallback at the top:
   ```ts
   if (provider.name === "noop" || budget.isExhausted()) {
       return { ...deterministicBaseline };
   }
   ```
3. Tag the system prompt + framework-context blocks with `cacheBreakpoint: true`
   for Anthropic prompt caching.
4. Add per-call `budget.charge(label, resp.usage)` so the token ledger is
   accurate.
5. Add the agent's workflow to `config/recursive-policy.ts` `maxRoundsByWorkflow`
   if recursive.

## Adding a new patch-guard rule

1. Decide if it's universal (any file) or contextual (specs only, POMs only).
2. Add a regex/condition to `analyzers/patch-guard.ts` `inspect()`.
3. Add a unit test in the existing smoke pattern (see `/tmp/aiqa-apply-check.ts`
   structure in the conversation log).
4. Document the rule in `INSTALL.md` troubleshooting table.

## Updating framework conventions

`src/ai-qa-agent/context/framework-context.ts` builds the cached prompt
block from real source files in this repo (helper, page-objects/sample,
tests/sample, .claude/skills/qa-agent/references/framework-conventions.md).

To change a convention:

1. Update the actual source file (the sample POM, the tags catalogue, etc.).
2. Update `.claude/skills/qa-agent/references/framework-conventions.md` so
   the human-facing doc matches.
3. The `framework-context` cache invalidates on source mtime change — next
   `aiqa:generate-automation` picks up the new convention automatically.
4. Add a corresponding patch-guard rule if the convention should be enforced.

## Memory schema changes

Stores under `src/ai-qa-agent/memory/*.store.ts`:

1. Bump the `SCHEMA` constant (e.g. `aiqa.known-issues.v2`).
2. Update the record type.
3. Add a migration in `store-base.ts` `loadDoc()` if the change is
   incompatible — the loader already tolerates missing fields, so additive
   changes need no migration.

## Provider changes

To add a new provider (e.g. local Ollama, AWS Bedrock):

1. Create `src/ai-qa-agent/providers/<name>-provider.ts` implementing the
   `Provider` interface from `providers/types.ts`.
2. Wire selection in `providers/index.ts` `makeProvider()`.
3. Extend `config/ai-provider.config.ts` `AiProviderName` union and the
   `resolveProvider()` switch.
4. Verify the noop fallback still works (provider missing → noop, never crash).

## Tests / verification

There are no full unit-test suites yet (the proposal was demo-focused); the
verification approach is **smoke scripts** + **in-process MCP tool calls**.
For framework changes:

1. `npx tsc --noEmit -p tsconfig.aiqa.json` — must stay green.
2. `npx tsc --noEmit` — must stay green (original repo scope unchanged).
3. `yarn aiqa:doctor` — should report expected status.
4. `yarn aiqa:scan --prompt` — should reflect any convention change.
5. `yarn aiqa:mcp:list` — should include any new server.

When adding non-trivial logic, drop a smoke script into `/tmp/` and document
it in the PR description.

## What MUST NOT change without a major-version bump

These are the load-bearing contracts that consuming projects depend on:

- **CLI surface** — every `aiqa <command>` must remain backward compatible.
  Add new commands; never rename.
- **`FailureEvent` / `Diagnosis` / `RecursiveReview` schema versions** —
  bump (`v1` → `v2`) on any incompatible change. Old consumers (CI dashboards,
  external scripts) parse the JSON.
- **Patch-guard accept criteria** — making rules STRICTER is a breaking
  change for existing projects' generated code. Add an env opt-in for new
  rules first.
- **Hard guardrails in `agent-policy.ts`** — never relax `forbidden`
  entries. Period.
- **Mode names** — `diagnose_only` etc. are exposed via env. Add new modes;
  never rename.
- **MCP tool names** — clients hardcode these. Add new tools; never rename.

## Release process

1. Update `CHANGELOG.md` under a new version heading.
2. Bump `version` in `package.json`.
3. `git tag v<x.y.z>` after merging.
4. Document the breaking-change inventory in the release notes if any.

## Code style

- TypeScript strict mode (enforced by `tsconfig.aiqa.json`).
- Prefer plain TS types over Zod for schemas — keeps the dep footprint flat.
- File-level JSDoc explaining what the module does and WHY (the framework
  has a lot of moving parts; brevity hurts).
- Filenames: kebab-case. Symbol names: camelCase / PascalCase per usual.
- No `any` outside explicit lazy-import shims (which are documented inline).

## Questions

Read the architecture docs in order:

1. [README.md](README.md) — surface
2. [INSTALL.md](INSTALL.md) — consumer's view
3. [src/ai-qa-agent/README.md](src/ai-qa-agent/README.md) — agent layer
4. [mcp/README.md](mcp/README.md) — MCP layer + extension point
5. [CHANGELOG.md](CHANGELOG.md) — phase-by-phase build history

For anything not covered, the source has detailed file-level comments
explaining design intent — those are the source of truth.
