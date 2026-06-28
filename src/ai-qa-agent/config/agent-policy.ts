/**
 * Agent policy — what the orchestrator may delegate based on the active mode.
 *
 * Default mode: `diagnose_only` (per the master build prompt).
 *
 * This file is the single source of truth for the action allow-list. Every
 * agent must consult `isActionAllowed()` before performing a side effect.
 * The forbidden behaviors below are absolute — no mode overrides them.
 */

export type AgentMode =
    | "observe_only"
    | "diagnose_only"
    | "suggest_fix"
    | "generate_patch"
    | "apply_patch_requires_approval"
    | "full_cycle_with_approval";

export const SUPPORTED_MODES: AgentMode[] = [
    "observe_only",
    "diagnose_only",
    "suggest_fix",
    "generate_patch",
    "apply_patch_requires_approval",
    "full_cycle_with_approval",
];

export const DEFAULT_MODE: AgentMode = "diagnose_only";

export type AgentAction =
    | "read_test_summary"
    | "read_repo_snippet"
    | "read_full_repo"
    | "read_secret"
    | "run_targeted_playwright"
    | "run_full_regression"
    | "generate_test_cases"
    | "export_excel"
    | "generate_code_patch"
    | "apply_code_patch"
    | "create_jira_bug"
    | "comment_pr_mr"
    | "send_critical_notification"
    | "skip_test"
    | "weaken_assertion"
    | "mark_pass_manually";

type Permission =
    | "allowed"
    | "allowed_with_allowlist"
    | "approval_required"
    | "approval_local_only"
    | "forbidden";

/**
 * Action matrix per master prompt / policies/agent-policy.md.
 * `forbidden` entries are absolute — never permitted in any mode.
 */
export const ACTION_MATRIX: Record<AgentAction, Permission> = {
    read_test_summary: "allowed",
    read_repo_snippet: "allowed_with_allowlist",
    read_full_repo: "forbidden",
    read_secret: "forbidden",
    run_targeted_playwright: "approval_local_only",
    run_full_regression: "approval_required",
    generate_test_cases: "allowed",
    export_excel: "approval_required",
    generate_code_patch: "allowed",
    apply_code_patch: "approval_required",
    create_jira_bug: "approval_required",
    comment_pr_mr: "approval_required",
    send_critical_notification: "allowed",
    skip_test: "forbidden",
    weaken_assertion: "forbidden",
    mark_pass_manually: "forbidden",
};

/**
 * Per-mode upgrades. A mode can RELAX an `approval_required` action to
 * `allowed`, but can NEVER relax a `forbidden` action.
 */
const MODE_OVERRIDES: Partial<Record<AgentMode, Partial<Record<AgentAction, Permission>>>> = {
    observe_only: {
        generate_code_patch: "forbidden",
        export_excel: "forbidden",
    },
    diagnose_only: {
        // Strict default — diagnose and notify only.
        generate_code_patch: "forbidden",
        apply_code_patch: "forbidden",
        export_excel: "approval_required",
    },
    suggest_fix: {
        generate_code_patch: "allowed",
        apply_code_patch: "forbidden",
    },
    generate_patch: {
        generate_code_patch: "allowed",
        apply_code_patch: "forbidden",
    },
    apply_patch_requires_approval: {
        generate_code_patch: "allowed",
        apply_code_patch: "approval_required",
    },
    full_cycle_with_approval: {
        // Every non-forbidden action still requires explicit approval.
    },
};

export const FORBIDDEN_BEHAVIORS: readonly string[] = [
    "self_heal_until_pass",
    "rerun_until_pass",
    "auto_skip_tests",
    "auto_mark_pass",
    "weaken_or_delete_assertions",
    "update_expected_without_approval",
    "read_secrets",
    "uncontrolled_shell_execution",
    "commit_or_push_without_approval",
] as const;

export function getActiveMode(env: NodeJS.ProcessEnv = process.env): AgentMode {
    const raw = (env.AI_QA_AGENT_MODE ?? "").trim() as AgentMode;
    return SUPPORTED_MODES.includes(raw) ? raw : DEFAULT_MODE;
}

export function getActionPermission(action: AgentAction, mode: AgentMode = getActiveMode()): Permission {
    const override = MODE_OVERRIDES[mode]?.[action];
    const base = ACTION_MATRIX[action];
    // `forbidden` in the matrix is absolute. A mode override can only tighten
    // a non-forbidden default; it can never unblock a forbidden action.
    if (base === "forbidden") return "forbidden";
    return override ?? base;
}

export function isActionAllowed(action: AgentAction, mode: AgentMode = getActiveMode()): boolean {
    return getActionPermission(action, mode) === "allowed"
        || getActionPermission(action, mode) === "allowed_with_allowlist";
}

export function requiresApproval(action: AgentAction, mode: AgentMode = getActiveMode()): boolean {
    const p = getActionPermission(action, mode);
    return p === "approval_required" || p === "approval_local_only";
}
