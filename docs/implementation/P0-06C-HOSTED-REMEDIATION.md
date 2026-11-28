# P0-06C hosted compatibility and security remediation

Production readiness is **NOT READY**. Hosted review uses metadata and public health observations only. No customer records, keys or connection strings were read for this report.

## Engage Stay legacy Data API boundary

For all ten tables the hosted catalog showed RLS disabled, anonymous SELECT and authenticated DML privileges. If exposed through PostgREST, the catalog provides no row-level tenant restriction. Hosted exposure configuration and actual reads or writes with browser identities were not verified. Disposition for every row is **FAIL — unsafe database privileges**. Direct application-table REST access is not used by the reviewed PMS frontend. Recheck other legitimate clients before changing grants.

| Table | Intended boundary | Risk if exposed |
|---|---|---|
| property | Server property scope and membership | Property inventory and organization leakage |
| user | Application sessions and staff administration | Staff identity and role data |
| guest | Authorized property workspace | Guest records |
| reservation | Authorized property workspace and allocation workflow | Booking records and unauthorized changes |
| payment | Authorized property finance workflow | Financial records |
| room | Property inventory workflow | Property room inventory |
| roomType | Property inventory workflow | Property room classifications |
| serviceRequest | Authorized property operations | Guest and operational requests |
| teleCMIUserMapping | Server telephony routing | Staff-level telephony mappings |
| callLog | Server calls and property authorization | Call metadata |

The prepared Stay boundary SQL enables RLS with default denial and revokes table privileges from PUBLIC, anon and authenticated for the listed legacy tables. It fails atomically on unexpected missing objects. Inspect column-level or inherited grants, table ownership, Data API exposed schemas and the actual deployed backend database role before applying. A non-owner backend role may require explicit server-only grants and policies. Keep service keys out of browser code. Review the pg catalog after a disposable application of the migration and verify backend access with the intended role. No hosted RLS changes were applied.

## Upgrade order and operational findings

1. **Owner schema — BLOCKED on hosted approval.** Snapshot and rehearse restore. Reconcile provider migration history with actual objects. Rehearse repository migrations 011 through 018 in order for payment ledger, pricing, atomic activation, outbox, delivery, recovery and repair. Assess 019 separately against existing display-code migrations. Verify foreign keys, existing customer IDs, duplicate processing and safe rollback on a restored isolated copy. Do not seed commercial prices without approval.
2. **Stay schema — BLOCKED on hosted approval.** Reconcile the property and user base schema, Auth bridge and managed workspace columns. Apply reviewed property access and owner-administration SQL against a disposable counterpart before the legacy boundary. Confirm membership backfill policy and audit-table dependency. Keep sample workspaces optional for managed health and preserve existing tenant IDs and all financial records.
3. **Stay storage health — FAIL hosted.** The public API returned 503 with connected false, which means the readiness query failed. Source fixes distinguish managed from sample schema readiness and log a bounded error code. The deployed credential or network failure and the actual connection target remain unconfirmed. Verify the approved direct/pooler DSN, SSL and deployment environment binding using sanitized diagnostics before applying migrations.
4. **Owner routing — FAIL hosted.** The public frontend served HTML but the named backend did not serve the probed routes. The repository routes API traffic under /api, but its health handler previously existed only at /health. The prepared alias /api/health is covered through the real Express handler. Verify deployed project root and alias ownership before promotion. The live 404 cause remains unconfirmed.
5. **Auth/OAuth — PARTIAL.** The public Stay signup endpoint reported email verification disabled. Prepare staging to use verified signup with `ENGAGE_SKIP_EMAIL_VERIFICATION` unset or false, and check intended Supabase confirmation settings before changing hosted configuration. Google redirect construction uses the correct public callback. Microsoft start returned 503. Inspect staging-only provider configuration and consent before release. No production flags, credentials or provider settings were changed.

Hosted browser-role enforcement, migrations, recovery sign-off, OAuth consent and Razorpay Test Mode require separate authorization and a suitable isolated environment.
