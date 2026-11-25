alter table public.tenants add column if not exists account_code text;
create unique index if not exists tenants_account_code_unique on public.tenants(account_code);

create sequence if not exists public.tenant_account_code_counter start with 101;
create table if not exists public.tenant_account_code_reservations (
  signup_id uuid not null references public.signup_requests(id),
  environment text not null check (environment in ('Trial','Live')),
  account_code text not null unique,
  primary key(signup_id,environment)
);
alter table public.tenant_account_code_reservations enable row level security;
revoke all on public.tenant_account_code_reservations from public;

create or replace function public.reserve_tenant_account_code(p_signup_id uuid,p_environment text)
returns text language plpgsql security invoker set search_path='' as $$
declare
  prefix text;
  candidate text;
  serial text;
begin
  if p_environment is null or p_environment not in ('Trial','Live') then
    raise exception 'Invalid account environment';
  end if;
  select case product_code when 'engage_stay' then 'ES' when 'engage_fit' then 'EF'
    when 'engage_realty' then 'ER' when 'engage_crm' then 'EC' end into strict prefix
    from public.signup_requests where id=p_signup_id for update;
  select account_code into candidate from public.tenant_account_code_reservations
    where signup_id=p_signup_id and environment=p_environment;
  if found then return candidate; end if;
  loop
    serial:=nextval('public.tenant_account_code_counter')::text;
    candidate:=prefix||'-'||case when p_environment='Live' then 'LV' else 'TR' end||'-'||
      lpad(serial,greatest(6,length(serial)),'0')||'-'||to_char(now() at time zone 'UTC','YY');
    exit when not exists(select 1 from public.tenants where account_code=candidate);
  end loop;
  insert into public.tenant_account_code_reservations values(p_signup_id,p_environment,candidate);
  return candidate;
end $$;
revoke all on function public.reserve_tenant_account_code(uuid,text) from public;
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant select,insert on public.tenant_account_code_reservations to service_role;
    grant usage on sequence public.tenant_account_code_counter to service_role;
    grant execute on function public.reserve_tenant_account_code(uuid,text) to service_role;
  end if;
end $$;
