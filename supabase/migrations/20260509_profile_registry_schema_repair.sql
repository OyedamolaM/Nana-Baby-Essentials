alter table public.user_profiles
  add column if not exists account_status text not null default 'active'
    check (account_status in ('active', 'disabled')),
  add column if not exists deleted_at timestamptz;

update public.user_profiles
set account_status = 'active'
where account_status is null;

create index if not exists idx_user_profiles_account_status
  on public.user_profiles (account_status, deleted_at, created_at desc);

alter table public.registries
  add column if not exists partner_name text,
  add column if not exists partner_email text,
  add column if not exists closed_note text,
  add column if not exists closed_at timestamptz,
  add column if not exists status text not null default 'active'
    check (status in ('active', 'closed'));

update public.registries
set status = 'active'
where status is null;

create index if not exists idx_registries_user_status_created_at
  on public.registries (user_id, status, created_at desc);
