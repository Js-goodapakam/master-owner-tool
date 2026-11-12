-- Durable intake records for verified customer registrations originating in a
-- connected product. OAuth access tokens and passwords are intentionally not
-- stored in the Owner control plane.
create table if not exists signup_requests (
  id uuid primary key default gen_random_uuid(),
  product_code text not null check (product_code in ('engage_stay', 'engage_fit', 'engage_realty', 'engage_crm')),
  source text not null check (source in ('email', 'google', 'microsoft')),
  external_user_id text not null,
  email text not null,
  display_name text,
  organization_name text,
  phone text,
  requested_lifecycle text not null default 'TRIAL' check (requested_lifecycle in ('TRIAL', 'LIVE')),
  status text not null default 'NEW' check (status in ('NEW', 'IN_REVIEW', 'CONVERTED', 'DISMISSED')),
  idempotency_key text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_code, idempotency_key)
);

create index if not exists idx_signup_requests_queue
  on signup_requests (status, product_code, occurred_at desc);

create unique index if not exists signup_requests_active_identity
  on signup_requests (product_code, source, external_user_id)
  where status in ('NEW', 'IN_REVIEW');

alter table signup_requests enable row level security;
