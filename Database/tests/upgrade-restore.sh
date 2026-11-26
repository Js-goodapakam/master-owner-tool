#!/usr/bin/env bash
set -euo pipefail

# This rehearsal is limited to the existing disposable PostgreSQL 16 CI service.
[[ "${GITHUB_ACTIONS:-}" == true ]]
[[ "${DATABASE_URL:-}" == postgresql://owner_test:owner_test@127.0.0.1:5432/owner_test || "${DATABASE_URL:-}" == postgresql://owner_test:owner_test@localhost:5432/owner_test ]]
psql "$DATABASE_URL" -XAt -v ON_ERROR_STOP=1 -c 'select current_database(),current_user' | grep -qx 'owner_test|owner_test'
backup_dir="$(mktemp -d)"
trap 'rm -f -- "$backup_dir/owner.dump" "$backup_dir/duplicate.log"; rmdir -- "$backup_dir"' EXIT
source_db="${DATABASE_URL%/*}/engage_upgrade_source"
restore_db="${DATABASE_URL%/*}/engage_upgrade_restore"
query() { psql "$1" -X -qAt -v ON_ERROR_STOP=1 "${@:2}"; }
query "$DATABASE_URL" -c 'create database engage_upgrade_source'
query "$DATABASE_URL" -c 'create database engage_upgrade_restore'
query "$source_db" -c 'create schema auth; create table auth.users(id uuid primary key);
  create schema storage; create table storage.buckets(id text primary key,name text not null,public boolean,file_size_limit bigint,allowed_mime_types text[])'
# The baseline is a repository reconstruction, not a production snapshot.
for migration in Database/migrations/0{01..18}_*.sql; do
  query "$source_db" --single-transaction -f "$migration"
done
query "$source_db" <<'SQL'
-- Model a pre-existing account_code column for the historical-data rehearsal.
alter table tenants add column account_code text;
insert into organizations(id,name,normalized_name) values ('10000000-0000-4000-8000-000000000001','Upgrade CI','upgrade ci');
insert into customers(id,organization_id,customer_code,company_name,email) values
 ('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','UPGRADE-CI','Upgrade CI','upgrade@example.test');
insert into tenants(id,customer_id,name,slug,account_code) values
 ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','Upgrade CI','upgrade-ci','ES-TR-000101-26');
insert into signup_requests(id,product_code,source,external_user_id,email,idempotency_key) values
 ('10000000-0000-4000-8000-000000000004','engage_stay','email','synthetic','upgrade@example.test','upgrade-fixture');
insert into onboarding_sessions(signup_request_id,customer_id,current_step,payload)
 values ('10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002',6,'{"marker":"restore"}');
insert into customer_products(customer_id,product_id,tenant_id)
 select '10000000-0000-4000-8000-000000000002',id,'10000000-0000-4000-8000-000000000003' from products where product_code='engage_stay';
insert into subscriptions(id,customer_id,product_id,plan_id,status)
 select '10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002',p.id,l.id,'ACTIVE'
 from products p join plans l on l.product_id=p.id and l.name='Basic' where p.product_code='engage_stay';
insert into payment_transactions(customer_id,product_id,plan_id,subscription_id,provider,provider_order_id,provider_payment_id,amount_minor,currency,status,idempotency_key)
 select customer_id,product_id,plan_id,id,'RAZORPAY','order_restore_fixture','pay_restore_fixture',10000,'INR','CAPTURED','restore-fixture'
 from subscriptions where id='10000000-0000-4000-8000-000000000005';
SQL

snapshot() {
  query "$1" -c "select jsonb_build_array(
    (select count(*) from customers),(select count(*) from tenants),
    (select count(*) from onboarding_sessions),(select count(*) from subscriptions),
    (select count(*) from payment_transactions),
    (select jsonb_agg(jsonb_build_array(t.account_code,o.payload,p.provider_payment_id,p.amount_minor))
     from customers c join tenants t on t.customer_id=c.id join onboarding_sessions o on o.customer_id=c.id
     join customer_products a on a.tenant_id=t.id join subscriptions s on s.customer_id=c.id and s.product_id=a.product_id
     join payment_transactions p on p.subscription_id=s.id)
  )"
}
before="$(snapshot "$source_db")"
[[ "$before" == *ES-TR-000101-26* && "$before" == *pay_restore_fixture* ]]
pg_dump --format=custom --file="$backup_dir/owner.dump" "$source_db"
pg_restore --exit-on-error --single-transaction --dbname="$restore_db" "$backup_dir/owner.dump"
[[ "$(snapshot "$restore_db")" == "$before" ]]
foreign_keys="select count(*) from pg_constraint where contype='f' and connamespace='public'::regnamespace"
baseline_fk="$(query "$source_db" -c "$foreign_keys")"
[[ "$(query "$restore_db" -c "$foreign_keys")" == "$baseline_fk" ]]

query "$source_db" -c "insert into tenants(customer_id,name,slug,account_code)
  values ('10000000-0000-4000-8000-000000000002','Duplicate synthetic','duplicate-fixture','ES-TR-000101-26')"
[[ "$(query "$source_db" -c "select count(*) from (select account_code from tenants where account_code is not null group by account_code having count(*)>1) d")" == 1 ]]
if query "$source_db" --single-transaction -f Database/migrations/019_tenant_account_codes.sql >"$backup_dir/duplicate.log" 2>&1; then
  echo 'Duplicate data unexpectedly accepted'; exit 1
fi
grep -q 'could not create unique index' "$backup_dir/duplicate.log"
[[ "$(query "$source_db" -c "select count(*) from tenants where account_code='ES-TR-000101-26'")" == 2 ]]
[[ "$(query "$source_db" -c "select to_regprocedure('public.reserve_tenant_account_code(uuid,text)') is null")" == t ]]

for attempt in 1 2; do
  query "$restore_db" --single-transaction -f Database/migrations/019_tenant_account_codes.sql
done
[[ "$(snapshot "$restore_db")" == "$before" ]]
[[ "$(query "$restore_db" -c "$foreign_keys")" == "$((baseline_fk+1))" ]]
[[ "$(query "$restore_db" -c "select indisunique from pg_index where indexrelid='public.tenants_account_code_unique'::regclass")" == t ]]
[[ "$(query "$restore_db" -c "select proacl::text not like '%{=X%' from pg_proc where oid='public.reserve_tenant_account_code(uuid,text)'::regprocedure")" == t ]]
code="$(query "$restore_db" -c "select reserve_tenant_account_code('10000000-0000-4000-8000-000000000004','Trial')")"
[[ "$code" == "$(query "$restore_db" -c "select reserve_tenant_account_code('10000000-0000-4000-8000-000000000004','Trial')")" ]]
[[ "$code" != 'ES-TR-000101-26' ]]
echo 'Repository upgrade, duplicate rollback, custom-format backup and restore, and migration replay passed.'
