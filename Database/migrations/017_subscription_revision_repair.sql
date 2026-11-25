create function public.requeue_stale_subscription(p_revision bigint,p_customer uuid,p_product uuid,p_tenant uuid,p_remote bigint,p_actor uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare repaired bigint;
begin
  if p_remote is null or p_remote >= p_revision then return false; end if;
  update public.subscription_sync_outbox o
    set state='PENDING',next_attempt_at=now(),retry_limit=attempts+8,delivered_at=null
    where revision=p_revision and customer_id=p_customer and product_id=p_product and tenant_id=p_tenant
      and state='DELIVERED'
      and not exists (select 1 from public.subscription_sync_outbox newer
        where newer.customer_id=o.customer_id and newer.product_id=o.product_id and newer.revision>o.revision)
      and exists(select 1 from public.customer_products a where a.customer_id=p_customer and a.product_id=p_product and a.tenant_id=p_tenant)
    returning revision into repaired;
  if repaired is null then return false; end if;
  insert into public.audit_logs(operator_id,action,resource_type,resource_id,result,correlation_id)
    values(p_actor,'subscription.stale_delivery_requeued','subscription_sync_outbox',repaired::text,'SUCCESS',gen_random_uuid());
  return true;
end $$;
revoke all on function public.requeue_stale_subscription(bigint,uuid,uuid,uuid,bigint,uuid) from public;
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant execute on function public.requeue_stale_subscription(bigint,uuid,uuid,uuid,bigint,uuid) to service_role;
  end if;
end $$;
