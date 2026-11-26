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
| P1 | NOT TESTED — Evidence unavailable | Production edge rate limits, named alert recipients, log retention, incident ownership, backup schedule, restore success and provider rollback drill. Stay has application login throttling and structured auth errors. Owner has durable billing and delivery audit records. |
| P1 | NOT TESTED — Evidence unavailable | Verify exact Vercel root, build outputs, routes and scheduler on staging. Owner's checked-in config rewrites API paths and serves the SPA fallback. Stay routes requests through its Node API entry. Verify browser API URL, CORS, cookie origin, OAuth callback and customer frontend checkout pairing against deployed staging URLs. |
| P2 | NOT TESTED — Evidence unavailable | Hosted latency, alert delivery timing and load characterization. |

## Go-live checklist

1. Establish isolated hosted staging with approved costs and secrets. Complete the hosted acceptance gates in the staging runbook.
2. Record exact frontend/backend revisions, Vercel project roots, runtime versions, API routes, host and cookie settings, scheduler token ownership and separate environment variable assignments. Verify health and deny checks over real staging HTTP.
3. Review each migration against a sanitized representative pre-upgrade schema. Check duplicate account codes and existing function definitions before migration 019. Verify indexes, data counts, grants and outbox processing. Do not substitute a fresh database as upgrade evidence.
4. Confirm backup retention and restore a backup into an isolated target. Record restore timing and data-loss bounds. Keep the pre-release application artifact and document which schema changes it can tolerate.
5. Verify alert destinations and ownership for auth denials and errors, provisioning failures, webhook failures, and stuck or dead subscription deliveries. Preserve audit records and keep secrets out of logs.
6. Rehearse rollback. Halt scheduler and webhook processing if correctness is in doubt, preserve the ledger and outbox, restore the prior application artifact if compatible, and reconcile event delivery before resuming. A database restore requires a separate data recovery decision because it can discard subsequent writes.
7. Obtain explicit release approval only after hosted acceptance, real Razorpay Test Mode evidence and rollback sign-off are complete.
