/**
 * Tiny base for stdio MCP servers in this repo.
 *
 * We don't take a hard dependency on `@modelcontextprotocol/sdk` for two
 * reasons: (1) it lets the framework typecheck before the dep is installed,
 * and (2) every server can ALSO be invoked in-process for unit testing
 * without spinning a real transport. The shape below mirrors the official
 * SDK's stdio Server but adds a `callTool(name, args)` shortcut so tests
 * can exercise the registered handlers directly.
 *
 * The SDK is loaded lazily via an indirected specifier. When it's missing,
 * `start()` throws with a friendly install hint; the in-process
 * `callTool()` still works without the dep.
 */

import { ok, err, type ToolResult } from "./result";

export interface ToolDefinition<TArgs = Record<string, unknown>> {
    name: string;
    description: string;
    inputSchema: { type: "object"; properties?: Record<string, unknown>; required?: string[] };
    handler: (args: TArgs) => Promise<ToolResult> | ToolResult;
}

export interface McpServerOptions {
    name: string;
    version: string;
    tools: ToolDefinition[];
}

export class McpServerBase {
    private readonly tools = new Map<string, ToolDefinition>();

    constructor(private readonly opts: McpServerOptions) {
        for (const t of opts.tools) this.tools.set(t.name, t);
    }

    listTools(): Array<Omit<ToolDefinition, "handler">> {
        return [...this.tools.values()].map(({ handler: _, ...t }) => t);
    }

    async callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
        const tool = this.tools.get(name);
        if (!tool) return err(`unknown tool: ${name}`);
        try {
            return await tool.handler(args);
        } catch (e) {
            return err(`tool ${name} failed`, (e as Error)?.message ?? String(e));
        }
    }

    /**
     * Start the stdio server. Lazy-loads `@modelcontextprotocol/sdk`; if it
     * isn't installed, throws with a friendly install hint.
     */
    async start(): Promise<void> {
        const sdkId = "@modelcontextprotocol/sdk/server/index.js";
        const stdioId = "@modelcontextprotocol/sdk/server/stdio.js";
        const typesId = "@modelcontextprotocol/sdk/types.js";

        let Server: { new (info: { name: string; version: string }, opts: { capabilities: { tools: object } }): SdkServer };
        let StdioServerTransport: { new (): unknown };
        let ListToolsRequestSchema: unknown;
        let CallToolRequestSchema: unknown;

        try {
            const [srv, stdio, types] = await Promise.all([
                import(sdkId), import(stdioId), import(typesId),
            ]);
            Server = (srv as { Server: typeof Server }).Server;
            StdioServerTransport = (stdio as { StdioServerTransport: typeof StdioServerTransport }).StdioServerTransport;
            ListToolsRequestSchema = (types as { ListToolsRequestSchema: unknown }).ListToolsRequestSchema;
            CallToolRequestSchema = (types as { CallToolRequestSchema: unknown }).CallToolRequestSchema;
        } catch (e) {
            throw new Error(
                "[aiqa-mcp] @modelcontextprotocol/sdk not installed. Run "
                + "`yarn add -D @modelcontextprotocol/sdk` first.\n"
                + `  underlying error: ${(e as Error).message}`,
            );
        }

        const server = new Server(
            { name: this.opts.name, version: this.opts.version },
            { capabilities: { tools: {} } },
        );

        server.setRequestHandler(ListToolsRequestSchema as never, async () => ({ tools: this.listTools() }));
        server.setRequestHandler(CallToolRequestSchema as never, async (req: { params: { name: string; arguments?: Record<string, unknown> } }) => {
            return this.callTool(req.params.name, req.params.arguments ?? {});
        });

        const transport = new StdioServerTransport();
        await server.connect(transport as never);
        // Per MCP policy, never log to stdout for stdio servers.
        // (stderr is fine; clients ignore it.)
        process.stderr.write(`[aiqa-mcp:${this.opts.name}] listening on stdio (${this.tools.size} tools)\n`);
    }
}

interface SdkServer {
    setRequestHandler(schema: never, handler: (req: never) => Promise<unknown>): void;
    connect(transport: never): Promise<void>;
}

/** Helper for tools that need to surface a "not found" without throwing. */
export { ok, err };
export type { ToolResult };
