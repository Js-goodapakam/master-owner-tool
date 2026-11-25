create table public.subscription_sync_outbox (
  revision bigint generated always as identity primary key,
  subscription_id uuid not null references public.subscriptions(id),
  customer_id uuid not null references public.customers(id),
  product_id uuid not null references public.products(id),
  tenant_id uuid references public.tenants(id),
  plan_id uuid not null references public.plans(id),
  subscription_status text not null,
  expires_at timestamptz,
  state text not null check (state in ('PENDING', 'BLOCKED')),
  created_at timestamptz not null default now()
);

alter table public.subscription_sync_outbox enable row level security;
revoke all on public.subscription_sync_outbox from public;

create function public.enqueue_stay_subscription_sync()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  tenant uuid;
  assignment_count integer;
begin
  if tg_op = 'UPDATE' then
    if (old.plan_id, old.status, old.expires_at) is not distinct from
       (new.plan_id, new.status, new.expires_at) then return new; end if;
  end if;
  if not exists (select 1 from public.products where id=new.product_id and product_code='engage_stay')
    then return new; end if;
  select count(*), (array_agg(t.id))[1] into assignment_count, tenant
    from public.customer_products a
    join public.tenants t on t.id=a.tenant_id and t.customer_id=a.customer_id
    where a.customer_id=new.customer_id and a.product_id=new.product_id;
  insert into public.subscription_sync_outbox
    (subscription_id,customer_id,product_id,tenant_id,plan_id,subscription_status,expires_at,state)
    values (new.id,new.customer_id,new.product_id,case when assignment_count=1 then tenant end,
      new.plan_id,new.status,new.expires_at,case when assignment_count=1 then 'PENDING' else 'BLOCKED' end);
  return new;
end;
$$;

create trigger enqueue_stay_subscription_sync
after insert or update of plan_id,status,expires_at on public.subscriptions
for each row execute function public.enqueue_stay_subscription_sync();

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert on public.subscription_sync_outbox to service_role;
    grant usage on sequence public.subscription_sync_outbox_revision_seq to service_role;
  end if;
end $$;
