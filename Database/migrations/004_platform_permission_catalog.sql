-- Expand the internal Owner Console permission catalogue without changing
-- customer-application roles. The API remains the authorization boundary.

insert into owner_role_permissions (role_key, permission_key) values
  ('owner','users.view'), ('owner','users.create'), ('owner','users.delete'),
  ('owner','module.view'), ('owner','module.manage'),
  ('owner','entitlement.view'), ('owner','entitlement.manage'),
  ('owner','provisioning.view'), ('owner','provisioning.manage'),
  ('owner','billing.view'), ('owner','billing.manage'),
  ('owner','support.view'), ('owner','support.manage'),
  ('owner','report.view'), ('owner','report.export'),
  ('super_admin','users.view'), ('super_admin','users.create'), ('super_admin','users.delete'),
  ('super_admin','module.view'), ('super_admin','module.manage'),
  ('super_admin','entitlement.view'), ('super_admin','entitlement.manage'),
  ('super_admin','provisioning.view'), ('super_admin','provisioning.manage'),
  ('super_admin','billing.view'), ('super_admin','billing.manage'),
  ('super_admin','support.view'), ('super_admin','support.manage'),
  ('super_admin','report.view'), ('super_admin','report.export'),
  ('admin','users.view'), ('admin','users.create'),
  ('admin','module.view'), ('admin','module.manage'),
  ('admin','entitlement.view'), ('admin','entitlement.manage'),
  ('admin','provisioning.view'), ('admin','provisioning.manage'),
  ('admin','support.view'), ('admin','support.manage'), ('admin','report.view'),
  ('operations','provisioning.view'), ('operations','provisioning.manage'),
  ('operations','support.view'), ('operations','support.manage'), ('operations','report.view'),
  ('support','support.view'), ('support','support.manage'), ('support','provisioning.view'),
  ('finance','billing.view'), ('finance','billing.manage'), ('finance','report.view'), ('finance','report.export'),
  ('infrastructure_admin','provisioning.view'),
  ('viewer','users.view'), ('viewer','module.view'), ('viewer','entitlement.view'),
  ('viewer','provisioning.view'), ('viewer','billing.view'), ('viewer','support.view'), ('viewer','report.view')
on conflict do nothing;
