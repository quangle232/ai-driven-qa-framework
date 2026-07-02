/**
 * SAMPLE GraphQL spec — query + mutation over the mocked endpoint.
 * Call the client (never the transport); validate with zod models.
 */
import { test, expect } from "@api/graphql/helpers/test-graphql";
import { TAGS, tags } from "@core/test-tags";
import { setJiraStory } from "@core/jira/jira-story";
import { USERS_QUERY, CREATE_USER } from "@api/graphql/operations";
import { CreateUserData, UsersData } from "@api/graphql/models";

test.describe("Sample GraphQL — users", () => {
    test(
        "query Users returns a schema-valid list",
        tags(TAGS.GRAPHQL, TAGS.REGRESSION, TAGS.P1),
        async ({ graphqlClient }) => {
            setJiraStory("PROJ-GQL-1");
            const res = await graphqlClient.request(USERS_QUERY, {}, UsersData);
            expect(res.data.users.length).toBeGreaterThan(0);
            expect(res.durationMs).toBeLessThan(1000);
        },
    );

    test(
        "mutation CreateUser echoes the input",
        tags(TAGS.GRAPHQL, TAGS.REGRESSION, TAGS.P1),
        async ({ graphqlClient }) => {
            setJiraStory("PROJ-GQL-1");
            const res = await graphqlClient.request(
                CREATE_USER,
                { username: "newbie", email: "newbie@example.com" },
                CreateUserData,
            );
            expect(res.data.createUser).toMatchObject({ username: "newbie", email: "newbie@example.com" });
        },
    );
});
