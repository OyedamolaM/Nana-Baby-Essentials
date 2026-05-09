alter table public.registries
  add column if not exists status text not null default 'active'
    check (status in ('active', 'closed'));

update public.registries
set status = 'active'
where status is null;

create index if not exists idx_registries_user_status_created_at
  on public.registries (user_id, status, created_at desc);
