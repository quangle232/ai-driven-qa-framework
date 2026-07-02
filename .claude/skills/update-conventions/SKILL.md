---
name: update-conventions
description: Audit + keep the framework's docs/conventions/memory in sync with the code. Use for "audit conventions", "sync docs with code", "check the framework is consistent", "are .claude and .agents in sync". A maintenance self-check for framework maintainers.
---

# update-conventions — keep docs ↔ code in sync

Detect drift between the code and the guidance the agent relies on, and fix the docs.

## Checks
- **Paths exist**: every path named in `framework-conventions.md` (both mirrors), each
  `<module>/conventions.md`, `README.md`, and `tracking-files.md` resolves to a real file/dir.
- **Aliases resolve**: `@core/@ui/@api/@mobile` in `tsconfig.json` map to existing dirs; specs import via them.
- **Tags match**: markers referenced in docs exist in `core/test-tags.ts`.
- **Patch-guard current**: `src/ai-qa-agent/analyzers/patch-guard.ts` prefixes match the real
  protected paths (core/, config/, ci/, api/grpc/proto/, api/rest/contracts/, ui/helpers auth+setup).
- **Code-index scanner current**: `existing-code-index.ts` scan roots match the module layout.
- **Mirror parity**: `.claude/skills` and `.agents/skills` have the same skills + content
  (`.agents` uses `.agents/` paths). Every SKILL.md has valid `name` + `description` frontmatter.
- **Per-module completeness**: each surface has `conventions.md` + `memory/` + `README.md` + config.

## Fix
Update the docs/conventions/memory to match the code (not the reverse). After editing a qa-agent
reference or a skill, **mirror the change to BOTH `.claude` and `.agents`** (fix `.claude/`→`.agents/`
paths in the mirror). Re-run the checks.

## Rules
- Docs follow code. Don't silently change conventions the team relies on — flag intended changes.
- Read-only until the user confirms doc edits; never touch product/test logic here.
