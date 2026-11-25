
-- Prices are deliberately separate from plan entitlements. A checkout cannot
-- proceed until a published commercial amount has been configured server-side.
alter table payment_transactions alter column provider_order_id drop not null;

create table if not exists plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id),
  billing_period text not null check (billing_period in ('MONTHLY','QUARTERLY','HALF_YEARLY','ANNUAL')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  tax_inclusive boolean not null default false,
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','RETIRED')),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  unique(plan_id, billing_period, effective_from)
);
create index if not exists idx_plan_prices_checkout on plan_prices(plan_id, billing_period, status, effective_from desc);
alter table plan_prices enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on plan_prices from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on plan_prices from authenticated; end if;
end $$;
