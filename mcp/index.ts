/**
 * MCP server catalogue — single source of truth for CLI + tests.
 */

import { qaReportServer } from "./servers/qa-report/server";
import { frameworkContextServer } from "./servers/framework-context/server";
import { memoryServer } from "./servers/memory/server";
import { testRunnerServer } from "./servers/test-runner/server";
import type { McpServerBase } from "./shared/server-base";

export interface ServerEntry {
    id: string;
    description: string;
    /** Path to the runnable server file (used by `.claude/mcp.json` template). */
    runner: string;
    server: McpServerBase;
}

export const SERVERS: ServerEntry[] = [
    {
        id: "qa-report",
        description: "Read the latest Playwright run's failures, clusters, criticals, and diagnoses.",
        runner: "mcp/servers/qa-report/server.ts",
        server: qaReportServer,
    },
    {
        id: "framework-context",
        description: "Framework conventions + existing-code index. Call BEFORE generating any code.",
        runner: "mcp/servers/framework-context/server.ts",
        server: frameworkContextServer,
    },
    {
        id: "memory",
        description: "Known issues, flaky history, failure patterns, domain glossary. Writes gated by AIQA_ALLOW_MEMORY_WRITE.",
        runner: "mcp/servers/memory/server.ts",
        server: memoryServer,
    },
    {
        id: "test-runner",
        description: "List available tests + last-run status. Trigger run gated by AIQA_ALLOW_EXEC.",
        runner: "mcp/servers/test-runner/server.ts",
        server: testRunnerServer,
    },
];

export function findServer(id: string): ServerEntry | undefined {
    return SERVERS.find(s => s.id === id);
}
