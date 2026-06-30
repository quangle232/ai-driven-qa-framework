# Testing strategy (coverage policy)

## Goal
Strong coverage with the minimum sufficient set of cases.

## Coverage dimensions
happy · negative · edge · boundary · adhoc · blackbox · api · data · security

## Minimums
- **Per AC:** ≥1 happy + ≥1 negative.
- **Global:** edge ≥2 · boundary ≥2 · security ≥2 · data ≥2 · api ≥1 · adhoc ≥1.

## Ordering
1. happy path → 2. UI sanity → 3. validation → 4. negative → 5. edge/boundary → 6. adhoc/exploratory.

## Notes
- Avoid duplicate coverage + redundant permutations; prefer meaningful variations.
- Keep cases automation-ready; map each to ≥1 AC where possible.
- Pick the right **surface** per case (`ui` / `api` / `grpc` / `mobile`) — record it in the JSON so
  Phase 6 generates the correct kind of spec.
