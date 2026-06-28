# AI QA Agent — MCP servers

Four read-only-by-default MCP servers that expose the framework's data and
operations to any LLM client (Claude Code, Cursor, Windsurf, your own bot).
Plus a documented extension point so each project drops its own MCP server
for domain knowledge.

## Servers

| Server id | Tools | What it's for |
|---|---|---|
| `aiqa-qa-report` | `get_run_summary`, `get_failed_tests`, `get_failure_clusters`, `get_critical_events`, `get_diagnosis`, `list_runs` | Read the latest Playwright run's structured failures + the framework's clustered/diagnosed view. |
| `aiqa-framework-context` | `get_conventions`, `get_existing_code_index`, `find_page_object`, `list_action_keywords`, `search_tests`, `read_snippet` | Framework conventions + what already exists in this repo. Call before generating code. |
| `aiqa-memory` | `get_known_issues` / `add_known_issue` / `match_known_issues`, `get_flaky_history` / `get_flaky_rate`, `get_failure_patterns` / `annotate_failure_pattern`, `get_domain_glossary` / `add_glossary_term` / `find_term` | Knowledge persistence for THIS project. Reads always allowed. Writes require `AIQA_ALLOW_MEMORY_WRITE=true`. |
| `aiqa-test-runner` | `list_available_tests`, `get_last_run_status`, `trigger_targeted_run` | Discover the suite + (gated) trigger a targeted Playwright run. Execution requires `AIQA_ALLOW_EXEC=true`. |

All tools return compact JSON capped at 80 KB. File reads cap at 120 lines.
The `.env`, `.auth`, `storageState`, `secrets/`, `node_modules/`, `.git/` paths
are **always blocked** regardless of any flag.

## Setup

### 1. Install the SDK

```bash
yarn add -D @modelcontextprotocol/sdk
```

(Already declared in `package.json` — `yarn install` picks it up.)

### 2. Generate a client config snippet

```bash
yarn aiqa:mcp:config                   # print to stdout
yarn aiqa:mcp:config --out=~/.claude.json    # write directly
```

Output looks like:

```json
{
  "mcpServers": {
    "aiqa-qa-report":          { "command": "npx", "args": ["tsx", "mcp/servers/qa-report/server.ts"],          "cwd": "<repo>", "env": { ... } },
    "aiqa-framework-context":  { "command": "npx", "args": ["tsx", "mcp/servers/framework-context/server.ts"],  "cwd": "<repo>", "env": { ... } },
    "aiqa-memory":             { "command": "npx", "args": ["tsx", "mcp/servers/memory/server.ts"],             "cwd": "<repo>", "env": { ... } },
    "aiqa-test-runner":        { "command": "npx", "args": ["tsx", "mcp/servers/test-runner/server.ts"],        "cwd": "<repo>", "env": { ... } }
  }
}
```

- **Claude Code:** paste into `~/.claude.json` (top level) or `.claude/mcp.json` (per-project).
- **Cursor:** paste into `.cursor/mcp.json`.
- **Windsurf:** paste into `~/.codeium/windsurf/mcp_config.json`.

### 3. Inspect the tool catalogue

```bash
yarn aiqa:mcp:list             # short summary
yarn aiqa:mcp:list --tools     # full JSON of every tool with input schema
```

### 4. Start a server manually (debugging only)

```bash
yarn aiqa:mcp:start --server=qa-report
# (sends JSON-RPC over stdio — Ctrl-C to exit)
```

## Token math (why this beats raw file reads)

| Question | Without MCP | With MCP |
|---|---|---|
| "What failed in the last run?" | LLM reads `test-output/playwright-report.json` (~5-10 KB) + parses suite tree | `aiqa.qa.get_failed_tests` returns 500 tokens of structured failures |
| "What's the framework's tag convention?" | LLM reads `helper/test-tags.ts` + `helper/test.ts` + `.claude/skills/qa-agent/references/framework-conventions.md` | `aiqa.fw.get_conventions` returns the cached ~1.5k-token block |
| "Does an Order page object exist?" | LLM globs `page-objects/**` + reads candidates | `aiqa.fw.find_page_object` returns class name + method names in one call |
| "Has this failure happened before?" | Impossible without local memory | `aiqa.mem.match_known_issues` + `aiqa.qa.get_failure_clusters` |

## Memory — where domain knowledge lives

Stores live under `.aiqa-memory/<store>.json` at the repo root:

- `known-issues.json` — bugs / quirks the team has tracked
- `flaky-history.json` — per-test flake counts and rates
- `failure-patterns.json` — fingerprints with the team's resolution history
- `domain-glossary.json` — project terms in plain English

All four files are hand-editable. The agent (via the `aiqa-memory` MCP server)
can also append entries when `AIQA_ALLOW_MEMORY_WRITE=true`.

**Recommended workflow on a new project:**

1. Hand-write `domain-glossary.json` first. 10-30 terms is usually enough.
   These show up in the stakeholder HTML report tooltips and help the LLM
   pick the right vocabulary in test cases.
2. Let the framework auto-populate `flaky-history.json` and
   `failure-patterns.json` over the first few CI runs.
3. After a sprint, review `failure-patterns.json` and annotate the recurring
   ones with `annotate_failure_pattern` (or hand-edit) — next time the
   same fingerprint appears the diagnosis agent jumps straight to the
   known root cause.
4. Track real bugs in `known-issues.json` with `affects` filters so future
   failures auto-link.

## Project-MCP extension point

This framework is generic. Your domain isn't. Drop your project's own MCP
server alongside the four built-in ones:

```
mcp/
├── servers/
│   ├── qa-report/                   ← framework-provided
│   ├── framework-context/           ← framework-provided
│   ├── memory/                      ← framework-provided
│   ├── test-runner/                 ← framework-provided
│   └── <your-project>/              ← YOU build this
│       └── server.ts
```

Conventions for the project server:

- Server id prefix: `<project>-` (e.g. `acme-jira`, `acme-figma`).
- Tool name prefix: `<project>.<area>.<verb>` (e.g. `acme.jira.get_story`).
- Use `McpServerBase` from `mcp/shared/server-base.ts` — gives you the same
  in-process `callTool()` shape used by tests.
- Honour `mcpPolicy` from `mcp/shared/policy.ts` for path allow/block.
- Register the server in `mcp/index.ts` so `aiqa mcp:list` and `mcp:config`
  pick it up automatically:

```ts
// mcp/index.ts
import { acmeJiraServer } from "./servers/acme-jira/server";
SERVERS.push({
    id: "acme-jira",
    description: "Acme-specific Jira tooling — story templates, label rules, OKR mapping.",
    runner: "mcp/servers/acme-jira/server.ts",
    server: acmeJiraServer,
});
```

That's it — your project MCP server now shows up in Claude Code (and any
other client) next to the framework's defaults.

## Guardrails on every server

1. **Read-only by default** — write tools exist in the catalogue but refuse with a structured error unless the relevant env flag is set.
2. **Path allowlist + blocklist** — `mcp/shared/policy.ts` enforces; the
   policy is shared across all four servers.
3. **Response size cap** — 80 KB per response; oversized payloads truncate
   with a `partial` marker so the client knows.
4. **File range cap** — 120 lines per `read_snippet` call.
5. **No stdout logging** — stdio MCP servers must keep stdout clean; all
   logs go to stderr.
6. **No write to `helper/`, `config/`, `ci/`, `.env`, `.auth/`** — guard
   enforced at policy level + at the source (the memory server only writes
   `.aiqa-memory/`, the test-runner spawns processes but never writes
   source files).
