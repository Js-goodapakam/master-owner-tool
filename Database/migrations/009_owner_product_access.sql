-- Product scopes for internal employees. Owner and Super Admin retain implicit
-- all-product access; every other role requires an explicit active assignment.
create table if not exists owner_product_access (
  owner_user_id uuid not null references owner_profiles(user_id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  is_active boolean not null default true,
  granted_by uuid references owner_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_user_id, product_id)
);
create index if not exists idx_owner_product_access_active on owner_product_access(owner_user_id, product_id) where is_active;
alter table owner_product_access enable row level security;
