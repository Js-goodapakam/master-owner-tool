create function public.activate_verified_checkout(p_order text, p_payment text, p_amount bigint, p_currency text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  payment public.payment_transactions%rowtype;
  assignment public.customer_products%rowtype;
  subscription public.subscriptions%rowtype;
  term_months integer;
  new_expiry timestamptz;
begin
  select * into strict payment from public.payment_transactions
    where provider_order_id = p_order and provider = 'RAZORPAY' for update;
  if payment.amount_minor <> p_amount or payment.currency <> p_currency then
    raise exception 'Checkout amount mismatch';
  end if;
  if payment.subscription_id is not null then
    if payment.provider_payment_id is distinct from p_payment then raise exception 'Payment reference mismatch'; end if;
    return payment.subscription_id;
  end if;
  if payment.status not in ('CREATED','AUTHORIZED','FAILED') then raise exception 'Invalid checkout state'; end if;
  select * into strict assignment from public.customer_products
    where customer_id = payment.customer_id and product_id = payment.product_id for update;
  if assignment.tenant_id is null or assignment.status = 'SUSPENDED' or
     not exists (select 1 from public.tenants where id = assignment.tenant_id and customer_id = payment.customer_id and status <> 'SUSPENDED') or
     not exists (select 1 from public.plans where id = payment.plan_id and product_id = payment.product_id and status = 'ACTIVE')
  then raise exception 'Invalid checkout assignment'; end if;
  term_months := case payment.metadata->>'billingPeriod'
    when 'MONTHLY' then 1 when 'QUARTERLY' then 3 when 'HALF_YEARLY' then 6 when 'ANNUAL' then 12 end;
  if term_months is null or payment.metadata->>'priceId' is null then raise exception 'Missing checkout price'; end if;
  select * into subscription from public.subscriptions where customer_id = payment.customer_id
    and product_id = payment.product_id order by created_at desc limit 1 for update;
  if subscription.id is not null and subscription.status not in ('TRIAL','ACTIVE','EXPIRED') then
    raise exception 'Invalid subscription state';
  end if;
  new_expiry := greatest(now(), case when subscription.status = 'ACTIVE' then subscription.expires_at end)
    + make_interval(months => term_months);
  if subscription.id is null then
    insert into public.subscriptions(customer_id,product_id,plan_id,status,starts_at,expires_at,renewal_mode)
    values(payment.customer_id,payment.product_id,payment.plan_id,'ACTIVE',now(),new_expiry,'MANUAL') returning * into subscription;
  else
    update public.subscriptions set plan_id = payment.plan_id,status = 'ACTIVE',expires_at = new_expiry
      where id = subscription.id;
  end if;
  update public.payment_transactions set subscription_id = subscription.id, status = 'CAPTURED',
    provider_payment_id = p_payment, event_at = now(), updated_at = now() where id = payment.id;
  insert into public.audit_logs(action,resource_type,resource_id,result,correlation_id)
    values ('payment.subscription_activated','subscription',subscription.id,'SUCCESS',gen_random_uuid());
  return subscription.id;
end;
$$;
revoke all on function public.activate_verified_checkout(text,text,bigint,text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.activate_verified_checkout(text,text,bigint,text) to service_role;
  end if;
end $$;
