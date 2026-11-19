# Engagehubs P0/P1 implementation status

Last verified: 2026-11-19

| ID | Priority | Status | Evidence / next action |
| --- | --- | --- | --- |
| P0-S1 | P0 | Partially implemented and tested | Product context is fail-closed and enforced for customer, Customer 360, documents, entitlement, signup queue, onboarding lookup, Engage Stay lifecycle, provisioning history, plans, subscriptions, audit history, integrations and non-global employee-directory reads (`63a618b`, `2bd7ab9`, `a0897d0`, `96879d4`, `fbe8a23`). Remaining: configuration/infrastructure scope decisions and dedicated negative HTTP tests. |
| P0-S2 | P0 | Implemented but unverified end-to-end | Engage Stay signup intake uses authenticated idempotent service-to-service requests. A controlled external identity is required for a real OAuth signup test. |
| P0-O1 | P0 | Partially implemented and route-tested | Seven-step onboarding persists sessions and creates customer/product/tenant records. The isolated loopback HTTP harness exercises the real Express authentication middleware and onboarding handler for initial save, steps 2–7 resume, missing-field validation, duplicate customer rejection, and invalid-step validation. It uses the local in-memory repository only; connected Supabase persistence, signup-request approval, tenant creation and activation still require a dedicated non-production control-plane adapter or database. |
| P0-P1 | P0 | Partially implemented | Engage Stay managed workspace API supports provisioning and entitlement synchronization. Safe production test identity is still required for end-to-end provisioning. |
| P0-C1 | P0 | Partially implemented | Subscription lifecycle and entitlement endpoints exist. Product-scoping and lifecycle regression tests remain to be completed. |
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
