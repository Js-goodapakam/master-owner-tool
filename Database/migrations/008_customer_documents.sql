create table if not exists customer_documents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  category text not null check (category in ('KYC','GST','PAN','INCORPORATION','ADDRESS','CONTRACT','OTHER')),
  original_name text not null,
  storage_path text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  version integer not null default 1,
  replaces_id uuid references customer_documents(id),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REPLACED','DELETED')),
  uploaded_by uuid references owner_profiles(user_id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_customer_documents_customer on customer_documents(customer_id, created_at desc);
alter table customer_documents enable row level security;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('private-customer-documents', 'private-customer-documents', false, 10485760,
  array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 10485760;
