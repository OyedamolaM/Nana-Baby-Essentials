alter table public.registries
  add column if not exists fulfillment_status text not null default 'collecting',
  add column if not exists ready_for_shipping_at timestamptz,
  add column if not exists shipped_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists fulfillment_updated_at timestamptz,
  add column if not exists fulfillment_updated_by uuid references auth.users(id) on delete set null;

alter table public.registries
  drop constraint if exists registries_fulfillment_status_check;

alter table public.registries
  add constraint registries_fulfillment_status_check
  check (
    fulfillment_status in (
      'collecting',
      'ready_for_shipping',
      'shipped',
      'completed'
    )
  );

update public.registries
set fulfillment_status = 'collecting'
where fulfillment_status is null;

create index if not exists idx_registries_fulfillment_status
  on public.registries (fulfillment_status, fulfillment_updated_at desc);

create or replace function public.ensure_registry_accepts_new_gifts()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.registries
    where id = new.registry_id
      and status = 'active'
  ) then
    raise exception 'This registry is closed and is not accepting new gifts.';
  end if;

  return new;
end;
$$;

drop trigger if exists registry_orders_require_active_registry
  on public.registry_orders;
create trigger registry_orders_require_active_registry
  before insert on public.registry_orders
  for each row execute function public.ensure_registry_accepts_new_gifts();

drop trigger if exists registry_contributions_require_active_registry
  on public.registry_contributions;
create trigger registry_contributions_require_active_registry
  before insert on public.registry_contributions
  for each row execute function public.ensure_registry_accepts_new_gifts();
