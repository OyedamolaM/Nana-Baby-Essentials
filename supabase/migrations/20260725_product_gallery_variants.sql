-- Step 5: additive gallery and variant schema for products.
-- Safe to apply more than once after the product-images Storage migration.

create extension if not exists pgcrypto;

alter table public.products
  add column if not exists brand text,
  add column if not exists age_range text,
  add column if not exists has_variants boolean not null default false;

update public.products
set has_variants = false
where has_variants is null;

alter table public.products
  alter column has_variants set default false,
  alter column has_variants set not null,
  alter column image drop not null;

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id bigint not null references public.products(id) on delete cascade,
  url text not null,
  thumbnail_url text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.product_images
  add column if not exists thumbnail_url text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists is_primary boolean not null default false,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists product_images_one_primary_per_product
  on public.product_images (product_id)
  where is_primary;

create unique index if not exists product_images_product_sort_order_unique
  on public.product_images (product_id, sort_order);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id bigint not null references public.products(id) on delete cascade,
  size text,
  color text,
  sku text,
  price_override numeric(10, 2),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  in_stock boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists product_variants_product_size_color_unique
  on public.product_variants (product_id, size, color);

alter table public.product_images enable row level security;
alter table public.product_variants enable row level security;

drop policy if exists "Product images are viewable by everyone" on public.product_images;
create policy "Product images are viewable by everyone"
  on public.product_images
  for select
  using (true);

drop policy if exists "Admins can insert product images" on public.product_images;
create policy "Admins can insert product images"
  on public.product_images
  for insert
  with check (public.is_current_user_admin());

drop policy if exists "Admins can update product images" on public.product_images;
create policy "Admins can update product images"
  on public.product_images
  for update
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

drop policy if exists "Admins can delete product images" on public.product_images;
create policy "Admins can delete product images"
  on public.product_images
  for delete
  using (public.is_current_user_admin());

drop policy if exists "Product variants are viewable by everyone" on public.product_variants;
create policy "Product variants are viewable by everyone"
  on public.product_variants
  for select
  using (true);

drop policy if exists "Admins can insert product variants" on public.product_variants;
create policy "Admins can insert product variants"
  on public.product_variants
  for insert
  with check (public.is_current_user_admin());

drop policy if exists "Admins can update product variants" on public.product_variants;
create policy "Admins can update product variants"
  on public.product_variants
  for update
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

drop policy if exists "Admins can delete product variants" on public.product_variants;
create policy "Admins can delete product variants"
  on public.product_variants
  for delete
  using (public.is_current_user_admin());

-- Run this only after the legacy data URLs have been migrated in Step 4.
-- Newly uploaded thumbnails have the deterministic Storage path:
-- /storage/v1/object/public/product-images/thumbnails/products/<scope>/<hash>.webp
insert into public.product_images (
  product_id,
  url,
  thumbnail_url,
  sort_order,
  is_primary
)
select
  product.id,
  case
    when product.image like '%/storage/v1/object/public/product-images/thumbnails/%'
      then replace(
        product.image,
        '/storage/v1/object/public/product-images/thumbnails/',
        '/storage/v1/object/public/product-images/'
      )
    else product.image
  end,
  product.image,
  0,
  true
from public.products as product
where nullif(btrim(product.image), '') is not null
on conflict (product_id, sort_order) do nothing;
