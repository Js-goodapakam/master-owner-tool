# Engagehubs P0/P1 implementation status

Last verified: 2026-11-17

| ID | Priority | Status | Evidence / next action |
| --- | --- | --- | --- |
| P0-S1 | P0 | Partially implemented and tested | Product context is fail-closed and enforced for customer, Customer 360, documents, entitlement, signup queue, onboarding lookup, Engage Stay lifecycle, provisioning history, plans, subscriptions, audit history, integrations and non-global employee-directory reads (`63a618b`, `2bd7ab9`, `a0897d0`, `96879d4`, `fbe8a23`). Remaining: configuration/infrastructure scope decisions and dedicated negative HTTP tests. |
| P0-S2 | P0 | Implemented but unverified end-to-end | Engage Stay signup intake uses authenticated idempotent service-to-service requests. A controlled external identity is required for a real OAuth signup test. |
| P0-O1 | P0 | Partially implemented | Seven-step onboarding persists sessions and creates customer/product/tenant records. Refresh/resume and activation paths require further automated integration coverage. |
| P0-P1 | P0 | Partially implemented | Engage Stay managed workspace API supports provisioning and entitlement synchronization. Safe production test identity is still required for end-to-end provisioning. |
| P0-C1 | P0 | Partially implemented | Subscription lifecycle and entitlement endpoints exist. Product-scoping and lifecycle regression tests remain to be completed. |
| P0-M1 | P0 | Unverified | Core PMS routes require repository/API audit and controlled tenant tests before a completion claim. |
| P1-360 | P1 | Partially implemented | Customer 360 and private document management exist; user administration and broader lifecycle UI require verification. |
| P1-UX | P1 | Partially implemented | Product selector and light/dark work are deployed; visual regression checks across required viewports remain outstanding. |

## Current deployment evidence

- Owner client production deployment for `63a618b`: READY.
- Owner server production deployment for `63a618b`: READY.
- Production smoke checks: client `/` = 200, server `/health` = 200, unauthenticated `/api/products` = 401.

## Safety boundaries

- No production customer, reservation, billing or identity data is used as a test fixture.
- No destructive migration is pending in this batch.
- OAuth and service credentials are never committed or displayed.
