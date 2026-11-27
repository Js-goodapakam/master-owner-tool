# P0-08 Engage Stay core integration

Scope includes the portfolio and managed property navigation, their forms and
dialogs, and their existing PMS route connections. Sample workspaces use a
different persistence model and cannot establish managed-property acceptance.

| Area | Managed workspace status | Evidence or gap |
| --- | --- | --- |
| Login and property selection | Implemented | Supabase identity bridge and scoped property routes. Chromium suite exercises original-password login and opening an assigned property. |
| Portfolio overview, directory and comparisons | Implemented, partial verification | Property access verified. Aggregation and alternate navigation tabs need browser regression. |
| Dashboard, rooms and availability calendar | Implemented, partial verification | Sparse workspace state now renders without sample records. Room creation uses the existing versioned property workspace route. Calendar interactions remain unverified in Chromium. |
| Reservations and guest records | Partial | Stay edits use the shared reservation validator. Guest edits and room allocation wait for the managed save before confirming success. Expanded Chromium assertions cover edit persistence after reload, guest updates and stay history. |
| Front desk, cancellation and room reassignment | Partial | Managed Front Desk and checkout use the workspace API. Expanded checks cover Chromium reassignment and real HTTP concurrent allocation, cancellation and rebooking. Cancellation through the browser remains outstanding. |
| Invoices, finance and rates | Implemented, not browser-tested | Navigation requires the corresponding managed plan module. Property payment records are separate from Razorpay subscription billing. |
| Housekeeping and guest folios | Partial | Managed checkout marks the room Dirty. The Housekeeping page saves Clean and Inspected through the property workspace. Guest folios need managed workflow acceptance. |
| Users and roles | Implemented, not browser-tested | Existing staff APIs enforce role and property permissions. Browser invitations and role edits need acceptance. |
| Onboarding and workspace activation | Implemented, API-verified at baseline | Disposable Supabase, Mailpit and real Owner HTTP handlers cover confirmation, seven steps, resumption, provisioning, duplicate prevention and managed login. Browser signup currently stops at the signup intake's requirement for an HTTPS Supabase project URL and HTTPS client and Owner origins. The disposable services use loopback HTTP. The Owner wizard browser is also unverified. |
| Enquiries, group bookings, communications, tasks and audit | Partial | Sample and backend capabilities vary by module. Managed navigation omits screens whose writes are unsupported or unverified. |
| Reports, help and settings | Partial | Property reporting and help are available. Managed editing of property settings needs a scoped write contract and browser acceptance. |
| Channel Manager | Provider acceptance blocked | No OTA connection is authorized. |

## Provider dependencies

| Integration | Existing boundary | Remaining acceptance |
| --- | --- | --- |
| Supabase | Confirmed Auth UUID is linked to the provisioned property account. Local Supabase exercises Auth, Mailpit, PostgREST, PostgreSQL and private Storage. | Use separate staging projects and staging-only keys. Verify hosted Auth email delivery, OAuth redirects, issued JWTs, RLS and private Storage using synthetic identities. Review intake retry and duplicate provisioning in the hosted setup. |
| Razorpay | Existing order, signed capture, reconciliation and subscription delivery use order/payment references and tenant-scoped entitlement revisions. Isolated CI uses synthetic provider events. | Approved plan prices, authorized Test Mode keys and a staging webhook URL. Verify real test capture, webhook retries and entitlement delivery. |
| OTA | Channel Manager and inventory UI exist. | Obtain provider authorization and sandbox credentials, then validate property, room-type and rate-plan mappings, reservation identity, replay handling and inventory reconciliation. |

## Before hosted staging

### P0-08C isolated acceptance

- The managed calendar keeps cancelled stays out of its default month and agenda views. Staff can explicitly select Cancelled to inspect history.
- The Chromium journey now asserts cancellation persistence across reload, rejection of an overlapping booking, rebooking the released room, and recording a synthetic guest payment against the reservation balance. Guest payment recording uses the PMS workspace API and does not send a gateway request.
- Staff assertions cover creating a branch account, editing its role, reloading it and deactivating it. The property-switching fixture has a separate managed workspace and grants the synthetic administrator explicit access. It checks that room records do not carry over after navigation or reload.
- Invoice and full folio acceptance, staff-session permission denial, and the Owner wizard browser path still require dedicated coverage. The signup intake checks the Supabase project hostname in addition to HTTPS, so loopback TLS alone cannot satisfy it. The local workflow leaves the production validation unchanged.

1. Complete browser-driven signup, Owner onboarding and reservation-to-checkout on isolated services.
2. Accept managed housekeeping, finance, cancellation, reassignment, staff and role workflows.
3. Extend keyboard, error-state and responsive verification beyond login, dashboard and rooms.
4. Resolve the existing free-capacity and commercial-hosting blockers, then verify the hosted provider boundaries before release approval.

Production readiness remains **NOT READY**.
