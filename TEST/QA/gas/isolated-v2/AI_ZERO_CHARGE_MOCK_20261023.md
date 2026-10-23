# ROUTEQ no-charge AI mock + LINE no-send vertical slice | 2026-10-23

GitHub isolated TEST branch only; not deployed to GAS or run against live Sheets.

- `09_ai_zero_charge_mock.gs` validates a question in the fixed isolated TEST sheet and returns a **fixed, explicitly fake draft**, without saving it, invoking a model, contacting any service or incurring charges.
- Existing `08_line_no_send_acceptance.gs` can then separately inspect a distinct manually confirmed final-answer fixture, verifying Questions/Users identity and that delivery state remains unsent.
- Offline end-to-end fixture checks both stages and refuses missing questions, wrong columns, existing draft/final answer and environment gate changes. No external requests and no Sheets writes.
- This is **not** actual OpenAI generation, review UI verification, LINE delivery, actual GAS placement or real Sheets operational acceptance.
- Owner explicitly caps additional OpenAI API charges at **¥0** and forbids any LINE actual send. This code cannot bypass either restriction.
