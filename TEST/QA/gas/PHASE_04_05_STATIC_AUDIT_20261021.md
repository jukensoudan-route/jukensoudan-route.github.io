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

## Continuation — isolated core migration work
- Copied the existing quarantined Q&A core to `TEST/QA/gas/訂正シート最優先・直接参照.TEST_BLOCKED.gs`; original staging snapshot retained unchanged.
- Kept existing fail-closed checks for `setupAll`, `setupSheets`, `doGet`, `doPost`, `verifyLineUser_`, LINE push, and LINE diagnostic functions.
- Added fail-closed gates to `callRouteOpenAiResponse_` and `authorizeUrlFetch`, which otherwise contained direct external UrlFetch calls.
- GitHub write re-fetched and verified: file blob SHA `abf07961e845c1cdec0851eb41cced12a17417f5`; all cited guards present.
- This source remains explicitly **NOT deployable**: code isolation under indirect calls, runtime schema and TEST adapters for authentication/AI/Stripe/messaging remain incomplete.
- Phase ④ and ⑤ remain **対応中**; no GAS or production changes have been made.

## Continued changes — 2026-10-21 (Chat + GitHub only)

- Created an additional fail-closed boundary `02_external_boundary.gs`. Calls `routeqQaRejectExternalFetch_` always throw after the isolated-environment check. No HTTP transport is present in this implementation.
- Replaced **12** direct `UrlFetchApp.fetch(...)` call sites across the TEST Q&A core (5), material registration (5), and Stripe (2) with `routeqQaRejectExternalFetch_(...)`. Source code re-fetched after each commit; no direct `UrlFetchApp.fetch(...)` patterns remain in the 13 listed TEST GAS implementation modules.
- Changed the archived delayed-reply queued Sheet ID usage to an explicit equality check against `ROUTEQ_QA_TEST.sheetId` and `openRouteqQaTestSpreadsheet_()`.
- Removed production `/route-qa/payment-complete.html` return URL from isolated Stripe candidate; replacement TEST return URL existence has **not** been confirmed and Stripe execution remains blocked.
- Across 13 TEST implementation modules, a limited regex check found **197** named function declarations and **zero** duplicates. This count is not a JavaScript parse or runtime dependency pass.
- Remaining `ScriptApp.newTrigger` appearances are in intentionally blocked trigger-setup paths; those paths must remain disabled. A review of user-defined source outside the enumerated files and dynamic execution paths has not been completed.
- **Execution safety:** these findings show reduced direct network exposure but do not prove that every Apps Script service or indirect route is isolated; production-parity functionality is not demonstrated.
- **Status:** phase ④ = 対応中, phase ⑤ = 対応中. Do not copy the blocked candidate into GAS until complete test wiring and runtime verification.


## Syntax-check result and blocking finding

Used V8 JavaScript function compilation without executing GAS methods on the 13 migration modules, both separately and concatenated. Individual PASS 10/13. FAIL 3/13:

- `回答確認.gs`: `SyntaxError: Unexpected token ')'`
- `内申点自動判定.gs`: `SyntaxError: Unexpected end of input`
- `回答モード切替.gs`: `SyntaxError: Unexpected token ')'`

Each of the three source snapshots in `staging/` ends abruptly near line 1000, and retrieval after line 1001 produced no additional code. The active candidates have the same incomplete trailing source. Do not invent missing closing logic or copy these files into TEST GAS.

Overall concatenated V8 compile: FAIL. Runtime check: NOT EXECUTED. Phase ④/⑤ cannot be accepted until full authentic source is obtained or isolated TEST-equivalent implementations with audited behavior are prepared, reviewed and compiled.

Prohibited without further validation: GAS code deployment, enabling Web endpoints, live/TEST external communication, automatic triggers.

## Follow-up source recovery (same date)
- GitHub default-branch code search for the three missing module filenames yielded no matches.
- Queried the named release branch `release/qa-copy-current-production-20261015` for each missing module at the staging paths; none was found.
- This does NOT prove source is unavailable in other historical branches, external backups or the original GAS project.
- IMPORTANT: The previous 10/13 JavaScript syntax pass does not imply Apps Script runtime compatibility or isolation completeness. The three incomplete modules remain BLOCKERS. Do not deploy this bundle.

## Recovery of complete declarations from truncated archived modules
- Constructed **three non-deployable recovery-prefix files** under `TEST/QA/gas/recovery/` without fabricating missing source:
  - `回答確認.gs`: first 10 complete declarations retained; truncated `loadLatestUnconfirmedQuestion_` omitted.
  - `内申点自動判定.gs`: first 11 complete declarations retained; truncated `getRouteCandidateSchoolContext_` omitted.
  - `回答モード切替.gs`: first 12 complete declarations retained; truncated `processOneRouteDelayedReply_` omitted.
- Each prefix individually compiled as ordinary JavaScript without executing GAS calls, then was committed and re-fetched byte-for-byte.
- The **13-file composite**, substituting these recovery prefixes for the three truncated candidates, now passes an ordinary V8 JavaScript compile check (228591 characters); **194 named function definitions and zero duplicate named functions** in this limited scan.
- **Not a functional PASS:** the 3 omitted implementations are needed for behavior parity; the composite has unresolved calls including `getRouteCandidateSchoolContext_` and `getRouteTopPriorityContext_`, and its GAS services and external integration are untested. Prefix variants must **not** be deployed or presented as complete replacements.
- Next required source decision is factual, not design: locate the actual full original versions of the truncated modules. Do not infer or fabricate their missing bodies.

## Additional dependency closure check

Verified on the current TEST branch:
- `getRouteCandidateSchoolContext_` is referenced but its original body is truncated in the active candidate; `recovery/内申点自動判定.gs` contains its callers but excludes its definition.
- `processOneRouteDelayedReply_` is referenced in the delayed reply module; its original body is truncated and excluded from `recovery/回答モード切替.gs`.
- `loadLatestUnconfirmedQuestion_` is referenced in the answer review module; its original body is truncated and excluded from `recovery/回答確認.gs`.
- `getRouteTopPriorityContext_` is referenced by the core and does not appear among the 194 named function definitions in the compile-only candidate. Its original defining source still needs to be identified.
- Existing 14-sheet connection check was reported PASS in handoff; documented the correction to `DEPLOYMENT_GATE.md`. Sheet *schema/data parity* remains untested.

**Decision gate:** these four missing implementations prevent an honest parity signoff. Do not substitute fabricated no-op functions, remove safety throws, or deploy recovery prefixes. Authentic complete sources or separately authorized reconstruction are required.
