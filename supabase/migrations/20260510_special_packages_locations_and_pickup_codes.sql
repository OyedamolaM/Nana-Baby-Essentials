alter table public.products
  add column if not exists product_kind text not null default 'standard'
    check (product_kind in ('standard', 'special_package'));

create table if not exists public.special_packages (
  id uuid primary key default gen_random_uuid(),
  product_id bigint not null unique references public.products(id) on delete cascade,
  package_type text not null check (package_type in ('gift_bundle', 'swoop_package')),
  title text not null,
  slug text not null unique,
  subtitle text,
  details text not null default '',
  badge_text text,
  override_image text,
  external_video_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.special_packages enable row level security;

drop policy if exists "Special packages are viewable by everyone" on public.special_packages;
create policy "Special packages are viewable by everyone" on public.special_packages
  for select using (true);

drop policy if exists "Admins can insert special packages" on public.special_packages;
create policy "Admins can insert special packages" on public.special_packages
  for insert with check (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can update special packages" on public.special_packages;
create policy "Admins can update special packages" on public.special_packages
  for update using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can delete special packages" on public.special_packages;
create policy "Admins can delete special packages" on public.special_packages
  for delete using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

create index if not exists idx_special_packages_active_sort_order
  on public.special_packages (is_active, package_type, sort_order);

create table if not exists public.store_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  address text not null default '',
  description text,
  contact_phone text,
  contact_email text,
  opening_hours text,
  hero_image text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.store_locations enable row level security;

drop policy if exists "Store locations are viewable by everyone" on public.store_locations;
create policy "Store locations are viewable by everyone" on public.store_locations
  for select using (true);

drop policy if exists "Admins can insert store locations" on public.store_locations;
create policy "Admins can insert store locations" on public.store_locations
  for insert with check (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can update store locations" on public.store_locations;
create policy "Admins can update store locations" on public.store_locations
  for update using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can delete store locations" on public.store_locations;
create policy "Admins can delete store locations" on public.store_locations
  for delete using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

create index if not exists idx_store_locations_active_sort_order
  on public.store_locations (is_active, sort_order);

alter table public.shipping_tiers
  add column if not exists fulfillment_type text not null default 'delivery'
    check (fulfillment_type in ('delivery', 'pickup'));

alter table public.orders
  add column if not exists customer_pickup_code text,
  add column if not exists rider_pickup_code text;

create or replace function public.assign_store_order_pickup_codes()
returns trigger
language plpgsql
as $$
declare
  v_fulfillment_type text := 'delivery';
begin
  select fulfillment_type
  into v_fulfillment_type
  from public.shipping_tiers
  where code = new.shipping_tier;

  if coalesce(v_fulfillment_type, 'delivery') = 'pickup' then
    if coalesce(btrim(new.customer_pickup_code), '') = '' then
      new.customer_pickup_code := 'CUS-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
    end if;

    if coalesce(btrim(new.rider_pickup_code), '') = '' then
      new.rider_pickup_code := 'RID-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
    end if;
  else
    new.customer_pickup_code := null;
    new.rider_pickup_code := null;
  end if;

  return new;
end;
$$;

drop trigger if exists set_store_order_pickup_codes on public.orders;
create trigger set_store_order_pickup_codes
before insert or update of shipping_tier, customer_pickup_code, rider_pickup_code
on public.orders
for each row
execute function public.assign_store_order_pickup_codes();

notify pgrst, 'reload schema';
