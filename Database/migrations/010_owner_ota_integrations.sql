-- OTA provider integration registry for the Engage Stay control plane.
-- Stores provider-level onboarding, not property reservations or hotel tokens.
-- Credential ciphertext must be AES-256-GCM encrypted in the backend with
-- OTA_CREDENTIAL_ENCRYPTION_KEY, never client-side or stored in plaintext.
create table if not exists owner_ota_integrations (
  product_id uuid not null references products(id) on delete cascade,
  provider_id text not null,
  approval_status text not null default 'NOT_STARTED'
    check (approval_status in ('NOT_STARTED', 'REQUESTED', 'APPROVED', 'CERTIFIED')),
  environment text not null default 'sandbox'
    check (environment in ('sandbox', 'production')),
  partner_reference text not null default '',
  client_id text not null default '',
  credential_ciphertext text,
  notes text not null default '',
  connection_status text not null default 'NOT_CONNECTED'
    check (connection_status in ('NOT_CONNECTED', 'VERIFIED', 'FAILED')),
  verified_at timestamptz,
  last_error text,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (product_id, provider_id)
);
create index if not exists idx_owner_ota_status on owner_ota_integrations (product_id, connection_status);
alter table owner_ota_integrations enable row level security;
-- No RLS policies: access exclusively via protected Owner backend service role.
