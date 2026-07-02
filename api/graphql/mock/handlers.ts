/** MSW GraphQL handlers — in-process mock so specs run with no backend. */
import { graphql, HttpResponse } from "msw";

export const GQL_URL = "https://gql.mock.test/graphql";
const link = graphql.link(GQL_URL);

const users = [
    { id: "u-1", username: "demo", email: "demo@example.com" },
    { id: "u-2", username: "alice", email: "alice@example.com" },
];

export const handlers = [
    link.query("Users", () => HttpResponse.json({ data: { users } })),
    link.mutation("CreateUser", ({ variables }) =>
        HttpResponse.json({
            data: { createUser: { id: "u-new", username: variables.username, email: variables.email } },
        }),
    ),
];
