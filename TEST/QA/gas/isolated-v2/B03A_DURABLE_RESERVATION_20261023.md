# B-03A TEST durable reservation | 2026-10-23

Scope: isolated GitHub TEST branch only. NOT deployed to GAS, NOT connected to any send entry point.

The new file 07_durable_test_reservation.gs uses script-wide LockService and ScriptProperties, with stable keys ROUTEQ_QA_B03A_RESERVATION_V1_<ID>. Identity checks cover the designated isolated script and spreadsheet, environment, external-send and live-payment hard stops. Feature-specific TEST gates must be ON.

Request snapshots allow only ID, service, SHA-256 fingerprint, approval flag and approval window (at most 60 seconds). Date.now is read by GAS, never supplied by the caller. Nothing containing credential, recipient, body, URL or payment detail is stored.

RESERVED is written and read back while the lock is held. A replay cannot allocate another attempt, including across concurrent executions. The separate attempt function persists UNKNOWN before any later HTTP action would occur. UNKNOWN is never automatically retried. Conflicts, corruption, expiry, gate revocation, lock failure, write errors and readback failure all stop. Never delete historical entries to clear a replay. ScriptProperties capacity limits may also cause safe failure.

Critically, approved:true in an input is NOT trusted proof of a person's approval, and neither function grants an external execution capability. Before actual transport, build a separately reviewed TEST gateway with independent approval evidence, service-specific recipient/amount/identity checks, and a verifiable binding between the frozen fingerprint, reserved ID and transport. Exactly-once external side effects cannot be presumed after a lost HTTP response.

New offline fault tests include cross-context replay, lock contention, storage failure, readback uncertainty, gate and environment changes, corrupted data, strict field validation and no external calls. Existing offline models and network hard stops remain intact.

Remaining: isolated GAS full backup/SHA, controlled deployment, GAS/Sheet functional tests, Stripe TEST, OpenAI and LINE real integration with respective safety approvals and independent acceptance. Commercial assessment: NO-GO.