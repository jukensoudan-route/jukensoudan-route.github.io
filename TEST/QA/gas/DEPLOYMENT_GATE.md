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
