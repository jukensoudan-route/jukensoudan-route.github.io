# ROUTEQ LINE dry-run | 2026-10-23

Scope: GitHub branch `test/qa-full-copy-isolated-20261021` only; existing Apps Script project remains unchanged until an independently verified deployment.

The new `08_line_no_send_acceptance.gs` function `routeqQaInspectLineNoSend_(rowNumber, expectedLineUserId)` is **read-only**. It opens only the isolated TEST spreadsheet through existing script identity and property guards. It checks the real Questions/Users column contracts, Questions W submission ID uniqueness, Questions B/Users A recipient mapping and uniqueness, Questions J final answer, Questions L equal to `確認済`, and blocks any send state other than empty or `未送信`.

Return value contains no LINE ID, answer, credentials or body and explicitly reports zero network requests, zero Sheets writes and zero API charge. There is no LINE send, no status update to `送信済`, no persistent delivery receipt, and no automated retry.

Offline fault injection covers approved fixture, recipient substitution, missing IDs, duplicate Users, duplicate Questions W, missing/unapproved answer, sent/unknown/in-progress, changed headers and environment/project identity drift. This tests mock validation logic only; it is **not** proof of actual GAS installation, real Sheet operation or LINE delivery.

Owner's latest authorization: LINE actual sending is forbidden; OpenAI API additional charge limit is ¥0. Existing hard-stop network boundaries remain in effect. Stripe TEST is independently allowed but no Stripe TEST payment is created by this change.
