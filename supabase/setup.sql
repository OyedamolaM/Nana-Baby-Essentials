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

alter table public.registry_items
  add column if not exists requested_quantity integer not null default 1,
  add column if not exists purchased_quantity integer not null default 0,
  add column if not exists unit_price_snapshot numeric(10, 2),
  add column if not exists note text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'registry_items'
      and column_name = 'purchased'
  ) then
    execute $sql$
      update public.registry_items
      set purchased_quantity = case
        when purchased = true and coalesce(purchased_quantity, 0) = 0 then 1
        else coalesce(purchased_quantity, 0)
      end
    $sql$;
  end if;
end
$$;

update public.registry_items
set requested_quantity = coalesce(requested_quantity, 1);

update public.registry_items registry_item
set unit_price_snapshot = product.price
from public.products product
where product.id = registry_item.product_id
  and registry_item.unit_price_snapshot is null;

create table if not exists public.shopping_carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

alter table public.shopping_carts enable row level security;

drop policy if exists "Users can view own shopping carts" on public.shopping_carts;
create policy "Users can view own shopping carts" on public.shopping_carts
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own shopping carts" on public.shopping_carts;
create policy "Users can insert own shopping carts" on public.shopping_carts
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own shopping carts" on public.shopping_carts;
create policy "Users can update own shopping carts" on public.shopping_carts
  for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own shopping carts" on public.shopping_carts;
create policy "Users can delete own shopping carts" on public.shopping_carts
  for delete using (auth.uid() = user_id);

create table if not exists public.shopping_cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.shopping_carts(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz default now(),
  unique(cart_id, product_id)
);

alter table public.shopping_cart_items enable row level security;

drop policy if exists "Users can view own shopping cart items" on public.shopping_cart_items;
create policy "Users can view own shopping cart items" on public.shopping_cart_items
  for select using (
    exists (
      select 1
      from public.shopping_carts
      where id = cart_id and user_id = auth.uid()
    )
  );

drop policy if exists "Users can insert own shopping cart items" on public.shopping_cart_items;
create policy "Users can insert own shopping cart items" on public.shopping_cart_items
  for insert with check (
    exists (
      select 1
      from public.shopping_carts
      where id = cart_id and user_id = auth.uid()
    )
  );

drop policy if exists "Users can update own shopping cart items" on public.shopping_cart_items;
create policy "Users can update own shopping cart items" on public.shopping_cart_items
  for update using (
    exists (
      select 1
      from public.shopping_carts
      where id = cart_id and user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete own shopping cart items" on public.shopping_cart_items;
create policy "Users can delete own shopping cart items" on public.shopping_cart_items
  for delete using (
    exists (
      select 1
      from public.shopping_carts
      where id = cart_id and user_id = auth.uid()
    )
  );

create table if not exists public.homepage_deals (
  id uuid primary key default gen_random_uuid(),
  product_id bigint not null references public.products(id) on delete cascade,
  title text not null,
  subtitle text,
  badge_text text,
  override_image text,
  sale_price numeric(10, 2) not null,
  compare_at_price numeric(10, 2),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean default true,
  sort_order integer default 0,
  created_at timestamptz default now()
);

alter table public.homepage_deals enable row level security;

drop policy if exists "Homepage deals are viewable by everyone" on public.homepage_deals;
create policy "Homepage deals are viewable by everyone" on public.homepage_deals
  for select using (true);

drop policy if exists "Admins can insert homepage deals" on public.homepage_deals;
create policy "Admins can insert homepage deals" on public.homepage_deals
  for insert with check (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can update homepage deals" on public.homepage_deals;
create policy "Admins can update homepage deals" on public.homepage_deals
  for update using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can delete homepage deals" on public.homepage_deals;
create policy "Admins can delete homepage deals" on public.homepage_deals
  for delete using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  hero_image text,
  is_active boolean default true,
  sort_order integer default 0,
  created_at timestamptz default now()
);

alter table public.collections enable row level security;

drop policy if exists "Collections are viewable by everyone" on public.collections;
create policy "Collections are viewable by everyone" on public.collections
  for select using (true);

drop policy if exists "Admins can insert collections" on public.collections;
create policy "Admins can insert collections" on public.collections
  for insert with check (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can update collections" on public.collections;
create policy "Admins can update collections" on public.collections
  for update using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can delete collections" on public.collections;
create policy "Admins can delete collections" on public.collections
  for delete using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

create table if not exists public.collection_products (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete cascade,
  sort_order integer default 0,
  created_at timestamptz default now(),
  unique(collection_id, product_id)
);

alter table public.collection_products enable row level security;

drop policy if exists "Collection products are viewable by everyone" on public.collection_products;
create policy "Collection products are viewable by everyone" on public.collection_products
  for select using (true);

drop policy if exists "Admins can insert collection products" on public.collection_products;
create policy "Admins can insert collection products" on public.collection_products
  for insert with check (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can update collection products" on public.collection_products;
create policy "Admins can update collection products" on public.collection_products
  for update using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can delete collection products" on public.collection_products;
create policy "Admins can delete collection products" on public.collection_products
  for delete using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  category text not null,
  excerpt text not null,
  cover_image text,
  body_markdown text not null,
  author_name text not null,
  published_at timestamptz,
  is_published boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.blog_posts enable row level security;

drop policy if exists "Published blog posts are viewable by everyone" on public.blog_posts;
create policy "Published blog posts are viewable by everyone" on public.blog_posts
  for select using (
    is_published = true
    or exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can insert blog posts" on public.blog_posts;
create policy "Admins can insert blog posts" on public.blog_posts
  for insert with check (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can update blog posts" on public.blog_posts;
create policy "Admins can update blog posts" on public.blog_posts
  for update using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can delete blog posts" on public.blog_posts;
create policy "Admins can delete blog posts" on public.blog_posts
  for delete using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

create table if not exists public.registry_orders (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null references public.registries(id) on delete cascade,
  buyer_name text not null,
  buyer_email text not null,
  buyer_phone text,
  buyer_message text,
  total_amount numeric(10, 2) not null,
  contribution_type text not null check (contribution_type in ('items', 'cash', 'mixed')),
  status text default 'awaiting_payment',
  paystack_reference text,
  created_at timestamptz default now()
);

alter table public.registry_orders enable row level security;

drop policy if exists "Registry owners and admins can view registry orders" on public.registry_orders;
create policy "Registry owners and admins can view registry orders" on public.registry_orders
  for select using (
    exists (
      select 1
      from public.registries
      where id = registry_id and user_id = auth.uid()
    )
    or exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Anyone can insert registry orders" on public.registry_orders;
create policy "Anyone can insert registry orders" on public.registry_orders
  for insert with check (true);

drop policy if exists "Anyone can update registry orders" on public.registry_orders;
create policy "Anyone can update registry orders" on public.registry_orders
  for update using (true);

create table if not exists public.registry_order_items (
  id uuid primary key default gen_random_uuid(),
  registry_order_id uuid not null references public.registry_orders(id) on delete cascade,
  registry_item_id uuid references public.registry_items(id) on delete cascade,
  product_id bigint references public.products(id) on delete set null,
  quantity integer default 0,
  amount numeric(10, 2) not null,
  created_at timestamptz default now()
);

alter table public.registry_order_items enable row level security;

drop policy if exists "Registry owners and admins can view registry order items" on public.registry_order_items;
create policy "Registry owners and admins can view registry order items" on public.registry_order_items
  for select using (
    exists (
      select 1
      from public.registry_orders registry_order
      join public.registries registry on registry.id = registry_order.registry_id
      where registry_order.id = registry_order_id
        and registry.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Anyone can insert registry order items" on public.registry_order_items;
create policy "Anyone can insert registry order items" on public.registry_order_items
  for insert with check (true);
