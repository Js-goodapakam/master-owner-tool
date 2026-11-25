alter table public.subscription_sync_outbox add column retry_limit integer not null default 8;

create or replace function public.claim_stay_subscription_delivery()
returns table(revision text, attempt integer, customer uuid, tenant uuid, plan text, status text, expiry timestamptz)
language plpgsql security invoker set search_path = '' as $$
begin
  update public.subscription_sync_outbox o set state='DEAD',last_error='attempt_limit'
    where o.state='PENDING' and o.attempts>=o.retry_limit and o.next_attempt_at<=now();
  return query
  with candidate as (
    select o.revision from public.subscription_sync_outbox o
      where o.state='PENDING' and o.attempts<o.retry_limit and o.next_attempt_at<=now()
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
create function public.recover_stay_subscription_delivery(p_revision bigint, p_product uuid, p_actor uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  recovered bigint;
begin
  update public.subscription_sync_outbox o
     set state='PENDING', retry_limit=attempts+8, next_attempt_at=now()
   where revision=p_revision and product_id=p_product and state='DEAD'
     and not exists (select 1 from public.subscription_sync_outbox newer
       where newer.customer_id=o.customer_id and newer.product_id=o.product_id and newer.revision>o.revision)
   returning revision into recovered;
  if recovered is null then return false; end if;
  insert into public.audit_logs(operator_id, action, resource_type, resource_id, result, correlation_id)
    values(p_actor,'subscription.delivery_requeued','subscription_sync_outbox',recovered::text,'SUCCESS',gen_random_uuid());
  return true;
end $$;

revoke all on function public.recover_stay_subscription_delivery(bigint,uuid,uuid) from public;
create function public.inspect_subscription_reconciliation(p_product uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object(
    'capturedWithoutSubscription', (select count(*) from public.payment_transactions
      where product_id=p_product and status='CAPTURED' and subscription_id is null),
    'pendingDeliveries', (select count(*) from public.subscription_sync_outbox where product_id=p_product and state='PENDING'),
    'deadDeliveries', (select count(*) from public.subscription_sync_outbox where product_id=p_product and state='DEAD'),
    'blockedDeliveries', (select count(*) from public.subscription_sync_outbox where product_id=p_product and state='BLOCKED')
  );
$$;
revoke all on function public.inspect_subscription_reconciliation(uuid) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname='service_role') then
    grant execute on function public.recover_stay_subscription_delivery(bigint,uuid,uuid) to service_role;
    grant execute on function public.inspect_subscription_reconciliation(uuid) to service_role;
  end if;
end $$;
