/**
 * Agent Decision — schemaVersion `aiqa.agent-decision.v1`.
 *
 * Returned by the Orchestrator Agent to declare which specialists should run
 * for a given input and at what context level. Recorded under
 * `test-output/ai/decisions/` for auditability.
 */

import type { AgentAction } from "../config/agent-policy";
import type { ContextLevel } from "../config/token-budget-policy";

export const AGENT_DECISION_SCHEMA_VERSION = "aiqa.agent-decision.v1" as const;

export interface AgentDecision {
    schemaVersion: typeof AGENT_DECISION_SCHEMA_VERSION;

    routeTo: string[];                // agent names
    contextLevel: ContextLevel;
    requiresHumanApproval: boolean;
    reason: string;

    /** Per-action approvals already granted in this session, if any. */
    grantedApprovals: AgentAction[];
}
