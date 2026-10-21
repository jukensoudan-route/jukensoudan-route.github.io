# Q&A isolated TEST deployment gate (not yet passed)

This repository contains archived production snapshots in `gas/staging/`. **Never deploy staging files.**

Safe candidates in `gas/` are incomplete and must not be deployed as a complete Apps Script project until ALL conditions are met:

1. The exact current production versions are identified and compared; archived files are not assumed current.
2. The Q&A main handler is copied into the TEST project and all spreadsheet/Drive/LINE/OpenAI/Stripe paths are isolated.
3. Any duplicate global GAS declarations and functions are resolved against the currently deployed production behavior. `コード.gs` and `回答モード切替.gs` cannot simply be copied together unchanged.
4. Standalone Apps Script must explicitly open the isolated spreadsheet; calls relying on the active/bound spreadsheet require checking.
5. Standalone TEST Sheets does not yet reproduce the actual benchmark table; its data-dependent school recommendations cannot pass parity tests.
6. `00_isolation_guard.gs` **does not enforce safety globally**. Each action or side-effect must call the guard, and configuration must be checked before any enabled external service.
7. Outbound services remain disabled: no LIVE payment, LINE delivery, real Drive upload or automated backup until separate isolated TEST credentials and approvals.
8. Tests must prove that no production identifiers or credentials are used, and must confirm behavior against fake data only.
9. Running `01_sheet_structure_smoke_test.gs` is a manual read-only TEST-only test. It has **not** been run.

Isolated spreadsheet: `11pWeP_LKbL7tAVAn6DBWvhqRo_1l0rIHHBdLjjx7lz8`
TEST branch: `test/qa-full-copy-isolated-20261021`
Production: **read-only**.

## 2026-10-21 status update — deployment is explicitly prohibited

The isolated GAS project and spreadsheet already exist; the 14-sheet connection smoke test has **PASS** per the 2026-10-21 handoff. This supersedes historical statements above suggesting that the test was never performed.

**Source integrity blockers:**
- `回答確認.gs`, `内申点自動判定.gs`, and `回答モード切替.gs` in the TEST candidate and staging source are truncated mid-function.
- `recovery/` contains only their verified complete-prefix declarations. These are audit/recovery materials, not replacement production-parity source files.
- `訂正シート最優先・直接参照.TEST_BLOCKED.gs` contains intentional entrypoint halts.
- `02_external_boundary.gs` now rejects network calls. The 12 archived direct HTTP call sites in the copied core, Stripe and material files were routed to the rejecting boundary.
- All TEST sources remain unapproved for GAS placement, trigger installation, public Web deployment or real external access. No combination of `recovery/` and main candidate files constitutes an approved deployable set.
- A composite JavaScript syntax PASS with recovery prefixes does not demonstrate missing-function correctness or runtime behavior.

**Non-negotiable ④/⑤ exit gates:** recover complete original bodies (or use a separately approved exact-function replacement), resolve all dependencies and syntax errors, confirm every TEST source binds to isolated-only data, keep all external calls fail-closed or TEST-only under separately approved settings, establish regression fixtures, and only then issue explicit step-⑥ placement instructions.

This update is a documentation correction and safety gate only. It does not authorize any operation in GAS, production, Stripe or LINE.

## Owner decision — 2026-10-21
The owner **forbids reconstruction or reimplementation of missing functions**. Complete restoration from the authentic original source is the **only** permissible path for phase ④/⑤. Work, owner manual actions, and production changes remain forbidden. Do not infer code from call sites, invent replacement bodies, bypass disabled functions, or mark any source-parity requirement PASS using the recovery-prefix files.

Additional GitHub checks covered `main`, `release/qa-copy-current-production-20261015`, `backup/pre-qa-production-20261015`, and `backup/pre-site-restructure-20261016` using the previously known GAS file paths; no matching complete source was found at those paths. This is not an exhaustive search of other paths, accounts, historical Git objects or GAS versions. No user operation requested. The blocked original-source issue remains unresolved.
