/**
 * MCP policy — applied to every server in this repo.
 *
 * Sourced from the prompt pack's mcp/01-mcp-policy.md and tightened where
 * the framework has a stronger default (e.g. memory writes are forbidden
 * unless AIQA_ALLOW_MEMORY_WRITE; test execution is forbidden unless
 * AIQA_ALLOW_EXEC). The policy is enforced in `server-base.ts` BEFORE the
 * tool handler runs, so per-server tools never have to remember it.
 */

export interface McpPolicy {
    readOnlyByDefault: true;
    allowedReadPaths: readonly string[];
    blockedPaths: readonly string[];
    maxFileReadLines: number;
    maxToolResponseBytes: number;
    executionTools: {
        enabled: boolean;
        envFlag: string;
    };
    writeTools: {
        enabled: boolean;
        envFlag: string;
    };
}

export const mcpPolicy: McpPolicy = {
    readOnlyByDefault: true,
    allowedReadPaths: [
        "src/ai-qa-agent/",
        "tests/",
        "page-objects/",
        "test-data/",
        "helper/",                 // read-only; framework conventions
        "test-output/ai/",
        "test-output/allure-results/",
        "test-output/playwright-report.json",
        ".aiqa-memory/",
        "config/playwright.config.ts",
        "package.json",
        "tsconfig.json",
        "README.md",
    ],
    blockedPaths: [
        ".env",
        ".env.local",
        ".env.dev",
        ".env.test",
        ".env.prod",
        ".env.jira",
        ".auth/",
        "storage-state",
        "node_modules/",
        ".git/",
        "secrets/",
        "credentials/",
    ],
    maxFileReadLines: 120,
    maxToolResponseBytes: 80_000,
    executionTools: {
        enabled: false,            // honoured only if envFlag is also true
        envFlag: "AIQA_ALLOW_EXEC",
    },
    writeTools: {
        enabled: false,
        envFlag: "AIQA_ALLOW_MEMORY_WRITE",
    },
};

export function executionAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
    const v = (env[mcpPolicy.executionTools.envFlag] ?? "").toLowerCase();
    return mcpPolicy.executionTools.enabled || v === "true" || v === "1" || v === "yes";
}

export function writeAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
    const v = (env[mcpPolicy.writeTools.envFlag] ?? "").toLowerCase();
    return mcpPolicy.writeTools.enabled || v === "true" || v === "1" || v === "yes";
}

export function pathAllowed(repoRelative: string): boolean {
    const norm = repoRelative.replace(/^[./\\]+/, "");
    if (mcpPolicy.blockedPaths.some(b => norm.includes(b))) return false;
    return mcpPolicy.allowedReadPaths.some(a => norm.startsWith(a) || norm === a);
}
