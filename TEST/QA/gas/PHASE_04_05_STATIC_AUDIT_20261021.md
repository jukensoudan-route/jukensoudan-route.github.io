# ROUTEQ Q&A isolated TEST — phase ④/⑤ static review (2026-10-21)

Scope: GitHub branch `test/qa-full-copy-isolated-20261021`, under `TEST/QA/gas/`. Read-only review of the existing files; no GAS deployment or execution. This report does **not** declare phase ④ or ⑤ complete.

## Verified
- Read existing isolation guard, schema smoke test, nine functional modules, manifest, deployment/setup notes, and quarantined Q&A core `staging/訂正シート最優先・直接参照.TEST_BLOCKED.gs`.
- Regexp-level scan of explicit `function name(...)` declarations across isolation guard, nine modules and quarantined core found **zero duplicate named declarations**. This expands the predecessor's 9-module-only scan; it is NOT a full JavaScript parse and does not account for dynamically assigned/global function values.
- Quarantined core includes `doGet` and `doPost`, each unconditionally throws after TEST guard; they cannot yet serve the TEST Web frontend.
- Q&A core contains direct LINE verification/profile fetch, OpenAI Responses fetch and LINE push fetch paths. Stripe module contains Stripe API fetch paths. These cannot be considered isolation-verified merely because some entrypoints throw.
- `資料ファイル登録.gs` contains Drive export and OpenAI Files/Vector Store API paths, deliberately blocked in selected functions.
- `回答モード切替.gs` contains a dynamic spreadsheet `openById(item.spreadsheetId)` path; the enclosing delayed-reply processing entrypoint is currently blocked. Validate provenance of any queued `spreadsheetId` before enabling.
- `Stripe連携.gs` contains a production-hosted payment completion URL string even though Checkout creation is currently blocked; redirect must be TEST-specific before enabling.
- Current `appsscript.json` specifies V8 and Asia/Tokyo, but does not itself establish required service/API permissions.

## No-go blockers before copying all sources to GAS
1. Quarantined core remains a **non-executable candidate** for functional testing; entrypoints, LINE-related functions and setup paths throw. Do not simply remove these throws.
2. Enumerate and control every external call path (including helper calls invoked indirectly) for LINE, Stripe, OpenAI, Drive and triggers. No production credentials or customer data in TEST.
3. Bind simulated identity/authentication and outbound messaging to dummy-only TEST channels, or explicitly mocked handlers; ordinary production LINE ID tokens and live messaging must remain unavailable.
4. Establish Stripe TEST-only keys and a TEST return URL plus duplicate-grant checks before payment tests. Do not perform LIVE operations.
5. Confirm main core and helper modules' runtime dependencies, sheet-column schema, and data fixtures. Existing 14-tab existence PASS does not verify complete runtime schema or realistic functionality.
6. Verify TEST screen `/TEST/QA/` and `/TEST/QA/hyogo/` frontend endpoints point only at isolated TEST GAS before launching.
7. Verify syntax with a real Apps Script V8-compatible parser and conduct controlled TEST runtime validations; regexp scan cannot prove syntactic correctness.

## Decision
Phase ④: **対応中** (core not yet migrated into executable, isolated runtime candidate).
Phase ⑤: **対応中** (limited static checks completed; external path and runtime parity verification missing).
Phase ⑥: **未着手**. No instruction to deploy or run any staged source.

Safety boundary: `main`, production GAS/Sheets/LINE, Stripe LIVE, and actual customer data are not modified.
