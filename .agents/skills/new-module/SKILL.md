---
name: new-module
description: Scaffold a NEW testing surface module with the standard anatomy. Use for "add a new module", "create a new test surface", "scaffold a <name> module". For framework maintainers extending beyond ui/api/mobile/performance. Wires config, tsconfig alias, tags, and scripts.
---

# new-module — scaffold a new surface module

Add a new surface with the same self-contained anatomy every module has.

## Create `<module>/`
- `helpers/` (the surface's single keyword/client layer) · `tests/` (sample spec) ·
  `conventions.md` · `memory/memory.md` · `README.md` (with a run-in-isolation block) ·
  `playwright.config.ts` that spreads `config/playwright.base` + scopes `testDir: './tests'`.
- Object model + one keyword/client layer — never touch the transport in a spec.

## Wire it in
- **tsconfig**: add `<module>/**/*.ts` to `include`; add a `@<module>/*` alias if it will be imported cross-module.
- **root config** (`config/playwright.config.ts`): add a project with `testMatch: '**/<module>/tests/**/*.spec.ts'`.
- **tags** (`core/test-tags.ts`): add `@<module>`.
- **package.json**: add `test:<module>` script.
- **AI-QA**: if specs live under it, add its `tests` path to
  `src/ai-qa-agent/context/existing-code-index.ts` (SOURCE_MTIME_PATHS + the specs scan roots).
- **docs**: add it to `README.md` / `CLAUDE.md` layout + the qa-agent `framework-conventions.md` §1.

## Rules
- Follow `core/` for shared bits (env/tags/test/jira) — don't duplicate them.
- Keep the anatomy identical to existing modules so the qa-agent + skills discover it automatically.
- Mirror any qa-agent reference changes to BOTH `.claude` and `.agents`.
