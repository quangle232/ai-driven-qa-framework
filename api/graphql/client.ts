/**
 * GraphqlClient — the single GraphQL interaction layer (Playwright-free;
 * graphql-request). Specs call this; nothing calls the transport directly.
 * Validates the response with a zod schema and captures duration.
 */
import { GraphQLClient } from "graphql-request";
import type { ZodType } from "zod";

export interface GqlResult<T> {
    data: T;
    durationMs: number;
}

export class GraphqlClient {
    private readonly client: GraphQLClient;

    constructor(url: string, token?: string) {
        this.client = new GraphQLClient(url, token ? { headers: { authorization: `Bearer ${token}` } } : {});
    }

    async request<T = unknown>(
        document: string,
        variables: Record<string, unknown> = {},
        schema?: ZodType<T>,
    ): Promise<GqlResult<T>> {
        const started = Date.now();
        const raw = await this.client.request<T>(document, variables);
        const durationMs = Date.now() - started;
        const data = schema ? schema.parse(raw) : raw;
        return { data, durationMs };
    }
}
