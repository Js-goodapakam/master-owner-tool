alter table public.subscription_sync_outbox drop constraint subscription_sync_outbox_state_check;
alter table public.subscription_sync_outbox
  add constraint subscription_sync_outbox_state_check check (state in ('PENDING','BLOCKED','DELIVERED','DEAD')),
  add column attempts integer not null default 0,
  add column next_attempt_at timestamptz not null default now(),
  add column last_error text,
  add column delivered_at timestamptz;

create function public.claim_stay_subscription_delivery()
returns table(revision text, attempt integer, customer uuid, tenant uuid, plan text, status text, expiry timestamptz)
language plpgsql security invoker set search_path = '' as $$
begin
  update public.subscription_sync_outbox o set state='DEAD',last_error='attempt_limit'
    where o.state='PENDING' and o.attempts>=8 and o.next_attempt_at<=now();
  return query
  with candidate as (
    select o.revision from public.subscription_sync_outbox o
      where o.state='PENDING' and o.attempts<8 and o.next_attempt_at<=now()
      order by o.revision limit 1 for update skip locked
  ), claimed as (
    update public.subscription_sync_outbox o set attempts=o.attempts+1,next_attempt_at=now()+interval '1 minute'
      from candidate c where o.revision=c.revision returning o.*
  )
  select c.revision::text,c.attempts,c.customer_id,c.tenant_id,lower(p.name),c.subscription_status,c.expires_at
    from claimed c join public.plans p on p.id=c.plan_id and p.product_id=c.product_id;
end $$;
revoke all on function public.claim_stay_subscription_delivery() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname='service_role') then
    grant execute on function public.claim_stay_subscription_delivery() to service_role;
    grant update on public.subscription_sync_outbox to service_role;
  end if;
end $$;
