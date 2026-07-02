/**
 * `test` for GraphQL specs — adds a `graphqlClient` fixture on top of @core/test
 * (Jira-bug fixture applies). MSW intercepts the client so specs run with no
 * backend; set GRAPHQL_URL to hit a real endpoint.
 *
 *     import { test, expect } from '@api/graphql/helpers/test-graphql';
 */
import { test as base, expect } from "@core/test";
import { GraphqlClient } from "@api/graphql/client";
import { server } from "@api/graphql/mock/server";
import { GQL_URL } from "@api/graphql/mock/handlers";

export const test = base.extend<{ graphqlClient: GraphqlClient }>({
    graphqlClient: async ({}, use) => {
        server.listen({ onUnhandledRequest: "bypass" });
        const url = process.env.GRAPHQL_URL || GQL_URL;
        try {
            await use(new GraphqlClient(url, process.env.GRAPHQL_TOKEN));
        } finally {
            server.resetHandlers();
            server.close();
        }
    },
});

export { expect };
