# P0-07A release readiness

Decision: **NOT READY — HOSTED ACCEPTANCE BLOCKED**.

## Findings and evidence

| Priority | Status | Control or finding |
| --- | --- | --- |
| P0 | PASS — Verified in isolation | Owner token, role and product checks. Stay immutable Auth UUID mapping, property membership, protected routes, and existing-session suspension. See integrated CI 45768694465. |
| P0 | PASS — Verified in isolation | Ordered Owner migrations on fresh PostgreSQL and local Supabase, private ledger/service-role access, Mailpit signup, onboarding and Stay property access. |
| P0 | PASS — Verified in isolation | Signed capture fixtures, server amounts, atomic activation, replay protection, recovery, outbox retries, expired leases, and Stay revision ordering. |
| P0 | FAIL — Confirmed defect on audit baseline | Signup-linked onboarding writes lacked a product check. The feature-branch fix scopes the signup lookup before account reservation or session mutation. |
| P0 | FAIL — Confirmed defect on audit baseline | Employee middleware intercepted the server-only expiry worker. The expiry update could also race a renewal because the write did not recheck the expiry cutoff. The feature-branch fix retains the worker's service-token check and makes the update conditional. |
| P0 | BLOCKED — External dependency | Hosted staging capacity, hosted Auth/RLS/Storage/OAuth, approved Razorpay Test Mode credentials and pricing, live staging webhook and full journey. See the staging runbook. |
| P0 | NOT TESTED — Evidence unavailable | Apply all migrations to a representative sanitized pre-upgrade schema. Fresh installs do not prove upgrade compatibility. Migration 019's unique account-code index can fail if historical duplicates exist. |
| P0 | PASS — Offline routing preparation | The pinned Stay frontend `a4a440f5edc0627f46ef7a293d65be7809ed741a` passed two routing tests, a production-mode build and staging artifact generation. Production keeps its checked-in routing. Staging builds use the separately generated same-origin artifact. Hosted proxy and cookie behavior remain BLOCKED. See [integrated CI](https://github.com/Js-goodapakam/master-owner-tool/actions/runs/45798969794). |
| P0 | PASS — Repository upgrade and restore rehearsal | Disposable PostgreSQL 16 restored the repository reconstruction at migrations 001–018 with synthetic linked records, then applied and replayed migration 019. Duplicate account codes prevented index creation and left both rows intact. See [CI upgrade job](https://github.com/Js-goodapakam/master-owner-tool/actions/runs/45798969794/job/139836864334). |
| P1 | NOT TESTED — Evidence unavailable | Production edge rate limits, named alert recipients, log retention, incident ownership, backup schedule, restore success and provider rollback drill. Stay has application login throttling and structured auth errors. Owner has durable billing and delivery audit records. |
| P1 | NOT TESTED — Evidence unavailable | Verify exact Vercel root, build outputs, routes and scheduler on staging. Owner's checked-in config rewrites API paths and serves the SPA fallback. Stay routes requests through its Node API entry. Verify browser API URL, CORS, cookie origin, OAuth callback and customer frontend checkout pairing against deployed staging URLs. |
| P2 | NOT TESTED — Evidence unavailable | Hosted latency, alert delivery timing and load characterization. |

## Go-live checklist

The upgrade rehearsal runs `bash Database/tests/upgrade-restore.sh` inside
the existing PostgreSQL 16 CI job. It uses the service's matching tools:
`pg_dump --format=custom --username=owner_test engage_upgrade_source` and
`pg_restore --exit-on-error --single-transaction --username=owner_test --dbname=engage_upgrade_restore`.
It compares row counts, the linked signup/tenant/subscription/payment fixture
and foreign-key counts before and after restore, and checks the new unique
index and restricted RPC after upgrade. A newer runner client initially
produced a restoration setting unsupported by PostgreSQL 16. Using the service
container's version-matched client fixed the failure.

The baseline includes an explicitly simulated legacy account-code column.
There is no verified production schema snapshot or exact deployed migration
history in this rehearsal. Production-equivalent upgrade compatibility stays
unverified. Restoring a database is data recovery and can discard later
writes. An application rollback swaps the deployed artifact and requires an
independent compatibility check against the current database.

1. Establish isolated hosted staging with approved costs and secrets. Complete the hosted acceptance gates in the staging runbook.
2. Record exact frontend/backend revisions, Vercel project roots, runtime versions, API routes, host and cookie settings, scheduler token ownership and separate environment variable assignments. Verify health and deny checks over real staging HTTP.
3. Review each migration against a sanitized representative pre-upgrade schema. Check duplicate account codes and existing function definitions before migration 019. Verify indexes, data counts, grants and outbox processing. Do not substitute a fresh database as upgrade evidence.
4. Confirm backup retention and restore a backup into an isolated target. Record restore timing and data-loss bounds. Keep the pre-release application artifact and document which schema changes it can tolerate.
5. Verify alert destinations and ownership for auth denials and errors, provisioning failures, webhook failures, and stuck or dead subscription deliveries. Preserve audit records and keep secrets out of logs.
6. Rehearse rollback. Halt scheduler and webhook processing if correctness is in doubt, preserve the ledger and outbox, restore the prior application artifact if compatible, and reconcile event delivery before resuming. A database restore requires a separate data recovery decision because it can discard subsequent writes.
7. Obtain explicit release approval only after hosted acceptance, real Razorpay Test Mode evidence and rollback sign-off are complete.
