# core — shared cross-module code

Not a test surface — the shared spine every module imports via the `@core/*` alias.

```
core/
  env-config.ts   ENV accessor (typed env vars)
  load-env.ts     test_env → environments/.env.<dev|test|prod> resolver (default test)
  test-tags.ts    TAGS map + tags() helper (markers == Jira labels)
  test.ts         base Playwright `test` + the failure → bug-DRAFT fixture
                  (JSON + HTML to test-output/ai/bug-drafts/, human approval
                  before Jira; JIRA_AUTO_BUG=yes restores direct auto-filing)
  jira/           jira-bug-reporter.ts · jira-story.ts · bug-draft-writer.ts ·
                  ensure-bug-drafts-index.ts (finalize: index exists even when green)
  utils.ts
```

Patch-guarded: generated code never writes into `core/` — with ONE exception:
`core/test-tags.ts` accepts additive TAGS entries (tag == Jira label). Changes here
affect every module (ui / api / mobile), so keep it minimal and stable.
