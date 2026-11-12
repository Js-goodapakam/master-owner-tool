-- Initial, versionable commercial catalogue. Existing subscriptions are never
-- silently changed by later plan edits.
insert into plans (product_id, name, status, user_limit, storage_gb, api_limit)
select p.id, seed.name, 'ACTIVE', seed.user_limit, seed.storage_gb, seed.api_limit
from products p
cross join (values
  ('Basic', 5, 10, 1000),
  ('Premium', 30, 100, 10000),
  ('Enterprise', null::integer, 1000, 100000)
) as seed(name, user_limit, storage_gb, api_limit)
where p.product_code = 'engage_stay'
on conflict (product_id, name) do nothing;

insert into plan_versions (plan_id, version, status, effective_from, definition)
select plan.id, 1, 'PUBLISHED', now(), jsonb_build_object(
  'billingCycles', jsonb_build_array('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUAL'),
  'entitlementModel', 'server_enforced'
)
from plans plan
join products p on p.id = plan.product_id
where p.product_code = 'engage_stay'
  and not exists (select 1 from plan_versions v where v.plan_id = plan.id);
