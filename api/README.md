# API module (REST · gRPC · GraphQL)

Playwright-**free** service/contract testing (axios · @grpc/grpc-js ·
graphql-request), run under the Playwright runner so it reuses `test-output/`,
Allure, and the AI-QA pipeline. Run in isolation:

```bash
yarn test:api            # all sub-surfaces (or -c api/playwright.config.ts)
yarn test:api:rest       # --project=rest
yarn test:api:grpc       # --project=grpc
yarn test:api:graphql    # --project=graphql
```

## Structure
```
api/
  rest/     clients/rest-client.ts (axios) · services/ · models/ (zod) · mock/ (msw + Express) · contracts/ · helpers/ · tests/ · README.md
  grpc/     proto/ · load-proto.ts · clients/ · mock/ · models/ · helpers/ · tests/ · README.md
  graphql/  client.ts · operations.ts · models/ (zod) · mock/ (msw) · helpers/ · tests/ · README.md
  helpers/  conventions.md  memory/  playwright.config.ts  README.md
```
See `conventions.md` for the shared rules and each sub-module README for specifics.
