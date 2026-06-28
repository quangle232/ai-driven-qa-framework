# Lessons Learned — QA Playbook

Hard-won, **project-agnostic** practices distilled from real engagements (web admin
platforms, multi-tenant fintech apps, and Android device-management testing). Treat this as
the operating manual for any project built on this framework. The `qa-agent` skill and
`CLAUDE.md` reference it.

---

## 1. Shared / demo SUTs — run serial, expect drift
A single shared demo/staging instance usually has **one server-side session per account**.
- **`workers: 1` (serial).** Parallel workers share the storageState cookie → they race on
  the same session → multi-minute hangs and "acting-as" scope bleed between specs.
- **`--retries=2`** for count/reconciliation specs on a shared SUT — transient slowness and
  data settling cause flakes that self-heal on retry; don't let them pollute the catalogue.
- **Per-test timeout generous (e.g. 6 min)** if the SUT polls cloud/telemetry slowly.

## 2. Data drift is the #1 cause of false failures
Self-created fixtures (devices, tenants, users) accumulate on a shared instance and break any
assertion that hardcodes a count.
- **Prefix all QA-created data** with `qa-` so it's identifiable and safe to clean.
- **Assert against live totals**, not hardcoded numbers (`All == Assigned + Unassigned`, not
  `== 5`). Reconciliation > magic constants.
- **Clean up what you create** (teardown), or scope the assertion to your own fixture.
- A real test device/account left in inventory will skew dashboards and "tenant-scoped"
  checks — remove it for a pristine baseline, or annotate the known delta in the report.

## 3. Isolate destructive cases — never in the shared regression
Data-wiping, decommission, factory-reset, remote-wipe, bulk-delete:
- **Skip-gate them:** `(process.env.ALLOW_DESTRUCTIVE === '1' ? test : test.skip)(...)`.
- Run only on a **throwaway target**, ideally **last**.
- A destructive barrage can **wedge the whole environment** (e.g. one hung managed device
  slowed every device-data query SUT-wide for hours). Keep them out of the everyday run.

## 4. Env failure ≠ product bug — triage before you report
A run with 100 "failures" is usually the environment, not 100 defects.
- **Timeouts / page-load stalls / "element not visible in Ns"** across unrelated specs ⇒
  suspect the SUT (slow, down, session wedged), not the product. Re-run on a healthy env.
- **Only deterministic assertion failures** (fast, repeatable, specific expected≠actual) are
  candidate bugs. Re-run twice; if identical → real.
- Keep a **canary**: a tiny fast spec that fails *quickly* when healthy. If it suddenly
  times out, the env is the problem.

## 5. Verify UI bugs with a screenshot + DOM before logging
Reader artifacts cause false positives.
- `innerText` concatenates nested nodes (a KPI "2" + "40%" reads as "240%") — read the
  specific element / `aria-label`, not the parent's text.
- Date-grouped lists, truncated IDs, counts in `aria-label` "(N of M)" — confirm in the DOM.
- Screenshot **and** DOM-inspect every bug before filing. This removes several false
  positives per round and keeps the bug list trustworthy.

## 6. `@bugs` = executable proof; `bugs.json` = source of truth
- Tag a spec `@bugs` when it asserts **currently-broken** behaviour — it is **meant to fail**
  until the defect ships a fix, then it flips green and you drop the tag.
- Green slice for CI gating: `--grep-invert @bugs`.
- Curate the human-facing catalogue in `test-output/ai/bugs.json` (keyed by TC-ID; schema in
  `scripts/gen-reports.mjs`). `yarn report:bugs` turns it into HTML/MD/DOCX. The report marks
  each bug "✅ reproduced" / "⚠ not reproduced" from the live run, so masked/fixed bugs surface.

## 7. Selectors: read the DOM, don't trust the label
- Prefer stable hooks: `data-test-id` / `data-testid` / `data-id` / `data-*`. Don't invent.
- **testids often don't match the visible label** (a "Release" button may be
  `release-device-button`, "Refresh" may be `device-action-query`). Verify in the DOM; keep a
  per-app testid reference doc.
- After a destructive action a detail page may hang loading — assert via a **list/API check**
  for absence, not by navigating into the (now broken) detail.

## 8. Auth, roles & tenant isolation
- Authenticate once in `global-setup`, persist **storageState** per role; specs `test.use`
  the right state. Re-auth only when the saved session is invalid.
- For RBAC/tenant tests, keep **separate storage states per role/tenant** (admin, low-priv,
  tenant-A, tenant-B). One extra tenant unlocks **bidirectional** cross-tenant leak tests.
- Test isolation at the **API layer**, not just the UI (a hidden button isn't access control)
  — call the privileged endpoint with the low-priv token and assert 401/403.
- Watch "acting-as": after impersonating a tenant, confirm scope copy/filters actually
  narrowed (and that "return to platform-wide" restores).

## 9. Reconciliation & KPI testing
- Cross-check every headline number against its parts and against another surface
  (dashboard KPI == list rows == detail). Mismatches (e.g. Fleet total 6 vs Total 5 because a
  derived bucket is double-counted) are real, high-value bugs found by **manual KPI maths**.
- Distinguish **canonical states** from **derived signals** — a derived signal rendered as a
  first-class state/bucket is a modelling bug.
- Exploration beats scripts for these: click *every* KPI card / filter chip and check the
  destination + the count it claims.

## 10. Mobile / device-management testing (if applicable)
For Android Device-Owner (DPC) style apps:
- **The agent disables USB debugging right after enrollment** → `adb` works at **initial
  setup only**, never as a test dependency afterward.
- **"Lockout trap":** a managed device demoted to a pre-provision state can hang on a sync
  screen with **no software recovery** (kiosk blocks Settings/power, no adb) → recoverable
  only via **hardware Recovery-mode factory reset**. Don't run decommission/reset on a shared
  device.
- Keep the device **ACTIVE** at the end of a run (a teardown "ensure-active" nudge) so it
  never sits in the hang-prone state. Make **remote-wipe the final, gated teardown** only.
- `adb` enrollment belongs in `global-setup` behind a flag (e.g. `DEVICE_SETUP=1`), never in
  a test body.

## 11. Token economy when an LLM drives the work
- **Prefer the MCP tools** (`.mcp.json`) over Bash for run summaries, framework context,
  memory, and test discovery — they return compact JSON instead of you parsing big files.
- Write durable findings to `docs/ai/` and the memory stores, not just chat — so the next
  session reuses them instead of re-deriving.

## 12. Stakeholder reporting cadence
- Weekly update structure that works: **Headline numbers → 1. Manual & Exploratory → 2.
  Automation (coverage table) → 3. Bugs (table by area, `[Sev·Pri]` + ticket refs) →
  Impediments → Next week.** Keep Manual/Exploratory its own section — exploration is where
  the non-obvious bugs come from.
- Attach `test-report.html` + `bug-report.html` (or `.docx`) from `yarn report:bugs`.
- Build email tables with `<table border="1" cellpadding="6" cellspacing="0">` for reliable
  borders across mail clients.
