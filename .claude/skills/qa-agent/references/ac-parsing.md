# Acceptance-criteria parsing

## Goal
Extract structured, reliable acceptance criteria from the source input.

## Source priority
1. Jira description / AC field
2. Pasted text / issue note
3. Other attached docs (Figma notes, etc.)

## Rules
- Extract ONLY explicitly written acceptance criteria. Do not invent AC.
- Normalize bullet / numbered / newline-separated statements; preserve business meaning exactly.
- Stop parsing at sections like: Notes, Technical details, Out of scope, Attachments, Links,
  Definition of Done.

## Normalize to AC ids
```json
[
  { "id": "AC1", "text": "User can log in with valid credentials" },
  { "id": "AC2", "text": "User sees an error for invalid credentials" }
]
```

## Fallback (no AC found)
- Mark the story incomplete, continue generation, add explicit **assumptions** + **open questions**
  to the JSON (`assumptions`, `openQuestions`) and surface them above the review table.
