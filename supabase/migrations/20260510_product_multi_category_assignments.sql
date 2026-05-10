create table if not exists public.product_category_assignments (
  product_id bigint not null references public.products(id) on delete cascade,
  category_id uuid not null references public.product_categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, category_id)
);

alter table public.product_category_assignments enable row level security;

drop policy if exists "Product category assignments are viewable by everyone" on public.product_category_assignments;
create policy "Product category assignments are viewable by everyone" on public.product_category_assignments
  for select using (true);

drop policy if exists "Admins can insert product category assignments" on public.product_category_assignments;
create policy "Admins can insert product category assignments" on public.product_category_assignments
  for insert with check (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can update product category assignments" on public.product_category_assignments;
create policy "Admins can update product category assignments" on public.product_category_assignments
  for update using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can delete product category assignments" on public.product_category_assignments;
create policy "Admins can delete product category assignments" on public.product_category_assignments
  for delete using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

create index if not exists idx_product_category_assignments_category_product
  on public.product_category_assignments (category_id, product_id);

insert into public.product_category_assignments (product_id, category_id)
select
  product.id,
  category.id
from public.products product
join public.product_categories category
  on lower(trim(category.label)) = lower(trim(product.category))
where coalesce(trim(product.category), '') <> ''
on conflict (product_id, category_id) do nothing;

notify pgrst, 'reload schema';
