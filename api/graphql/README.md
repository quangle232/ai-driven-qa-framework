# GraphQL sub-module

Playwright-free GraphQL testing with `graphql-request` + zod, mocked by MSW
(`graphql.link`). Runs under the Playwright runner.

```bash
yarn test:api:graphql
```

- `client.ts` — the only transport layer (`GraphqlClient.request(doc, vars, schema)`).
- `operations.ts` — queries/mutations. `models.ts` — zod response schemas.
- `mock/` — MSW handlers + server (in-process; no backend). `GRAPHQL_URL` → real endpoint.
- `helpers/test-graphql.ts` — the `graphqlClient` fixture (on `@core/test`).
- Specs assert on validated data; tag `@graphql @regression`.
