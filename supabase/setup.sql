create extension if not exists pgcrypto;

create table if not exists public.products (
  id bigserial primary key,
  name text not null,
  price numeric(10, 2) not null,
  category text not null,
  image text not null,
  description text not null,
  in_stock boolean default true,
  created_at timestamptz default now()
);

alter table public.products enable row level security;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  is_admin boolean default false,
  shipping_address jsonb,
  billing_address jsonb,
  created_at timestamptz default now()
);

alter table public.user_profiles enable row level security;

drop policy if exists "Users can view own profile" on public.user_profiles;
create policy "Users can view own profile" on public.user_profiles
  for select using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users can update own profile" on public.user_profiles
  for update using (auth.uid() = id);

drop policy if exists "Admins can view all profiles" on public.user_profiles;
create policy "Admins can view all profiles" on public.user_profiles
  for select using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop policy if exists "Products are viewable by everyone" on public.products;
create policy "Products are viewable by everyone" on public.products
  for select using (true);

drop policy if exists "Admins can insert products" on public.products;
create policy "Admins can insert products" on public.products
  for insert with check (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can update products" on public.products;
create policy "Admins can update products" on public.products
  for update using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can delete products" on public.products;
create policy "Admins can delete products" on public.products
  for delete using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  total numeric(10, 2) not null,
  status text default 'pending',
  shipping_address jsonb not null,
  billing_address jsonb not null,
  items jsonb not null,
  payment_reference text,
  shipping_tier text not null,
  created_at timestamptz default now()
);

alter table public.orders enable row level security;

drop policy if exists "Users can view own orders" on public.orders;
create policy "Users can view own orders" on public.orders
  for select using (auth.uid() = user_id);

drop policy if exists "Users can create own orders" on public.orders;
create policy "Users can create own orders" on public.orders
  for insert with check (auth.uid() = user_id);

drop policy if exists "Admins can view all orders" on public.orders;
create policy "Admins can view all orders" on public.orders
  for select using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can update orders" on public.orders;
create policy "Admins can update orders" on public.orders
  for update using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

create table if not exists public.wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  product_id bigint references public.products(id) on delete cascade,
  created_at timestamptz default now(),
  unique(user_id, product_id)
);

alter table public.wishlists enable row level security;

drop policy if exists "Users can view own wishlist" on public.wishlists;
create policy "Users can view own wishlist" on public.wishlists
  for select using (auth.uid() = user_id);

drop policy if exists "Users can add to own wishlist" on public.wishlists;
create policy "Users can add to own wishlist" on public.wishlists
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can delete from own wishlist" on public.wishlists;
create policy "Users can delete from own wishlist" on public.wishlists
  for delete using (auth.uid() = user_id);

create table if not exists public.registries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  whatsapp text,
  due_month text,
  baby_gender text,
  additional_info text,
  share_code text unique not null,
  created_at timestamptz default now()
);

alter table public.registries enable row level security;

drop policy if exists "Users can view own registries" on public.registries;
create policy "Users can view own registries" on public.registries
  for select using (auth.uid() = user_id);

drop policy if exists "Anyone can view registries by share code" on public.registries;
create policy "Anyone can view registries by share code" on public.registries
  for select using (true);

drop policy if exists "Users can create own registries" on public.registries;
create policy "Users can create own registries" on public.registries
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own registries" on public.registries;
create policy "Users can update own registries" on public.registries
  for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own registries" on public.registries;
create policy "Users can delete own registries" on public.registries
  for delete using (auth.uid() = user_id);

create table if not exists public.registry_items (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid references public.registries(id) on delete cascade,
  product_id bigint references public.products(id) on delete cascade,
  purchased boolean default false,
  purchased_by text,
  created_at timestamptz default now(),
  unique(registry_id, product_id)
);

alter table public.registry_items enable row level security;

drop policy if exists "Registry owners can view items" on public.registry_items;
create policy "Registry owners can view items" on public.registry_items
  for select using (
    exists (
      select 1
      from public.registries
      where id = registry_id and user_id = auth.uid()
    )
  );

drop policy if exists "Anyone can view registry items" on public.registry_items;
create policy "Anyone can view registry items" on public.registry_items
  for select using (true);

drop policy if exists "Registry owners can add items" on public.registry_items;
create policy "Registry owners can add items" on public.registry_items
  for insert with check (
    exists (
      select 1
      from public.registries
      where id = registry_id and user_id = auth.uid()
    )
  );

drop policy if exists "Registry owners can update items" on public.registry_items;
create policy "Registry owners can update items" on public.registry_items
  for update using (
    exists (
      select 1
      from public.registries
      where id = registry_id and user_id = auth.uid()
    )
  );

drop policy if exists "Registry owners can delete items" on public.registry_items;
create policy "Registry owners can delete items" on public.registry_items
  for delete using (
    exists (
      select 1
      from public.registries
      where id = registry_id and user_id = auth.uid()
    )
  );

create or replace function public.delete_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users
  where id = auth.uid();
end;
$$;

grant execute on function public.delete_user() to authenticated;

insert into public.products (name, price, category, image, description, in_stock)
select *
from (
  values
    ('Soft Plush Teddy Bear', 24.99, 'Toys', 'https://images.unsplash.com/photo-1684577753340-de97c66fa6fd?w=1080', 'Ultra-soft and cuddly teddy bear, perfect for bedtime snuggles', true),
    ('Organic Cotton Onesie', 18.99, 'Clothing', 'https://images.unsplash.com/photo-1622290291165-d341f1938b8a?w=1080', '100% organic cotton onesie, gentle on baby''s sensitive skin', true),
    ('Colorful Building Blocks', 29.99, 'Toys', 'https://images.unsplash.com/photo-1655087751207-1020c89f7eee?w=1080', 'Safe, colorful blocks for developing motor skills and creativity', true),
    ('Rainbow Baby Dresses', 34.99, 'Clothing', 'https://images.unsplash.com/photo-1560506840-ec148e82a604?w=1080', 'Beautiful collection of colorful dresses for special occasions', true),
    ('Baby Blue Romper', 22.99, 'Clothing', 'https://images.unsplash.com/photo-1622290319146-7b63df48a635?w=1080', 'Comfortable and stylish blue romper for everyday wear', true),
    ('Colorful Baby Socks Set', 12.99, 'Accessories', 'https://images.unsplash.com/photo-1542355581-caf7454785ca?w=1080', 'Pack of 5 adorable colorful socks to keep tiny feet warm', true),
    ('Activity Play Mat', 49.99, 'Toys', 'https://images.unsplash.com/photo-1593793373220-2e51e1c31385?w=1080', 'Interactive play mat with textures and colors for sensory development', true),
    ('Stuffed Animal Collection', 39.99, 'Toys', 'https://images.unsplash.com/photo-1724703171978-bbe9c2ab70c4?w=1080', 'Set of adorable stuffed animals for imaginative play', true),
    ('White Dress & Shoes Set', 44.99, 'Clothing', 'https://images.unsplash.com/photo-1684244160171-97f5dac39204?w=1080', 'Elegant white dress with matching shoes for special events', false),
    ('Colorful Onesie Pack', 32.99, 'Clothing', 'https://images.unsplash.com/photo-1569974641446-22542de88536?w=1080', 'Set of 3 colorful onesies for everyday comfort', true),
    ('Baby Gift Hamper', 89.99, 'Accessories', 'https://images.unsplash.com/photo-1635874714425-c342060a4c58?w=1080', 'Complete gift set with essentials for new parents', true),
    ('Educational Toy Set', 36.99, 'Toys', 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=1080', 'Age-appropriate educational toys for early learning', true)
) as seed(name, price, category, image, description, in_stock)
where not exists (
  select 1 from public.products
);

-- After signing up with your own account, run:
-- update public.user_profiles set is_admin = true where email = 'your-email@example.com';
