# Engage Stay Owner Control Plane — implementation specification

## Scope
This repository is an operational SaaS control plane, not a CRM or payment platform. Keep sales, invoicing, payment collection, and revenue analytics out of the Owner Console. Product selection is the root authenticated experience; Engage Stay is the first fully supported workspace, with Engage Fit, Engage Realty and Engage CRM shown as unavailable until adapters are implemented.

## Product workspace modules
1. Overview: live counts of pending registrations, active/trial/suspended tenants, provisioning failures, integration health and expiry warnings; never fabricated metrics.
2. Registration Inbox: customer self-registration, verified email and phone, duplicate detection, owner approval/rejection, review notes, attachments and immutable decision history.
3. Organizations & Tenants: canonical customer registry; organization-to-many-product tenants; one Engage Stay tenant may have multiple properties; searchable lifecycle status and environment assignment.
4. Provisioning Center: idempotent tenant creation, admin assignment, plan assignment, initial feature flags, job progress, retries and compensation.
5. Plans & Entitlements: Basic/Premium/Enterprise per product; versioned plan definitions; per-tenant feature overrides with reason/expiry; limits for properties, rooms, staff, integrations and storage (actual values configurable, not invented).
6. Properties & Locations: list linked properties, tenant-level limits, provisioned status; operational hotel data stays in Engage Stay.
7. Account Lifecycle: trial start/end, activate, suspend, reactivate, archive, retention and deletion request workflow; reason, approvals and audit.
8. Identity & Access: owner RBAC, customer admin assignment, MFA policy, session revocation and least privilege; never store plaintext passwords.
9. Integrations & Sync: signed service-to-service API, health status, webhook delivery, outbox/inbox, retry/dead-letter queue and reconciliation; source-of-truth fields documented.
10. Environment & Infrastructure: dev/staging/production separation; actual provider connections and resource status; no mock uptime.
11. Data Protection: verified backup job inventory, restore-test evidence, export and deletion workflows; never display fake completed backups.
12. Support Operations: tenant-scoped diagnostic timeline, safe impersonation only with explicit approval, time limit, audit and customer notification where applicable.
13. Audit & Change History: append-only actor/action/before/after/request id/timestamp for privileged changes.
14. Product Settings: signup controls, verification providers, feature catalog, API credentials stored in secrets manager, notifications and templates.

## Signup and provisioning lifecycle
- Customer enters company name, contact name, email, phone, and minimal business details via Engage Stay signup; consent and anti-abuse controls.
- Verify email and mobile with expiring, rate-limited challenges. Never mark verified based solely on form submission.
- Create registration with PENDING_REVIEW; alert Owner Console.
- Owner APPROVE or REJECT with notes; prevent unverified activation.
- Upon approval, choose product environment and plan, then start a durable provisioning job with idempotency key.
- Create tenant and admin identity in Engage Stay; synchronize entitlements; read back applied version and status.
- Mark ACTIVE/TRIAL only after acknowledged provisioning; otherwise PROVISIONING_FAILED and expose safe retry.
- Upgrades/downgrades: change-request -> authorization -> versioned entitlement assignment -> outbox event -> Engage Stay acknowledgement -> reconciliation -> APPLIED. If failed, show SYNC_PENDING/FAILED rather than success.
- Payment verification is an external prerequisite flag supplied by an authorized workflow; no billing processing in Owner Tool.

## Data model
products, product_environments, organizations, contacts, registrations, verification_challenges, tenants, tenant_properties_summary, plans, plan_versions, features, plan_entitlements, tenant_entitlement_overrides, tenant_plan_assignments, lifecycle_requests, provisioning_jobs, integration_connections, outbound_events, inbound_events, sync_attempts, audit_events, owner_users, owner_roles, owner_permissions, support_sessions, backup_jobs, restore_tests.
All tenant-bound tables must carry tenant_id and appropriate indexes, constraints and row-level access controls.

## API contracts
POST /public/engage-stay/registrations
POST /public/registrations/:id/verify-email
POST /public/registrations/:id/verify-phone
GET /owner/products
GET /owner/products/:productId/registrations
POST /owner/registrations/:id/decision
POST /owner/registrations/:id/provision
GET /owner/products/:productId/tenants
GET /owner/tenants/:tenantId
POST /owner/tenants/:tenantId/plan-changes
POST /owner/tenants/:tenantId/lifecycle-requests
GET /owner/jobs/:jobId
GET /owner/tenants/:tenantId/sync-status
POST /internal/engage-stay/events
All owner endpoints require authenticated role and resource authorization; internal endpoints require service credentials and replay protection. Use explicit request/response schemas and consistent error codes.

## UI navigation
Global product chooser -> Engage Stay -> Overview, Registrations, Customers, Provisioning, Plans & Entitlements, Properties, Lifecycle, Integrations, Environments, Backups, Support, Audit, Settings. Customer detail tabs: Summary, Contacts, Properties, Plan & Limits, Access, Integration Health, Activity.

## Engineering gates
No production mutation until tests pass in staging. Add migration rollback plan, RBAC/tenant isolation tests, signup verification tests, idempotent provisioning tests, entitlement sync contract tests, audit coverage, no-fake-metrics checks, and accessibility tests. Preserve existing customer data and compatible API contracts until a documented migration is ready.
