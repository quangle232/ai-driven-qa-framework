/**
 * Finalize helper: guarantee test-output/ai/bug-drafts/index.html exists —
 * green executions render the "No pending drafts" state instead of a missing
 * folder. Invoked by the qa-agent finalize step:
 *   npx tsx core/jira/ensure-bug-drafts-index.ts
 */
import { ensureBugDraftsIndex } from './bug-draft-writer';

ensureBugDraftsIndex();
console.log('[bug-draft] index ensured at test-output/ai/bug-drafts/index.html');
