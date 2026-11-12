-- Saves every Owner onboarding step without storing credentials or OAuth tokens.
create table if not exists onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  signup_request_id uuid unique references signup_requests(id) on delete set null,
  status text not null default 'IN_PROGRESS' check (status in ('IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  current_step integer not null default 1 check (current_step between 1 and 7),
  payload jsonb not null default '{}'::jsonb,
  customer_id uuid references customers(id) on delete set null,
  created_by uuid references owner_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_onboarding_sessions_status on onboarding_sessions(status, updated_at desc);
alter table onboarding_sessions enable row level security;
