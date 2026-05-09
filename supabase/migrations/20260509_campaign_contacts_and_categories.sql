alter table if exists public.user_profiles
  add column if not exists campaign_opt_out boolean not null default false;

create table if not exists public.campaign_contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text,
  is_active boolean not null default true,
  unsubscribed_at timestamptz,
  last_sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.campaign_contacts enable row level security;

drop policy if exists "Admins can view campaign contacts" on public.campaign_contacts;
create policy "Admins can view campaign contacts" on public.campaign_contacts
  for select using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can insert campaign contacts" on public.campaign_contacts;
create policy "Admins can insert campaign contacts" on public.campaign_contacts
  for insert with check (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can update campaign contacts" on public.campaign_contacts;
create policy "Admins can update campaign contacts" on public.campaign_contacts
  for update using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can delete campaign contacts" on public.campaign_contacts;
create policy "Admins can delete campaign contacts" on public.campaign_contacts
  for delete using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

create index if not exists idx_campaign_contacts_active_created_at
  on public.campaign_contacts (is_active, created_at desc);

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  slug text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.product_categories enable row level security;

drop policy if exists "Product categories are viewable by everyone" on public.product_categories;
create policy "Product categories are viewable by everyone" on public.product_categories
  for select using (true);

drop policy if exists "Admins can insert product categories" on public.product_categories;
create policy "Admins can insert product categories" on public.product_categories
  for insert with check (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can update product categories" on public.product_categories;
create policy "Admins can update product categories" on public.product_categories
  for update using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can delete product categories" on public.product_categories;
create policy "Admins can delete product categories" on public.product_categories
  for delete using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

create index if not exists idx_product_categories_active_sort
  on public.product_categories (is_active, sort_order, created_at desc);

insert into public.product_categories (label, slug, sort_order)
values
  ('Toys', 'toys', 0),
  ('Clothing', 'clothing', 1),
  ('Accessories', 'accessories', 2)
on conflict (slug) do update
set
  label = excluded.label,
  sort_order = excluded.sort_order;

insert into public.product_categories (label, slug, sort_order)
select
  distinct trim(category) as label,
  regexp_replace(lower(trim(category)), '[^a-z0-9]+', '-', 'g') as slug,
  100
from public.products
where coalesce(trim(category), '') <> ''
on conflict (slug) do nothing;
