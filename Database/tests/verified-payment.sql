begin;
do $$
declare
  c uuid;
  t uuid;
  p uuid;
  plan uuid;
  s uuid;
  renewed uuid;
  claim record;
  dead_revision bigint;
  expiry timestamptz;
begin
  if current_database() <> 'owner_test' or current_user <> 'owner_test' then
    raise exception 'Disposable loopback database required';
  end if;
  select id into strict p from products where product_code = 'engage_stay';
  select id into strict plan from plans where product_id = p and name = 'Basic';
  insert into customers(customer_code,company_name,email)
    values ('CI-CAPTURE','Synthetic Capture','capture@example.test') returning id into c;
  insert into tenants(customer_id,name,slug) values(c,'Synthetic','ci-capture') returning id into t;
  insert into customer_products(customer_id,product_id,tenant_id) values(c,p,t);
  insert into payment_transactions(customer_id,product_id,plan_id,provider,provider_order_id,amount_minor,currency,status,idempotency_key,metadata)
    select c,p,plan,'RAZORPAY','order_ci_'||n,10000,'INR','CREATED','ci-key-'||n,
      '{"priceId":"fixture","billingPeriod":"MONTHLY"}' from generate_series(1,2) n;
  update payment_transactions set status='CAPTURED',provider_payment_id='pay_ci_1' where provider_order_id='order_ci_1';
  s := activate_verified_checkout('order_ci_1','pay_ci_1',10000,'INR');
  select expires_at into strict expiry from subscriptions where id=s and status='ACTIVE';
  if activate_verified_checkout('order_ci_1','pay_ci_1',10000,'INR') <> s or
     (select count(*) from subscriptions where customer_id=c) <> 1 then raise exception 'Replay duplicated activation'; end if;
  begin
    perform activate_verified_checkout('order_ci_2','pay_ci_1',10000,'INR');
    raise exception 'Expected duplicate payment failure';
  exception when unique_violation then null;
  end;
  if (select expires_at from subscriptions where id=s) <> expiry or
     (select status from payment_transactions where provider_order_id='order_ci_2') <> 'CREATED'
     then raise exception 'Failed capture did not roll back'; end if;
  renewed := activate_verified_checkout('order_ci_2','pay_ci_2',10000,'INR');
  if renewed <> s or
     (select expires_at from subscriptions where id=s) <> expiry + interval '1 month'
     then raise exception 'Renewal failed'; end if;
  if (select count(*) from subscription_sync_outbox where subscription_id=s) <> 2 or
     (select count(*) from subscription_sync_outbox where subscription_id=s and tenant_id=t and state='PENDING') <> 2
     then raise exception 'Outbox did not retain exactly the activation and renewal'; end if;
  update subscriptions set status='SUSPENDED' where id=s;
  update subscriptions set status='SUSPENDED' where id=s;
  if (select count(*) from subscription_sync_outbox where subscription_id=s and subscription_status='SUSPENDED') <> 1
     then raise exception 'Suspension was not enqueued exactly once'; end if;
  select * into strict claim from claim_stay_subscription_delivery();
  if claim.customer <> c or claim.tenant <> t or claim.attempt <> 1 then
    raise exception 'Incorrect delivery claim';
  end if;
  if (select count(*) from subscription_sync_outbox where subscription_id=s and attempts=1 and next_attempt_at>now()) <> 1 then
    raise exception 'Delivery lease was not persisted';
  end if;
  update subscription_sync_outbox set state='DEAD', attempts=8, last_error='receiver_409'
    where subscription_id=s and subscription_status='SUSPENDED' returning revision into dead_revision;
  if (inspect_subscription_reconciliation(p)->>'deadDeliveries')::integer <> 1 then
    raise exception 'Missing reconciliation diagnostic';
  end if;
  if recover_stay_subscription_delivery(dead_revision,gen_random_uuid(),null) then
    raise exception 'Cross-product recovery succeeded';
  end if;
  if not recover_stay_subscription_delivery(dead_revision,p,null) then raise exception 'Recovery failed'; end if;
  if recover_stay_subscription_delivery(dead_revision,p,null) then raise exception 'Recovery replay succeeded'; end if;
  if not exists (select 1 from subscription_sync_outbox where revision=dead_revision and state='PENDING' and attempts=8 and retry_limit=16)
    or not exists (select 1 from audit_logs where action='subscription.delivery_requeued' and resource_id=dead_revision::text)
    then raise exception 'Recovery or audit was not persisted'; end if;
  update subscription_sync_outbox set state='DELIVERED' where revision=dead_revision;
  if requeue_stale_subscription(dead_revision,c,p,gen_random_uuid(),dead_revision-1,null) then
    raise exception 'Wrong tenant repaired';
  end if;
  if not requeue_stale_subscription(dead_revision,c,p,t,dead_revision-1,null) then
    raise exception 'Stale delivery was not repaired';
  end if;
  if requeue_stale_subscription(dead_revision,c,p,t,dead_revision-1,null) then
    raise exception 'Stale repair duplicated';
  end if;
end $$;
rollback;
