# Auto priority scoring

Assign each case a `priority` (P0/P1/P2) + a short `priorityReason`.

## P0 — assign when any applies
core business path · login/auth/authorization · payment/checkout/contract signing ·
destructive action · data-integrity risk · irreversible state change · security-sensitive ·
system-blocking regression risk.

## P1 — important
important business validations · common alternate flows · common negative scenarios ·
high-frequency actions · significant UI/UX with business impact.

## P2 — lower risk
edge cases · cosmetic/secondary behavior · rare combinations · exploratory without clear criticality.

## Tie-breaks
- Prefer higher priority when uncertain AND the impact is user-blocking.
- Do NOT mark everything P0. Business impact > UI complexity.
- Infer from: mapped AC, summary/description keywords, destructive verbs
  (delete/submit/approve/pay/sign/publish), risk tags.

> Maps to the framework tags `@P0` / `@P1` / `@P2` on the generated spec.
