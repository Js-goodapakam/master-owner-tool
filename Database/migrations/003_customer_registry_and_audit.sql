-- Additive persistence for the central customer registry and platform audit.

alter table organizations
  add column if not exists normalized_name text;

update organizations
set normalized_name = lower(regexp_replace(trim(name), '\\s+', ' ', 'g'))
where normalized_name is null;

alter table organizations
  alter column normalized_name set not null;

create unique index if not exists organizations_normalized_name_key
  on organizations(normalized_name);

alter table customers
  add column if not exists display_name text,
  add column if not exists activated_at timestamptz,
  add column if not exists updated_by uuid references owner_profiles(user_id);

alter table audit_logs
  add column if not exists operator_id uuid references owner_profiles(user_id);

create index if not exists idx_customers_organization on customers(organization_id);
create index if not exists idx_audit_logs_operator on audit_logs(operator_id, created_at desc);
