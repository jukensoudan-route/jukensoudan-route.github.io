# ROUTEQ isolated GAS source audit — 2026-10-23

## Evidence

Source: owner-uploaded JSON from Apps Script API `projects.getContent` (HEAD, read-only), matching TEST script ID `1XFmCxARSHiYd3Hy1F7AvhbWQmPtz3TrbUr_nZDRXYZ11U8HMqTMMd8GQ`.

- Uploaded JSON SHA-256: `1cb1e46531f7a2a09d92bdff4bd56ba307ca129421412449b358bb69af91c883`
- Source contains 17 entries: 1 `appsscript` manifest + 16 server JavaScript files.
- 16/16 server JavaScript syntax PASS; combined syntax PASS; 242 distinct function declarations, 0 duplicates (local Node.js VM parser).
- Comparison against TEST branch code at `ecca14dfb26e50741f8e67706b6415ae17fee8b5`, using exact UTF-8 Git blob content hashes, not guessed file modification timestamps.
- Of the 15 GAS server files with a corresponding GitHub copy, **14 identical**, **1 differs**.

## Exact source mismatch

`03_isolated_v2_stops.gs` exists in both places but GAS is the older 1,249-character version. GitHub blob `c48425fa379baa3187cd104260283439746b9504` (2,502 bytes) adds `routeqQaTestFeatureGateStatus_` for fail-closed feature flags (no network authorization). Preserve original guard behavior and inspect the difference before any replacement.

## GitHub code missing from the actual GAS

1. `04_test_request_preflight.gs`
2. `05_test_request_control.gs`
3. `06_offline_journal_planner.gs`
4. `06_offline_replay_decision.gs`
5. `07_durable_test_reservation.gs`
6. `08_line_no_send_acceptance.gs`
7. `09_ai_zero_charge_mock.gs`

These are either preparatory / offline-only / no-send modules. Their GitHub CI success is NOT GAS runtime acceptance.

## Protected GAS-only file

`01_sheet_structure_smoke_test.gs.gs` (Apps Script API source name `01_sheet_structure_smoke_test.gs`) exists only in GAS, with distinct function `testRouteqQaIsolatedSheetStructure`. **Never delete, replace, rename or overwrite this file.** Its absence from the GitHub folder must never be treated as permission to delete it during a full-project source synchronization.

## Safe next steps

1. Confirm the owner-uploaded JSON is still the latest source before writing. For actual writes, re-fetch `projects.getContent`, compare to the recorded source, and stop if the remote script changed.
2. Preserve the Drive backup project `1dVG1GJOSi_b_y4V5_PlpbSi7XDZwJm3NgonbfNWmuGd6tF268WgI_I7H`, plus protected file and manifest.
3. Prepare an additive GAS update: add seven new `.gs` modules; update only `03_isolated_v2_stops.gs` after checking the current source; retain the fourteen identical modules, protected smoke test and `appsscript.json`.
4. Verify Script Properties refer only to the TEST script `1XFmCxARSHiYd3Hy1F7AvhbWQmPtz3TrbUr_nZDRXYZ11U8HMqTMMd8GQ` and TEST Sheet `11pWeP_LKbL7tAVAn6DBWvhqRo_1l0rIHHBdLjjx7lz8`. Source JSON cannot prove current Script Properties.
5. Deploy/run **only** under explicit existing TEST scope. No LIVE Stripe, no LINE sends, no additional paid OpenAI calls; cost ceiling ¥0. The hard-stop functions in `03_isolated_v2_stops.gs` still prevent many real application operations, so copying the extra source files alone does not make an operational Q&A service.
6. Re-read GAS, independently hash-compare all files, run controlled TEST Sheets acceptance and TEST Stripe/LINE-mock/AI-mock flow as authorized; record true PASS/FAIL without treating CI or source synchronization as real integrations.

## Status

GitHub audit documentation only. No Apps Script source write, GAS save/deploy, TEST Sheet write, LIVE payment, LINE transmission or paid API call is claimed. Commercial release remains **NO-GO** pending actual integration acceptance.
