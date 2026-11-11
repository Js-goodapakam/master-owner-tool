-- Phase 1: additive control-plane foundation. This migration is intentionally
-- non-destructive and keeps operational customer data in product applications.

alter table products
  add column if not exists category text,
  add column if not exists icon_key text,
  add column if not exists client_app_url text,
  add column if not exists api_endpoint text,
  add column if not exists commercial_status text not null default 'PLANNED',
  add column if not exists adapter_status text not null default 'NOT_CONNECTED',
  add column if not exists configuration jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table product_modules
  add column if not exists status text not null default 'PLANNED',
  add column if not exists implementation_state text not null default 'NOT_IMPLEMENTED',
  add column if not exists dependency_metadata jsonb not null default '[]'::jsonb,
  add column if not exists description text;

alter table product_features
  add column if not exists status text not null default 'PLANNED',
  add column if not exists implementation_state text not null default 'NOT_IMPLEMENTED',
  add column if not exists dependency_metadata jsonb not null default '[]'::jsonb,
  add column if not exists description text;

alter table audit_logs
  add column if not exists organization_id uuid references organizations(id),
  add column if not exists product_id uuid references products(id),
  add column if not exists reason text,
  add column if not exists correlation_id uuid,
  add column if not exists result text not null default 'SUCCESS';

create table if not exists product_environments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  environment text not null check (environment in ('DEVELOPMENT','STAGING','PRODUCTION')),
  status text not null check (status in ('NOT_CONNECTED','CONFIGURED','HEALTHY','DEGRADED','UNAVAILABLE','PLANNED')),
  client_url text,
  api_url text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, environment)
);

create table if not exists product_adapter_capabilities (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  capability_code text not null,
  api_version text,
  supported boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (product_id, capability_code)
);

create table if not exists plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  version integer not null,
  status text not null check (status in ('DRAFT','PUBLISHED','RETIRED')),
  effective_from timestamptz,
  effective_to timestamptz,
  definition jsonb not null default '{}'::jsonb,
  created_by uuid references owner_profiles(user_id),
  created_at timestamptz not null default now(),
  unique (plan_id, version)
);

create table if not exists entitlement_overrides (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  feature_id uuid references product_features(id) on delete cascade,
  entitlement_key text not null,
  value jsonb not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  reason text not null,
  approved_by uuid references owner_profiles(user_id),
  created_by uuid references owner_profiles(user_id),
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at)
);

create table if not exists provisioning_jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  idempotency_key text not null,
  operation text not null,
  status text not null check (status in ('PENDING','RUNNING','SUCCEEDED','FAILED','REQUIRES_ACTION','CANCELLED')),
  request_payload jsonb not null default '{}'::jsonb,
  result_payload jsonb,
  failure_code text,
  failure_detail text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  correlation_id uuid not null default gen_random_uuid(),
  created_by uuid references owner_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, idempotency_key)
);

create index if not exists idx_product_modules_product_status on product_modules(product_id, status);
create index if not exists idx_product_features_product_status on product_features(product_id, status);
create index if not exists idx_entitlement_overrides_active on entitlement_overrides(customer_id, product_id, expires_at);
create index if not exists idx_provisioning_jobs_customer_product on provisioning_jobs(customer_id, product_id, created_at desc);
create index if not exists idx_audit_logs_correlation on audit_logs(correlation_id, created_at desc);

alter table product_environments enable row level security;
alter table product_adapter_capabilities enable row level security;
alter table plan_versions enable row level security;
alter table entitlement_overrides enable row level security;
alter table provisioning_jobs enable row level security;

-- Product records describe availability; they do not claim a live integration.
insert into products (product_code, name, description, category, icon_key, version, status, commercial_status, adapter_status)
values
  ('engage_stay', 'Engage Stay', 'Hospitality property management and channel management.', 'Hospitality', 'building-2', 'unreleased', 'ACTIVE', 'PLANNED', 'NOT_CONNECTED'),
  ('engage_fit', 'Engage Fit', 'Fitness, gym, membership and branch management.', 'Fitness', 'dumbbell', 'unreleased', 'ACTIVE', 'PLANNED', 'NOT_CONNECTED'),
  ('engage_realty', 'Engage Realty', 'Real-estate project, property, sales and customer management.', 'Real Estate', 'house', 'unreleased', 'ACTIVE', 'PLANNED', 'NOT_CONNECTED'),
  ('engage_crm', 'Engage CRM', 'General-purpose customer relationship management.', 'CRM', 'contact-round', 'unreleased', 'ACTIVE', 'PLANNED', 'NOT_CONNECTED')
on conflict (product_code) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  icon_key = excluded.icon_key,
  updated_at = now();

with catalog(product_code, module_code, module_name) as (
  values
    ('engage_stay','organizations','Organizations and property groups'), ('engage_stay','properties','Properties'), ('engage_stay','room_inventory','Room inventory'), ('engage_stay','reservations','Reservations'), ('engage_stay','guests','Guest profiles'), ('engage_stay','operations','Check-in, housekeeping and maintenance'), ('engage_stay','payments','Folios and payments'), ('engage_stay','channel_manager','Channel manager and OTA integrations'), ('engage_stay','booking_engine','Booking engine'), ('engage_stay','workforce','Employees and permissions'), ('engage_stay','reporting','Reporting and configuration'),
    ('engage_fit','organizations','Gym organizations and branches'), ('engage_fit','memberships','Memberships and members'), ('engage_fit','leads','Leads and renewals'), ('engage_fit','training','Trainers, classes and scheduling'), ('engage_fit','attendance','Attendance and access control'), ('engage_fit','wellness','Workout plans and nutrition'), ('engage_fit','payments','Payments and POS'), ('engage_fit','operations','Equipment and staff'), ('engage_fit','communications','Messaging and member portal'), ('engage_fit','reporting','Reports'),
    ('engage_realty','organizations','Organizations and projects'), ('engage_realty','inventory','Buildings, properties, units and listings'), ('engage_realty','sales','Leads, visits, opportunities and bookings'), ('engage_realty','commercial','Pricing, agreements and commissions'), ('engage_realty','collections','Installments and collections'), ('engage_realty','customers','Customer portal and after-sales support'), ('engage_realty','documents','Documents'), ('engage_realty','reporting','Reports and integrations'),
    ('engage_crm','organizations','Organizations and workspaces'), ('engage_crm','sales','Leads, contacts, accounts and opportunities'), ('engage_crm','pipelines','Deal pipelines'), ('engage_crm','activities','Tasks, activities and follow-ups'), ('engage_crm','automation','Automation and workflows'), ('engage_crm','marketing','Forms, campaigns and communications'), ('engage_crm','telephony','Telephony and quotations'), ('engage_crm','customization','Custom fields and dashboards'), ('engage_crm','reporting','Reporting, integrations and API management')
)
insert into product_modules (product_id, code, name, status, implementation_state, description)
select p.id, c.module_code, c.module_name, 'PLANNED', 'NOT_IMPLEMENTED', 'Registered product-module catalogue; product implementation has not been verified.'
from catalog c join products p on p.product_code = c.product_code
on conflict (product_id, code) do update set name = excluded.name, description = excluded.description;

insert into product_adapter_capabilities (product_id, capability_code, supported)
select p.id, c.capability_code, false
from products p cross join (values
  ('health_check'), ('tenant_provisioning'), ('tenant_configuration_validation'),
  ('initial_admin_provisioning'), ('entitlement_synchronization'),
  ('subscription_synchronization'), ('usage_retrieval'), ('diagnostics'),
  ('tenant_suspension'), ('tenant_reactivation'), ('module_configuration_synchronization')
) as c(capability_code)
on conflict (product_id, capability_code) do nothing;
