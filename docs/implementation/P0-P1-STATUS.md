# Engagehubs P0/P1 implementation status

Last verified: 2026-11-19

| ID | Priority | Status | Evidence / next action |
| --- | --- | --- | --- |
| P0-S1 | P0 | Partially implemented and integration-tested | Product context is fail-closed and enforced for customer, Customer 360, documents, entitlement, signup queue, onboarding lookup, Engage Stay lifecycle, provisioning history, plans, subscriptions, audit history, integrations and non-global employee-directory reads (`63a618b`, `2bd7ab9`, `a0897d0`, `96879d4`, `fbe8a23`). The isolated control-plane harness now proves a non-global employee receives `403 PRODUCT_ACCESS_DENIED` for an unassigned product. Remaining: configuration/infrastructure scope decisions and connected-database verification. |
| P0-S2 | P0 | Implemented but unverified end-to-end | Engage Stay signup intake uses authenticated idempotent service-to-service requests. A controlled external identity is required for a real OAuth signup test. |
| P0-O1 | P0 | Partially implemented and route-tested | Seven-step onboarding persists sessions and creates customer/product/tenant records. The isolated loopback HTTP harness exercises the real Express authentication middleware and onboarding handler for initial save, steps 2–7 resume, missing-field validation, duplicate customer rejection, and invalid-step validation. It uses the local in-memory repository only; connected Supabase persistence, signup-request approval, tenant creation and activation still require a dedicated non-production control-plane adapter or database. |
| P0-P1 | P0 | Partially implemented | Engage Stay managed workspace API supports provisioning and entitlement synchronization. Safe production test identity is still required for end-to-end provisioning. |
| P0-C1 | P0 | Partially implemented and integration-tested | Subscription lifecycle and entitlement endpoints exist. The isolated control-plane harness exercises trial activation, duplicate activation rejection, plan change, suspension, reactivation, explicit renewal, invalid transition validation, and entitlement sync success/failure against real Express routes. The server-only expiry evaluator selects due Trial/Active subscriptions with an injected-clock core and uses conditional state updates so repeated worker runs do not re-expire a record. It intentionally does not auto-renew without a verified payment or explicit Owner renewal. Connected-database execution and durable retry/event-ledger verification remain outstanding. |
| P0-M1 | P0 | Partially implemented and unit-tested | Isolated PMS tests cover property-state validation, room allocation conflicts, clean-room check-in, settled check-out and Dirty-housekeeping handoff (`4becbf1`). The concurrency runner now fails closed unless `ENGAGE_TEST_DATABASE_URL` and a dedicated `ENGAGE_TEST_DATABASE_ID` identify a separate non-production database (`75f3f4e`); no dedicated Supabase project exists yet, so PostgreSQL load execution remains blocked. |
| P1-360 | P1 | Partially implemented | Customer 360 and private document management exist; user administration and broader lifecycle UI require verification. |
| P1-UX | P1 | Partially implemented | Product selector and light/dark work are deployed; visual regression checks across required viewports remain outstanding. |
| P0-AUTH | P0 | Implemented and unit-tested; external journey pending | Supabase identity bridge validates access tokens server-side, links the immutable Auth UUID to the PMS user/property, preserves legacy credentials, and denies unmapped or suspended workspaces (`f354970`, `ea4dc1f`). A controlled approved identity is still required for the real signup-to-login journey. |
| P0-ISO | P0 | Partially implemented and unit-tested | PMS property membership is checked server-side for selection and workspace access; unassigned and suspended properties are denied. Reservation state validation rejects overlapping active room allocations, while production concurrency verification remains outstanding. |

## Current deployment evidence

- Owner client production deployment for `63a618b`: READY.
- Owner server production deployment for `63a618b`: READY.
- Production smoke checks: client `/` = 200, server `/health` = 200, unauthenticated `/api/products` = 401.

## Safety boundaries

- No production customer, reservation, billing or identity data is used as a test fixture.
- No destructive migration is pending in this batch.
- OAuth and service credentials are never committed or displayed.

## Isolated Owner API harness (2026-11-19)

- `Server/src/app.integration.test.ts` starts the actual Owner Express application on loopback and signs in through the intentionally local-only demo session path. It does not mock route handlers, does not set Supabase credentials, and cannot reach Production or Preview.
- Current coverage: unauthenticated onboarding write denial; invalid product route denial; seven-step create/resume behavior; invalid/missing onboarding input; duplicate customer prevention.
- This is **not** a PostgreSQL or Supabase integration test. Subscription activation, entitlement synchronization, signup approval, provisioning retry, and cross-product employee role assertions remain outstanding because those routes deliberately require the connected control plane. A dedicated test database or isolated Supabase REST adapter is still needed before claiming that coverage.
- Commit `793c1b6` was pushed to `main`; the Git-connected Owner server production deployment `dpl_AT3RYNHWCg34pQhVvqdVGyC9AWKV` reached `READY`. External HTTP smoke requests remain protected by Vercel SSO, so no application response has been claimed from unauthenticated curl.

## Synthetic control-plane adapter (2026-11-19)

- `Server/src/app.control-plane.integration.test.ts` is an in-process Supabase REST boundary adapter with fixed synthetic users, product assignments, customer, plans, subscriptions, entitlements and audit records. It runs real Express routes and the normal Supabase-token authentication middleware; neither route handlers nor authorization logic are mocked.
- Current route coverage: trial activation; duplicate active-subscription rejection; plan change; suspension/reactivation; invalid change validation; a Stay-only employee denied Fit access; entitlement synchronization success; and downstream synchronization failure reporting.
- It is **not** a real PostgreSQL, Supabase, Engage Stay, or OAuth test. Signup approval, provisioning job retry/idempotency, renewal/expiry processing and Trial-to-Live acceptance remain incomplete until a dedicated isolated database/control-plane environment is available.

## Subscription expiry and renewal (2026-11-19)

- `Server/src/subscriptionLifecycle.ts` provides injected-clock expiry selection; `Server/src/subscriptionLifecycle.test.ts` covers due, suspended, and no-expiry behavior.
- `POST /api/internal/subscriptions/evaluate-expiry` is restricted to the existing Owner service token. It is intended for a protected scheduler and processes only due `TRIAL`/`ACTIVE` subscriptions, transitions them to `EXPIRED`, and suspends the related customer/product assignment. A second run skips already processed records.
- `PATCH /api/subscriptions/:id` now supports explicit `RENEW` with a required new expiry date. This preserves the existing subscription/customer/tenant identities; it does not infer payment success.


## Task 4 — isolated PostgreSQL 16 integration verification (test/owner-postgres-integration)

This batch introduces a real PostgreSQL suite and an additive uniqueness
migration for one current TRIAL/ACTIVE subscription per customer/product.
The provisioning_jobs table and unique product/idempotency-key ledger already
existed in migration 002; the tests exercise that schema, including concurrent
inserts, row locking, retry, stable identities, and rollback with audit writes.

Verification categories (not interchangeable):

- **Unit tests:** Existing Vitest suite, including the injected-clock
  expiredSubscriptions pure expiry evaluator.
- **In-process Express tests:** Existing real Express routes with local or
  synthetic HTTP stores; these are not PostgreSQL-backed.
- **Real PostgreSQL integration tests:** Migrations 001–011 against disposable
  GitHub Actions PostgreSQL 16. Covers signup/session uniqueness, seven
  persisted onboarding stages, resume, tenant uniqueness, subscription
  persistence and uniqueness, expiry selection, provisioning ledger concurrency,
  transactions, and audit consistency. These are SQL-level database contract
  checks, not the entire Express-to-PostgREST flow.
- **Supabase-specific integration tests:** Not performed. Bare PostgreSQL has
  no Supabase Auth, PostgREST, Storage, or realistic user-role RLS behavior.
  The test bootstrap creates minimal auth.users and storage.buckets metadata
  solely to satisfy migration dependencies.
- **Production smoke tests:** Not performed.

Remaining blockers: The connected onboarding and subscription handlers use
Supabase REST and have not been exercised against genuine PostgREST. The
reserve_tenant_account_code RPC referenced by the signup/tenant routes is
absent from the checked-in migrations. Actual signup approval, external
Engage Stay provisioning, OAuth, entitlement delivery, and payment verification
cannot be certified. The multi-request provisioning path still has a
cross-service partial-failure risk, and the expiry worker's HTTP customer/
product suspension updates are not proven by SQL-level tests.

Safety: The CI job uses only OWNER_TEST_DATABASE_URL and OWNER_TEST_DATABASE_ID,
restricted to its own localhost PostgreSQL 16 service. No Production or
Preview credentials are injected, and database operations require a
successful live identity check.
