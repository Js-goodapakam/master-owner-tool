# Engagehubs P0/P1 implementation status

Last verified: 2026-11-23

| ID | Priority | Status | Evidence / next action |
| --- | --- | --- | --- |
| P0-S1 | P0 | Partially implemented and integration-tested | Product context is fail-closed and enforced for customer, Customer 360, documents, entitlement, signup queue, onboarding lookup, Engage Stay lifecycle, provisioning history, plans, subscriptions, audit history, integrations and non-global employee-directory reads (`63a618b`, `2bd7ab9`, `a0897d0`, `96879d4`, `fbe8a23`). The isolated control-plane harness now proves a non-global employee receives `403 PRODUCT_ACCESS_DENIED` for an unassigned product. Remaining: configuration/infrastructure scope decisions and connected-database verification. |
| P0-S2 | P0 | Implemented but unverified end-to-end | Engage Stay signup intake uses authenticated idempotent service-to-service requests. A controlled external identity is required for a real OAuth signup test. |
| P0-O1 | P0 | Partially implemented and route-tested | Seven-step onboarding persists sessions and creates customer/product/tenant records. The isolated loopback HTTP harness exercises the real Express authentication middleware and onboarding handler for initial save, steps 2–7 resume, missing-field validation, duplicate customer rejection, and invalid-step validation. It uses the local in-memory repository only; connected Supabase persistence, signup-request approval, tenant creation and activation still require a dedicated non-production control-plane adapter or database. |
| P0-P1 | P0 | Partially implemented | Engage Stay managed workspace API supports provisioning and entitlement synchronization. Safe production test identity is still required for end-to-end provisioning. |
| P0-C1 | P0 | Partially implemented and integration-tested | Subscription lifecycle and entitlement endpoints exist. The isolated control-plane harness exercises trial activation, duplicate activation rejection, plan change, suspension, reactivation, explicit renewal, invalid transition validation, and entitlement sync success/failure against real Express routes. The server-only expiry evaluator selects due Trial/Active subscriptions with an injected-clock core and uses conditional state updates so repeated worker runs do not re-expire a record. It intentionally does not auto-renew without a verified payment or explicit Owner renewal. Connected-database execution and durable retry/event-ledger verification remain outstanding. |
| P0-M1 | P0 | Partially implemented and PostgreSQL-tested | Isolated GitHub Actions PostgreSQL 16 now applies synthetic Engage Stay schema/fixtures and executes property-key isolation plus row-lock/compare-and-swap concurrency tests (`a7fe587`, `db1626a`). The fail-closed guard remains in place. Hosted Supabase RLS and full reservation-allocation acceptance still require a separate Supabase staging project. |
| P1-360 | P1 | Partially implemented | Customer 360 and private document management exist; user administration and broader lifecycle UI require verification. |
| P1-UX | P1 | Partially implemented | Product selector and light/dark work are deployed; visual regression checks across required viewports remain outstanding. |
| P0-AUTH | P0 | Implemented and unit-tested; external journey pending | Supabase identity bridge validates access tokens server-side, links the immutable Auth UUID to the PMS user/property, preserves legacy credentials, and denies unmapped or suspended workspaces (`f354970`, `ea4dc1f`). A controlled approved identity is still required for the real signup-to-login journey. |
| P0-ISO | P0 | Partially implemented and unit-tested | PMS property membership is checked server-side for selection and workspace access; unassigned and suspended properties are denied. Reservation state validation rejects overlapping active room allocations, while production concurrency verification remains outstanding. |
| P0-O2 | P0 | Implemented and synthetic control-plane tested | Real Owner Express routes now have isolated coverage for idempotent Engage Stay signup intake, seven persisted onboarding steps, server-issued account IDs, identity-linked workspace approval, durable provisioning-job replay, subscription lifecycle and entitlement synchronization. It is not hosted Supabase/Auth/OAuth acceptance. |

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

## Isolated PostgreSQL CI (2026-11-23)

- Owner Tool: a disposable PostgreSQL 16 service now runs the complete ordered migration set. The migration runner supplies only CI-local `auth.users` and `storage.buckets` compatibility relations, then applies all ten project migrations. GitHub Actions run `45194208649` passed its build, lint, 17 API tests and migration step at commit `c03addf`.
- Engage Stay: a disposable PostgreSQL 16 service applies a CI-only base schema plus the four existing Engage Stay SQL migrations, synthetic property/user/workspace fixtures, and actual PostgreSQL property-isolation and row-lock/CAS tests. GitHub Actions run `45189850695` passed at commit `db1626a`; the local suite reports 59 passed and 3 database tests skipped when no isolated URL is configured.
- These checks never receive Production or shared Preview connection variables. `docs/implementation/SUPABASE-STAGING-REQUIREMENTS.md` records the remaining hosted Supabase acceptance prerequisites.
