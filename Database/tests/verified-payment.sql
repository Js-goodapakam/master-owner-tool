begin;
do $$
declare
  c uuid;
  t uuid;
  p uuid;
  plan uuid;
  s uuid;
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
  if activate_verified_checkout('order_ci_2','pay_ci_2',10000,'INR') <> s or
     (select expires_at from subscriptions where id=s) <> expiry + interval '1 month'
     then raise exception 'Renewal failed'; end if;
end $$;
rollback;
