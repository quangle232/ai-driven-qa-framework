# core — shared cross-module code

Not a test surface — the shared spine every module imports via the `@core/*` alias.

```
core/
  env-config.ts   ENV accessor (typed env vars)
  load-env.ts     test_env → environments/.env.<dev|test|prod> resolver (default test)
  test-tags.ts    TAGS map + tags() helper (markers == Jira labels)
  test.ts         base Playwright `test` + the failure → Jira-bug auto-fixture
  jira/           jira-bug-reporter.ts · jira-story.ts
  utils.ts
```

Patch-guarded: generated code never writes into `core/`. Changes here affect every
module (ui / api / mobile), so keep it minimal and stable.
