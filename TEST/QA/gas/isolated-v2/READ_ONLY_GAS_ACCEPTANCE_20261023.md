# ROUTEQ isolated GAS | read-only live smoke (2026-10-23)

Manual owner-run function: `testRouteqQaReadOnlyIntegrationSmoke` in `10_read_only_acceptance_smoke.gs`.

## Preconditions

- Target Apps Script project ID: `1XFmCxARSHiYd3Hy1F7AvhbWQmPtz3TrbUr_nZDRXYZ11U8HMqTMMd8GQ`.
- Target isolated sheet ID: `11pWeP_LKbL7tAVAn6DBWvhqRo_1l0rIHHBdLjjx7lz8`.
- Existing `00_isolation_guard.gs` environment and forbidden-LIVE/forbidden-external-send properties stay enforced. Never change security properties to make a failing test pass.
- Isolated TEST synthetic fixtures in Questions row 2 (AI mock), Questions row 3 (approved LINE mock), Users row 2. Synthetic LINE user ID `U_ROUTEQ_ISOLATED_MOCK_20261023`; no real account.
- Verify project identity before adding the module. Never modify the protected `01_sheet_structure_smoke_test.gs.gs`.

## Checks performed

- Five static URL classifications by the existing `testRouteqQaExternalBoundary`.
- Three explicit fail-closed boundary attempts (LINE, Stripe, OpenAI): each must throw before any network call.
- Row 2 AI mock: validates current TEST Sheet and returns a fixed fake draft without saving it, billing or calling OpenAI.
- Row 3 LINE no-send dry-run: requires the exact synthetic recipient in Questions and Users, distinct submission ID, manually approved final answer, and unsent delivery state.
- Reports only non-sensitive summary fields. No customer data, access tokens or answer bodies in logs.

The module does **not** call real LINE, Stripe or OpenAI, does not write any Sheet data or Script Property, and never performs payment operations. CI syntax success is not a substitute for the actual GAS user execution.

## Completion evidence

Owner executes this public function in the isolated GAS editor and provides the execution log containing `status:PASS`; an error is a failure to investigate, not permission to relax identity or send restrictions.

Mock acceptance alone is **not** end-to-end release acceptance: Stripe TEST Checkout/Webhook/Users ticket grant, live AI generation (¥0 ceiling prohibits paid API use), and real LINE delivery (forbidden) remain separately unverified or deliberately excluded.

Keep GitHub isolated TEST branch and original GAS source backup unchanged outside additive module installation.
