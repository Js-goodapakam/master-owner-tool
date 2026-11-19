# Engagehubs P0/P1 implementation status

Last verified: 2026-11-19

| ID | Priority | Status | Evidence / next action |
| --- | --- | --- | --- |
| P0-S1 | P0 | Partially implemented and integration-tested | Product context is fail-closed and enforced for customer, Customer 360, documents, entitlement, signup queue, onboarding lookup, Engage Stay lifecycle, provisioning history, plans, subscriptions, audit history, integrations and non-global employee-directory reads (`63a618b`, `2bd7ab9`, `a0897d0`, `96879d4`, `fbe8a23`). The isolated control-plane harness now proves a non-global employee receives `403 PRODUCT_ACCESS_DENIED` for an unassigned product. Remaining: configuration/infrastructure scope decisions and connected-database verification. |
| P0-S2 | P0 | Implemented but unverified end-to-end | Engage Stay signup intake uses authenticated idempotent service-to-service requests. A controlled external identity is required for a real OAuth signup test. |
| P0-O1 | P0 | Partially implemented; verified in isolated PostgreSQL and SQL-backed Express tests | Seven-step onboarding persists sessions and creates customer/product/tenant records. The isolated loopback HTTP harness exercises the real Express authentication middleware and onboarding handler for initial save, steps 2–7 resume, missing-field validation, duplicate customer rejection, and invalid-step validation. It uses the local in-memory repository only; connected Supabase persistence, signup-request approval, tenant creation and activation still require a dedicated non-production control-plane adapter or database. |
| P0-P1 | P0 | Partially implemented; durable ledger verified in isolated PostgreSQL | Engage Stay managed workspace API supports provisioning and entitlement synchronization. Safe production test identity is still required for end-to-end provisioning. |
| P0-C1 | P0 | Implemented; isolated SQL and PostgreSQL-backed Express route tests passed | Subscription lifecycle and entitlement endpoints exist. The isolated control-plane harness exercises trial activation, duplicate activation rejection, plan change, suspension, reactivation, explicit renewal, invalid transition validation, and entitlement sync success/failure against real Express routes. The server-only expiry evaluator selects due Trial/Active subscriptions with an injected-clock core and uses conditional state updates so repeated worker runs do not re-expire a record. It intentionally does not auto-renew without a verified payment or explicit Owner renewal. Isolated PostgreSQL and SQL-backed Express tests now verify worker expiry, explicit renewal, durable retry/ledger persistence and audit; real Supabase REST/role integration remains outstanding. |
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


## Task 4 — verified isolated PostgreSQL 16 integration (2026-11-19)

**GitHub Actions evidence:** https://github.com/Js-goodapakam/master-owner-tool/actions/runs/44498087177
**Verified source commit:** 907e22295682b7bb07b18f548a4a4972449edd0f
**Branch:** test/owner-postgres-integration — not merged to production main.

| Test classification | Evidence | Result |
| --- | --- | --- |
| Database guard tests | Fail-closed URL/context tests and connected identity check | 3 passed / 0 failed |
| Unit and in-process Express suites | Existing Owner Vitest regression suite (some unit, some local-memory/synthetic HTTP route tests) | 17 passed / 0 failed |
| Real PostgreSQL database contracts | 17 tests using Node pg against the full repository migrations, synthetic rows only | 17 passed / 0 failed |
| Real Express routes + PostgreSQL-backed HTTP boundary | 11 tests, real Owner API/auth/product middleware writing to real PostgreSQL via test-only REST SQL adapter | 11 passed / 0 failed |
| Supabase Auth, PostgREST, Storage, RLS for anon/authenticated | Not exercised by these tests | Not verified |
| Production smoke tests | No production credentials or requests | Not run |

**Total verified: 48 passed, 0 failed. PostgreSQL 16.16. Backend build successful.**

### Implementation and application evidence

- Guard requires OWNER_TEST_DATABASE_URL and OWNER_TEST_DATABASE_ID with an
  engage-owner-test prefix, GitHub Actions test context, exact localhost
  engage_owner_test / engage_owner_test identity, and real server version check.
  DATABASE_URL, production connection strings and Supabase credentials are
  rejected. No fallback or external PostgreSQL endpoint is allowed.
- The runner applies all repository migrations 001 through 011 to disposable
  PostgreSQL. Minimal fake auth.users and storage.buckets metadata are used
  **only** to meet schema dependencies; they do not constitute Supabase Auth,
  Storage, PostgREST, or tenant-role RLS tests.
- SQL tests verify seven-step state persistence and resume on a single
  onboarding session, duplicate signup/session rejection, stable tenant IDs,
  unique tenant slugs/account codes, trial/active subscriptions and unique
  current terms, upgrade/downgrade, suspension/reactivation, manual renewal,
  injected-clock expiry selection, concurrent ledger inserts, row locking,
  failed-operation retries, stable operation and tenant IDs, rollback, and
  committed audit consistency.
- PostgreSQL-backed Express tests exercise real authentication middleware
  with synthetic identities, product-scoped authorization, 7 onboarding
  **writes**, duplicate activation rejection, subscription mutations,
  service-token expiry-worker execution and its idempotent second call,
  entitlement persistence, upstream-ack provisioning replay, upstream failure,
  and successful retry with incremented attempt_count. The token verification
  and upstream Engage Stay acknowledgment are test-only HTTP boundaries.
- A real API defect was fixed: the service-token expiry worker was previously
  rejected by the global Owner-session middleware (HTTP 401). Only its
  explicitly protected POST route now bypasses that middleware and performs
  its own constant-time service-token authentication.
- Failed provisioning retries now increment attempt_count instead of resetting
  it to 1. Replay of a SUCCEEDED provisioning job does not rerun it.
- Migration 011 adds a partial unique index on active/trial subscriptions and
  a tenant account_code column/index. **Review existing duplicate live terms
  before applying this migration to any shared environment.**

### Remaining blockers and unverified boundaries

- The reserve_tenant_account_code RPC referenced by connected onboarding
  is absent from the checked-in SQL migrations. Seven HTTP onboarding writes
  **without a signup request ID create seven separate sessions**, not one
  resumed session. The single-session seven-step resume was verified via SQL,
  not through the connected signup approval handler. Full signup-to-tenant
  activation remains blocked on that RPC/adapter contract.
- Full Supabase Auth token validation, PostgREST query semantics, RLS under
  anon/authenticated roles, Storage policies, and genuine OAuth are untested.
  The SQL compatibility layer is **not** a Supabase service.
- Real Engage Stay workspace provisioning and entitlement propagation were
  replaced by synthetic upstream responses in route tests. No external tenant
  was created or modified. Cross-service atomicity and partial write recovery
  require later service-isolated acceptance tests.
- The Owner API authenticates internal employees; customer-facing tenant
  session isolation and suspended customer self-access must be verified in
  the actual product backend. The Owner administrative API must still permit
  controlled reactivation of a suspended customer.
- Invalid subscription state transitions beyond schema uniqueness and existing
  input validation are not comprehensively denied by every API action.
  Billing/payment verification and unattended paid renewals were not tested.
- Existing application data and Production/Preview Supabase databases were
  not accessed. Changes remain on the dedicated test branch.
