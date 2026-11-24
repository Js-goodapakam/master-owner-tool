-- Additive, server-owned financial event ledger. Gateway secrets never enter this table.
create table if not exists payment_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  product_id uuid not null references products(id),
  plan_id uuid not null references plans(id),
  subscription_id uuid references subscriptions(id),
  provider text not null check (provider in ('RAZORPAY')),
  provider_order_id text not null unique,
  provider_payment_id text unique,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null check (status in ('CREATED','AUTHORIZED','CAPTURED','FAILED','REFUNDED')),
  idempotency_key text not null unique,
  event_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_payment_transactions_customer_product on payment_transactions(customer_id, product_id, created_at desc);
alter table payment_transactions enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on payment_transactions from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on payment_transactions from authenticated; end if;
end $$;
