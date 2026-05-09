create extension if not exists pgcrypto;

create table if not exists public.products (
  id bigserial primary key,
  name text not null,
  price numeric(10, 2) not null,
  cost_price numeric(10, 2) not null,
  selling_price numeric(10, 2) not null,
  category text not null,
  image text not null,
  description text not null,
  in_stock boolean default true,
  created_at timestamptz default now()
);

alter table public.products
  add column if not exists cost_price numeric(10, 2),
  add column if not exists selling_price numeric(10, 2);

update public.products
set
  price = coalesce(selling_price, price),
  selling_price = coalesce(selling_price, price),
  cost_price = coalesce(cost_price, selling_price, price);

alter table public.products
  alter column selling_price set not null,
  alter column cost_price set not null;

create or replace function public.sync_product_pricing_columns()
returns trigger
language plpgsql
as $$
begin
  new.selling_price := coalesce(new.selling_price, new.price, new.cost_price, 0);
  new.cost_price := coalesce(new.cost_price, new.selling_price, new.price, 0);
  new.price := new.selling_price;
  return new;
end;
$$;

drop trigger if exists sync_product_pricing_columns on public.products;
create trigger sync_product_pricing_columns
  before insert or update on public.products
  for each row execute function public.sync_product_pricing_columns();

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

create or replace function public.is_current_user_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and is_admin = true
  );
$$;

revoke all on function public.is_current_user_admin() from public;
grant execute on function public.is_current_user_admin() to anon, authenticated, service_role;

drop policy if exists "Users can view own profile" on public.user_profiles;
create policy "Users can view own profile" on public.user_profiles
  for select using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users can update own profile" on public.user_profiles
  for update using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.user_profiles;
create policy "Users can insert own profile" on public.user_profiles
  for insert with check (auth.uid() = id);

drop policy if exists "Admins can view all profiles" on public.user_profiles;
create policy "Admins can view all profiles" on public.user_profiles
  for select using (public.is_current_user_admin());

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

insert into public.user_profiles (id, email, full_name, created_at)
select
  auth_user.id,
  auth_user.email,
  auth_user.raw_user_meta_data->>'full_name',
  auth_user.created_at
from auth.users auth_user
on conflict (id) do update
set
  email = excluded.email,
  full_name = coalesce(public.user_profiles.full_name, excluded.full_name),
  created_at = coalesce(public.user_profiles.created_at, excluded.created_at);

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

drop function if exists public.create_store_order(numeric, jsonb, jsonb, jsonb, text);

create or replace function public.create_store_order(
  p_total numeric,
  p_shipping_address jsonb,
  p_billing_address jsonb,
  p_items jsonb,
  p_shipping_tier text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to create an order.';
  end if;

  if p_total is null or p_total <= 0 then
    raise exception 'Order total must be greater than zero.';
  end if;

  if coalesce(jsonb_typeof(p_shipping_address), 'null') <> 'object' then
    raise exception 'Shipping address is required.';
  end if;

  if coalesce(jsonb_typeof(p_billing_address), 'null') <> 'object' then
    raise exception 'Billing address is required.';
  end if;

  if coalesce(jsonb_typeof(p_items), 'null') <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception 'Order items are required.';
  end if;

  if coalesce(btrim(p_shipping_tier), '') = '' then
    raise exception 'Shipping tier is required.';
  end if;

  insert into public.orders (
    user_id,
    total,
    status,
    shipping_address,
    billing_address,
    items,
    shipping_tier
  )
  values (
    auth.uid(),
    p_total,
    'awaiting_payment',
    p_shipping_address,
    p_billing_address,
    p_items,
    p_shipping_tier
  )
  returning id into v_order_id;

  return v_order_id;
end;
$$;

drop function if exists public.complete_store_order_payment(uuid, text);

create or replace function public.complete_store_order_payment(
  p_order_id uuid,
  p_paystack_reference text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_existing_reference text;
  v_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to complete an order payment.';
  end if;

  if coalesce(btrim(p_paystack_reference), '') = '' then
    raise exception 'Paystack reference is required.';
  end if;

  select status, payment_reference, user_id
  into v_status, v_existing_reference, v_user_id
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_user_id <> auth.uid() then
    raise exception 'You do not have access to this order.';
  end if;

  if v_status = 'paid' then
    if v_existing_reference is not null
      and v_existing_reference <> p_paystack_reference then
      raise exception 'Order is already marked as paid with a different payment reference.';
    end if;

    return p_order_id;
  end if;

  if v_status <> 'awaiting_payment' then
    raise exception 'Order can no longer be completed.';
  end if;

  update public.orders
  set
    status = 'paid',
    payment_reference = p_paystack_reference
  where id = p_order_id;

  return p_order_id;
end;
$$;

drop function if exists public.cancel_store_order(uuid);

create or replace function public.cancel_store_order(
  p_order_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to cancel an order.';
  end if;

  select status, user_id
  into v_status, v_user_id
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return p_order_id;
  end if;

  if v_user_id <> auth.uid() then
    raise exception 'You do not have access to this order.';
  end if;

  if v_status = 'awaiting_payment' then
    update public.orders
    set status = 'cancelled'
    where id = p_order_id;
  end if;

  return p_order_id;
end;
$$;

revoke all on function public.create_store_order(numeric, jsonb, jsonb, jsonb, text) from public;
grant execute on function public.create_store_order(numeric, jsonb, jsonb, jsonb, text) to authenticated, service_role;

revoke all on function public.complete_store_order_payment(uuid, text) from public;
grant execute on function public.complete_store_order_payment(uuid, text) to authenticated, service_role;

revoke all on function public.cancel_store_order(uuid) from public;
grant execute on function public.cancel_store_order(uuid) to authenticated, service_role;

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
  status text not null default 'active'
    check (status in ('active', 'closed')),
  partner_name text,
  partner_email text,
  whatsapp text,
  due_month text,
  baby_gender text,
  additional_info text,
  closed_note text,
  closed_at timestamptz,
  share_code text unique not null,
  created_at timestamptz default now()
);

alter table public.registries
  add column if not exists status text not null default 'active'
    check (status in ('active', 'closed')),
  add column if not exists partner_name text,
  add column if not exists partner_email text,
  add column if not exists whatsapp text,
  add column if not exists due_month text,
  add column if not exists baby_gender text,
  add column if not exists additional_info text,
  add column if not exists closed_note text,
  add column if not exists closed_at timestamptz;

update public.registries
set status = 'active'
where status is null;

create index if not exists idx_registries_user_status_created_at
  on public.registries (user_id, status, created_at desc);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'registries'
      and column_name = 'event_date'
  ) then
    execute $sql$
      update public.registries
      set due_month = coalesce(due_month, to_char(event_date, 'YYYY-MM'))
      where event_date is not null
    $sql$;
  end if;
end
$$;

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

insert into public.products (
  name,
  price,
  cost_price,
  selling_price,
  category,
  image,
  description,
  in_stock
)
select *
from (
  values
    ('Soft Plush Teddy Bear', 24.99, 16.99, 24.99, 'Toys', 'https://images.unsplash.com/photo-1684577753340-de97c66fa6fd?w=1080', 'Ultra-soft and cuddly teddy bear, perfect for bedtime snuggles', true),
    ('Organic Cotton Onesie', 18.99, 12.99, 18.99, 'Clothing', 'https://images.unsplash.com/photo-1622290291165-d341f1938b8a?w=1080', '100% organic cotton onesie, gentle on baby''s sensitive skin', true),
    ('Colorful Building Blocks', 29.99, 20.49, 29.99, 'Toys', 'https://images.unsplash.com/photo-1655087751207-1020c89f7eee?w=1080', 'Safe, colorful blocks for developing motor skills and creativity', true),
    ('Rainbow Baby Dresses', 34.99, 24.49, 34.99, 'Clothing', 'https://images.unsplash.com/photo-1560506840-ec148e82a604?w=1080', 'Beautiful collection of colorful dresses for special occasions', true),
    ('Baby Blue Romper', 22.99, 15.99, 22.99, 'Clothing', 'https://images.unsplash.com/photo-1622290319146-7b63df48a635?w=1080', 'Comfortable and stylish blue romper for everyday wear', true),
    ('Colorful Baby Socks Set', 12.99, 8.99, 12.99, 'Accessories', 'https://images.unsplash.com/photo-1542355581-caf7454785ca?w=1080', 'Pack of 5 adorable colorful socks to keep tiny feet warm', true),
    ('Activity Play Mat', 49.99, 35.49, 49.99, 'Toys', 'https://images.unsplash.com/photo-1593793373220-2e51e1c31385?w=1080', 'Interactive play mat with textures and colors for sensory development', true),
    ('Stuffed Animal Collection', 39.99, 27.99, 39.99, 'Toys', 'https://images.unsplash.com/photo-1724703171978-bbe9c2ab70c4?w=1080', 'Set of adorable stuffed animals for imaginative play', true),
    ('White Dress & Shoes Set', 44.99, 31.49, 44.99, 'Clothing', 'https://images.unsplash.com/photo-1684244160171-97f5dac39204?w=1080', 'Elegant white dress with matching shoes for special events', false),
    ('Colorful Onesie Pack', 32.99, 22.99, 32.99, 'Clothing', 'https://images.unsplash.com/photo-1569974641446-22542de88536?w=1080', 'Set of 3 colorful onesies for everyday comfort', true),
    ('Baby Gift Hamper', 89.99, 63.99, 89.99, 'Accessories', 'https://images.unsplash.com/photo-1635874714425-c342060a4c58?w=1080', 'Complete gift set with essentials for new parents', true),
    ('Educational Toy Set', 36.99, 25.99, 36.99, 'Toys', 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=1080', 'Age-appropriate educational toys for early learning', true)
) as seed(name, price, cost_price, selling_price, category, image, description, in_stock)
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
set unit_price_snapshot = coalesce(product.selling_price, product.price)
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
drop policy if exists "Admins can insert registry orders" on public.registry_orders;
create policy "Admins can insert registry orders" on public.registry_orders
  for insert with check (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Anyone can update registry orders" on public.registry_orders;
drop policy if exists "Admins can update registry orders" on public.registry_orders;
create policy "Admins can update registry orders" on public.registry_orders
  for update using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

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
drop policy if exists "Admins can insert registry order items" on public.registry_order_items;
create policy "Admins can insert registry order items" on public.registry_order_items
  for insert with check (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop function if exists public.create_registry_order(uuid, text, text, text, text, numeric, text);
drop function if exists public.create_registry_order(uuid, text, text, text, text, numeric, text, jsonb);

create or replace function public.create_registry_order(
  p_registry_id uuid,
  p_buyer_name text,
  p_buyer_email text,
  p_buyer_phone text default null,
  p_buyer_message text default null,
  p_total numeric default 0,
  p_contribution_type text default 'cash',
  p_selected_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_payload_item_count integer := 0;
  v_invalid_quantity_count integer := 0;
  v_locked_item_count integer := 0;
  v_item_total numeric(10, 2) := 0;
  v_total numeric(10, 2) := 0;
  v_cash_component numeric(10, 2) := 0;
  v_resolved_contribution_type text := 'cash';
begin
  if not exists (
    select 1
    from public.registries
    where id = p_registry_id
  ) then
    raise exception 'Registry not found.';
  end if;

  if coalesce(btrim(p_buyer_name), '') = '' then
    raise exception 'Buyer name is required.';
  end if;

  if coalesce(btrim(p_buyer_email), '') = '' then
    raise exception 'Buyer email is required.';
  end if;

  if coalesce(jsonb_typeof(p_selected_items), 'array') <> 'array' then
    raise exception 'Selected items payload must be an array.';
  end if;

  with payload as (
    select
      registry_item_id,
      sum(quantity)::integer as quantity
    from jsonb_to_recordset(coalesce(p_selected_items, '[]'::jsonb))
      as selected_item(registry_item_id uuid, quantity integer)
    group by registry_item_id
  )
  select
    count(*),
    count(*) filter (
      where registry_item_id is null
        or quantity is null
        or quantity <= 0
    )
  into v_payload_item_count, v_invalid_quantity_count
  from payload;

  if v_invalid_quantity_count > 0 then
    raise exception 'Selected item quantities must be greater than zero.';
  end if;

  with payload as (
    select
      registry_item_id,
      sum(quantity)::integer as quantity
    from jsonb_to_recordset(coalesce(p_selected_items, '[]'::jsonb))
      as selected_item(registry_item_id uuid, quantity integer)
    group by registry_item_id
  ),
  locked_items as (
    select
      registry_item.id,
      registry_item.product_id,
      registry_item.requested_quantity,
      registry_item.purchased_quantity,
      coalesce(registry_item.unit_price_snapshot, 0)::numeric(10, 2) as unit_price_snapshot,
      payload.quantity
    from payload
    join public.registry_items registry_item
      on registry_item.id = payload.registry_item_id
     and registry_item.registry_id = p_registry_id
    order by registry_item.id
    for update of registry_item
  )
  select
    count(*),
    coalesce(sum(unit_price_snapshot * quantity), 0)::numeric(10, 2)
  into v_locked_item_count, v_item_total
  from locked_items;

  if v_locked_item_count <> v_payload_item_count then
    raise exception 'One or more selected registry items could not be found.';
  end if;

  if exists (
    with payload as (
      select
        registry_item_id,
        sum(quantity)::integer as quantity
      from jsonb_to_recordset(coalesce(p_selected_items, '[]'::jsonb))
        as selected_item(registry_item_id uuid, quantity integer)
      group by registry_item_id
    ),
    locked_items as (
      select
        registry_item.requested_quantity,
        registry_item.purchased_quantity,
        payload.quantity
      from payload
      join public.registry_items registry_item
        on registry_item.id = payload.registry_item_id
       and registry_item.registry_id = p_registry_id
      order by registry_item.id
      for update of registry_item
    )
    select 1
    from locked_items
    where quantity > greatest(requested_quantity - purchased_quantity, 0)
  ) then
    raise exception 'Some registry items are no longer available in the requested quantity.';
  end if;

  v_total := round(coalesce(p_total, 0)::numeric, 2);

  if v_total <= 0 then
    raise exception 'Order total must be greater than zero.';
  end if;

  if v_total < v_item_total then
    raise exception 'Order total cannot be less than the selected registry items total.';
  end if;

  v_cash_component := (v_total - v_item_total)::numeric(10, 2);

  if v_payload_item_count > 0 and v_cash_component > 0 then
    v_resolved_contribution_type := 'mixed';
  elsif v_payload_item_count > 0 then
    v_resolved_contribution_type := 'items';
  else
    v_resolved_contribution_type := 'cash';
  end if;

  insert into public.registry_orders (
    registry_id,
    buyer_name,
    buyer_email,
    buyer_phone,
    buyer_message,
    total_amount,
    contribution_type,
    status
  )
  values (
    p_registry_id,
    btrim(p_buyer_name),
    btrim(p_buyer_email),
    nullif(btrim(coalesce(p_buyer_phone, '')), ''),
    nullif(btrim(coalesce(p_buyer_message, '')), ''),
    v_total,
    v_resolved_contribution_type,
    'awaiting_payment'
  )
  returning id into v_order_id;

  if v_payload_item_count > 0 then
    insert into public.registry_order_items (
      registry_order_id,
      registry_item_id,
      product_id,
      quantity,
      amount
    )
    with payload as (
      select
        registry_item_id,
        sum(quantity)::integer as quantity
      from jsonb_to_recordset(coalesce(p_selected_items, '[]'::jsonb))
        as selected_item(registry_item_id uuid, quantity integer)
      group by registry_item_id
    ),
    locked_items as (
      select
        registry_item.id,
        registry_item.product_id,
        coalesce(registry_item.unit_price_snapshot, 0)::numeric(10, 2) as unit_price_snapshot,
        payload.quantity
      from payload
      join public.registry_items registry_item
        on registry_item.id = payload.registry_item_id
       and registry_item.registry_id = p_registry_id
      order by registry_item.id
      for update of registry_item
    )
    select
      v_order_id,
      locked_items.id,
      locked_items.product_id,
      locked_items.quantity,
      (locked_items.unit_price_snapshot * locked_items.quantity)::numeric(10, 2)
    from locked_items;
  end if;

  return v_order_id;
end;
$$;

drop function if exists public.complete_registry_order_payment(uuid, text);

create or replace function public.complete_registry_order_payment(
  p_order_id uuid,
  p_paystack_reference text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_existing_reference text;
begin
  if coalesce(btrim(p_paystack_reference), '') = '' then
    raise exception 'Paystack reference is required.';
  end if;

  select status, paystack_reference
  into v_status, v_existing_reference
  from public.registry_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Registry order not found.';
  end if;

  if v_status = 'paid' then
    if v_existing_reference is not null
      and v_existing_reference <> p_paystack_reference then
      raise exception 'Registry order is already marked as paid with a different payment reference.';
    end if;

    return p_order_id;
  end if;

  if v_status <> 'awaiting_payment' then
    raise exception 'Registry order can no longer be completed.';
  end if;

  perform 1
  from public.registry_order_items order_item
  join public.registry_items registry_item
    on registry_item.id = order_item.registry_item_id
  where order_item.registry_order_id = p_order_id
  for update of registry_item;

  if exists (
    select 1
    from public.registry_order_items order_item
    join public.registry_items registry_item
      on registry_item.id = order_item.registry_item_id
    where order_item.registry_order_id = p_order_id
      and order_item.quantity > greatest(registry_item.requested_quantity - registry_item.purchased_quantity, 0)
  ) then
    raise exception 'Some registry items are no longer available in the requested quantity.';
  end if;

  update public.registry_items registry_item
  set purchased_quantity = registry_item.purchased_quantity + order_item.quantity
  from public.registry_order_items order_item
  where order_item.registry_order_id = p_order_id
    and order_item.registry_item_id = registry_item.id;

  update public.registry_orders
  set
    status = 'paid',
    paystack_reference = p_paystack_reference
  where id = p_order_id;

  return p_order_id;
end;
$$;

drop function if exists public.cancel_registry_order(uuid);

create or replace function public.cancel_registry_order(
  p_order_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status
  into v_status
  from public.registry_orders
  where id = p_order_id
  for update;

  if not found then
    return p_order_id;
  end if;

  if v_status = 'awaiting_payment' then
    update public.registry_orders
    set status = 'cancelled'
    where id = p_order_id;
  end if;

  return p_order_id;
end;
$$;

drop function if exists public.process_registry_payment(uuid, text, text, text, text, numeric, text, jsonb, text);

create or replace function public.process_registry_payment(
  p_registry_id uuid,
  p_buyer_name text,
  p_buyer_email text,
  p_buyer_phone text default null,
  p_buyer_message text default null,
  p_total numeric default 0,
  p_contribution_type text default 'cash',
  p_selected_items jsonb default '[]'::jsonb,
  p_paystack_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  v_order_id := public.create_registry_order(
    p_registry_id,
    p_buyer_name,
    p_buyer_email,
    p_buyer_phone,
    p_buyer_message,
    p_total,
    p_contribution_type,
    p_selected_items
  );

  perform public.complete_registry_order_payment(
    v_order_id,
    p_paystack_reference
  );

  return v_order_id;
end;
$$;

revoke all on function public.create_registry_order(uuid, text, text, text, text, numeric, text, jsonb) from public;
grant execute on function public.create_registry_order(uuid, text, text, text, text, numeric, text, jsonb) to anon, authenticated, service_role;

revoke all on function public.complete_registry_order_payment(uuid, text) from public;
grant execute on function public.complete_registry_order_payment(uuid, text) to anon, authenticated, service_role;

revoke all on function public.cancel_registry_order(uuid) from public;
grant execute on function public.cancel_registry_order(uuid) to anon, authenticated, service_role;

revoke all on function public.process_registry_payment(uuid, text, text, text, text, numeric, text, jsonb, text) from public;
grant execute on function public.process_registry_payment(uuid, text, text, text, text, numeric, text, jsonb, text) to anon, authenticated, service_role;

create table if not exists public.registry_contributions (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null references public.registries(id) on delete cascade,
  buyer_name text not null,
  buyer_email text not null,
  buyer_phone text,
  buyer_message text,
  amount numeric(10, 2) not null check (amount > 0),
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment', 'paid', 'cancelled', 'failed')),
  paystack_reference text,
  paystack_transaction_id bigint,
  paid_at timestamptz,
  created_at timestamptz default now()
);

alter table public.registry_orders
  add column if not exists paystack_transaction_id bigint,
  add column if not exists paid_at timestamptz;

alter table public.registry_contributions enable row level security;

drop policy if exists "Registry owners and admins can view registry contributions" on public.registry_contributions;
create policy "Registry owners and admins can view registry contributions" on public.registry_contributions
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

drop policy if exists "Admins can insert registry contributions" on public.registry_contributions;
create policy "Admins can insert registry contributions" on public.registry_contributions
  for insert with check (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can update registry contributions" on public.registry_contributions;
create policy "Admins can update registry contributions" on public.registry_contributions
  for update using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

create unique index if not exists idx_registry_orders_paystack_reference_unique
  on public.registry_orders (paystack_reference)
  where paystack_reference is not null;

create unique index if not exists idx_registry_contributions_paystack_reference_unique
  on public.registry_contributions (paystack_reference)
  where paystack_reference is not null;

create index if not exists idx_registry_contributions_registry_id_created_at
  on public.registry_contributions (registry_id, created_at desc);

drop function if exists public.create_registry_checkout(uuid, text, text, text, text, jsonb, numeric, text);

create or replace function public.create_registry_checkout(
  p_registry_id uuid,
  p_buyer_name text,
  p_buyer_email text,
  p_buyer_phone text default null,
  p_buyer_message text default null,
  p_selected_items jsonb default '[]'::jsonb,
  p_cash_amount numeric default 0,
  p_paystack_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_contribution_id uuid;
  v_payload_item_count integer := 0;
  v_invalid_quantity_count integer := 0;
  v_locked_item_count integer := 0;
  v_item_total numeric(10, 2) := 0;
  v_cash_amount numeric(10, 2) := 0;
  v_total_amount numeric(10, 2) := 0;
  v_outstanding_registry_value numeric(10, 2) := 0;
  v_paid_contribution_total numeric(10, 2) := 0;
  v_available_cash_amount numeric(10, 2) := 0;
  v_available_registry_value numeric(10, 2) := 0;
  v_checkout_type text := 'cash';
  v_order_contribution_type text := 'cash';
  v_single_item_id uuid := null;
  v_normalized_reference text := null;
begin
  if not exists (
    select 1
    from public.registries
    where id = p_registry_id
  ) then
    raise exception 'Registry not found.';
  end if;

  if coalesce(btrim(p_buyer_name), '') = '' then
    raise exception 'Buyer name is required.';
  end if;

  if coalesce(btrim(p_buyer_email), '') = '' then
    raise exception 'Buyer email is required.';
  end if;

  if coalesce(jsonb_typeof(p_selected_items), 'array') <> 'array' then
    raise exception 'Selected items payload must be an array.';
  end if;

  v_cash_amount := round(coalesce(p_cash_amount, 0)::numeric, 2);
  v_normalized_reference := nullif(btrim(coalesce(p_paystack_reference, '')), '');

  if v_cash_amount < 0 then
    raise exception 'Contribution amount cannot be negative.';
  end if;

  if v_normalized_reference is null then
    raise exception 'Paystack reference is required.';
  end if;

  with payload as (
    select
      registry_item_id,
      sum(quantity)::integer as quantity
    from jsonb_to_recordset(coalesce(p_selected_items, '[]'::jsonb))
      as selected_item(registry_item_id uuid, quantity integer)
    group by registry_item_id
  )
  select
    count(*),
    count(*) filter (
      where registry_item_id is null
        or quantity is null
        or quantity <= 0
    )
  into v_payload_item_count, v_invalid_quantity_count
  from payload;

  if v_invalid_quantity_count > 0 then
    raise exception 'Selected item quantities must be greater than zero.';
  end if;

  with payload as (
    select
      registry_item_id,
      sum(quantity)::integer as quantity
    from jsonb_to_recordset(coalesce(p_selected_items, '[]'::jsonb))
      as selected_item(registry_item_id uuid, quantity integer)
    group by registry_item_id
  ),
  locked_items as (
    select
      registry_item.id,
      registry_item.product_id,
      registry_item.requested_quantity,
      registry_item.purchased_quantity,
      coalesce(registry_item.unit_price_snapshot, 0)::numeric(10, 2) as unit_price_snapshot,
      payload.quantity
    from payload
    join public.registry_items registry_item
      on registry_item.id = payload.registry_item_id
     and registry_item.registry_id = p_registry_id
    order by registry_item.id
    for update of registry_item
  )
  select
    count(*),
    coalesce(sum(unit_price_snapshot * quantity), 0)::numeric(10, 2),
    min(id)
  into v_locked_item_count, v_item_total, v_single_item_id
  from locked_items;

  if v_locked_item_count <> v_payload_item_count then
    raise exception 'One or more selected registry items could not be found.';
  end if;

  if exists (
    with payload as (
      select
        registry_item_id,
        sum(quantity)::integer as quantity
      from jsonb_to_recordset(coalesce(p_selected_items, '[]'::jsonb))
        as selected_item(registry_item_id uuid, quantity integer)
      group by registry_item_id
    ),
    locked_items as (
      select
        registry_item.requested_quantity,
        registry_item.purchased_quantity,
        payload.quantity
      from payload
      join public.registry_items registry_item
        on registry_item.id = payload.registry_item_id
       and registry_item.registry_id = p_registry_id
      order by registry_item.id
      for update of registry_item
    )
    select 1
    from locked_items
    where greatest(requested_quantity - purchased_quantity, 0) = 0
  ) then
    raise exception 'One or more selected registry items are already fully purchased.';
  end if;

  if exists (
    with payload as (
      select
        registry_item_id,
        sum(quantity)::integer as quantity
      from jsonb_to_recordset(coalesce(p_selected_items, '[]'::jsonb))
        as selected_item(registry_item_id uuid, quantity integer)
      group by registry_item_id
    ),
    locked_items as (
      select
        registry_item.requested_quantity,
        registry_item.purchased_quantity,
        payload.quantity
      from payload
      join public.registry_items registry_item
        on registry_item.id = payload.registry_item_id
       and registry_item.registry_id = p_registry_id
      order by registry_item.id
      for update of registry_item
    )
    select 1
    from locked_items
    where quantity > greatest(requested_quantity - purchased_quantity, 0)
  ) then
    raise exception 'Some registry items are no longer available in the requested quantity.';
  end if;

  if v_payload_item_count = 0 and v_cash_amount <= 0 then
    raise exception 'Select registry items or enter a contribution amount.';
  end if;

  select
    coalesce(
      sum(
        coalesce(unit_price_snapshot, 0)::numeric(10, 2) *
        greatest(requested_quantity - purchased_quantity, 0)
      ),
      0
    )::numeric(10, 2)
  into v_outstanding_registry_value
  from public.registry_items
  where registry_id = p_registry_id;

  select
    coalesce(sum(amount), 0)::numeric(10, 2)
  into v_paid_contribution_total
  from public.registry_contributions
  where registry_id = p_registry_id
    and status = 'paid';

  v_available_registry_value := greatest(
    v_outstanding_registry_value - v_paid_contribution_total,
    0
  )::numeric(10, 2);

  if v_payload_item_count > 0 and v_item_total > v_available_registry_value then
    raise exception 'Selected items exceed the remaining unfunded registry total.';
  end if;

  v_available_cash_amount := greatest(
    v_available_registry_value - v_item_total,
    0
  )::numeric(10, 2);

  if v_cash_amount > v_available_cash_amount then
    raise exception 'Contribution exceeds remaining registry total.';
  end if;

  v_total_amount := (v_item_total + v_cash_amount)::numeric(10, 2);
  v_checkout_type := case when v_payload_item_count > 0 then 'item' else 'cash' end;
  v_order_contribution_type := case
    when v_payload_item_count > 0 and v_cash_amount > 0 then 'mixed'
    when v_payload_item_count > 0 then 'items'
    else 'cash'
  end;

  if v_payload_item_count > 0 then
    insert into public.registry_orders (
      registry_id,
      buyer_name,
      buyer_email,
      buyer_phone,
      buyer_message,
      total_amount,
      contribution_type,
      status,
      paystack_reference
    )
    values (
      p_registry_id,
      btrim(p_buyer_name),
      btrim(p_buyer_email),
      nullif(btrim(coalesce(p_buyer_phone, '')), ''),
      nullif(btrim(coalesce(p_buyer_message, '')), ''),
      v_item_total,
      v_order_contribution_type,
      'awaiting_payment',
      v_normalized_reference
    )
    returning id into v_order_id;

    insert into public.registry_order_items (
      registry_order_id,
      registry_item_id,
      product_id,
      quantity,
      amount
    )
    with payload as (
      select
        registry_item_id,
        sum(quantity)::integer as quantity
      from jsonb_to_recordset(coalesce(p_selected_items, '[]'::jsonb))
        as selected_item(registry_item_id uuid, quantity integer)
      group by registry_item_id
    ),
    locked_items as (
      select
        registry_item.id,
        registry_item.product_id,
        coalesce(registry_item.unit_price_snapshot, 0)::numeric(10, 2) as unit_price_snapshot,
        payload.quantity
      from payload
      join public.registry_items registry_item
        on registry_item.id = payload.registry_item_id
       and registry_item.registry_id = p_registry_id
      order by registry_item.id
      for update of registry_item
    )
    select
      v_order_id,
      locked_items.id,
      locked_items.product_id,
      locked_items.quantity,
      (locked_items.unit_price_snapshot * locked_items.quantity)::numeric(10, 2)
    from locked_items;
  end if;

  if v_cash_amount > 0 then
    insert into public.registry_contributions (
      registry_id,
      buyer_name,
      buyer_email,
      buyer_phone,
      buyer_message,
      amount,
      status,
      paystack_reference
    )
    values (
      p_registry_id,
      btrim(p_buyer_name),
      btrim(p_buyer_email),
      nullif(btrim(coalesce(p_buyer_phone, '')), ''),
      nullif(btrim(coalesce(p_buyer_message, '')), ''),
      v_cash_amount,
      'awaiting_payment',
      v_normalized_reference
    )
    returning id into v_contribution_id;
  end if;

  return jsonb_build_object(
    'amount_kobo', round(v_total_amount * 100)::bigint,
    'cash_amount', v_cash_amount,
    'checkout_type', v_checkout_type,
    'item_total', v_item_total,
    'metadata', jsonb_build_object(
      'item_id', case when v_payload_item_count = 1 then v_single_item_id else null end,
      'registry_id', p_registry_id,
      'type', v_checkout_type
    ),
    'paystack_reference', v_normalized_reference,
    'registry_contribution_id', v_contribution_id,
    'registry_order_id', v_order_id,
    'total_amount', v_total_amount
  );
end;
$$;

drop function if exists public.complete_registry_checkout_payment(text, bigint, bigint);

create or replace function public.complete_registry_checkout_payment(
  p_paystack_reference text,
  p_paid_amount_kobo bigint default null,
  p_paystack_transaction_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.registry_orders%rowtype;
  v_contribution public.registry_contributions%rowtype;
  v_registry_id uuid;
  v_expected_total numeric(10, 2) := 0;
  v_item_total numeric(10, 2) := 0;
  v_outstanding_registry_value numeric(10, 2) := 0;
  v_paid_contribution_total numeric(10, 2) := 0;
  v_available_cash_amount numeric(10, 2) := 0;
  v_available_registry_value numeric(10, 2) := 0;
begin
  if coalesce(btrim(p_paystack_reference), '') = '' then
    raise exception 'Paystack reference is required.';
  end if;

  select *
  into v_order
  from public.registry_orders
  where paystack_reference = btrim(p_paystack_reference)
  for update;

  select *
  into v_contribution
  from public.registry_contributions
  where paystack_reference = btrim(p_paystack_reference)
  for update;

  if v_order.id is null and v_contribution.id is null then
    raise exception 'Registry checkout not found.';
  end if;

  if v_order.id is not null then
    v_registry_id := v_order.registry_id;
    v_item_total := coalesce(v_order.total_amount, 0)::numeric(10, 2);

    if v_order.status = 'paid' and (
      v_contribution.id is null or v_contribution.status = 'paid'
    ) then
      return jsonb_build_object(
        'checkout_type', case when v_order.id is not null then 'item' else 'cash' end,
        'paystack_reference', btrim(p_paystack_reference),
        'registry_contribution_id', v_contribution.id,
        'registry_id', v_registry_id,
        'registry_order_id', v_order.id,
        'status', 'paid'
      );
    end if;

    if v_order.status not in ('awaiting_payment', 'paid') then
      raise exception 'Registry order can no longer be completed.';
    end if;
  end if;

  if v_contribution.id is not null then
    if v_registry_id is null then
      v_registry_id := v_contribution.registry_id;
    elsif v_registry_id <> v_contribution.registry_id then
      raise exception 'Registry checkout records do not match.';
    end if;

    if v_contribution.status = 'paid' and (
      v_order.id is null or v_order.status = 'paid'
    ) then
      return jsonb_build_object(
        'checkout_type', case when v_order.id is not null then 'item' else 'cash' end,
        'paystack_reference', btrim(p_paystack_reference),
        'registry_contribution_id', v_contribution.id,
        'registry_id', v_registry_id,
        'registry_order_id', v_order.id,
        'status', 'paid'
      );
    end if;

    if v_contribution.status not in ('awaiting_payment', 'paid') then
      raise exception 'Registry contribution can no longer be completed.';
    end if;
  end if;

  if (
    v_order.id is not null
    and v_order.status = 'paid'
    and v_contribution.id is not null
    and v_contribution.status <> 'paid'
  ) or (
    v_contribution.id is not null
    and v_contribution.status = 'paid'
    and v_order.id is not null
    and v_order.status <> 'paid'
  ) then
    raise exception 'Registry checkout is in an unexpected partially completed state.';
  end if;

  v_expected_total := (
    coalesce(v_order.total_amount, 0) +
    coalesce(v_contribution.amount, 0)
  )::numeric(10, 2);

  if v_expected_total <= 0 then
    raise exception 'Registry checkout total must be greater than zero.';
  end if;

  if p_paid_amount_kobo is not null
    and round(v_expected_total * 100)::bigint <> p_paid_amount_kobo then
    raise exception 'Verified payment amount does not match this registry checkout.';
  end if;

  if v_order.id is not null then
    perform 1
    from public.registry_order_items order_item
    join public.registry_items registry_item
      on registry_item.id = order_item.registry_item_id
    where order_item.registry_order_id = v_order.id
    for update of registry_item;

    if exists (
      select 1
      from public.registry_order_items order_item
      join public.registry_items registry_item
        on registry_item.id = order_item.registry_item_id
      where order_item.registry_order_id = v_order.id
        and greatest(registry_item.requested_quantity - registry_item.purchased_quantity, 0) = 0
    ) then
      raise exception 'One or more selected registry items are already fully purchased.';
    end if;

    if exists (
      select 1
      from public.registry_order_items order_item
      join public.registry_items registry_item
        on registry_item.id = order_item.registry_item_id
      where order_item.registry_order_id = v_order.id
        and order_item.quantity > greatest(registry_item.requested_quantity - registry_item.purchased_quantity, 0)
    ) then
      raise exception 'Some registry items are no longer available in the requested quantity.';
    end if;
  end if;

  if v_order.id is not null or v_contribution.id is not null then
    perform 1
    from public.registry_items
    where registry_id = v_registry_id
    for update;

    select
      coalesce(
        sum(
          coalesce(unit_price_snapshot, 0)::numeric(10, 2) *
          greatest(requested_quantity - purchased_quantity, 0)
        ),
        0
      )::numeric(10, 2)
    into v_outstanding_registry_value
    from public.registry_items
    where registry_id = v_registry_id;

    select
      coalesce(sum(amount), 0)::numeric(10, 2)
    into v_paid_contribution_total
    from public.registry_contributions
    where registry_id = v_registry_id
      and status = 'paid'
      and paystack_reference <> btrim(p_paystack_reference);

    v_available_registry_value := greatest(
      v_outstanding_registry_value - v_paid_contribution_total,
      0
    )::numeric(10, 2);

    if v_order.id is not null and v_item_total > v_available_registry_value then
      raise exception 'Selected items exceed the remaining unfunded registry total.';
    end if;

    if v_contribution.id is not null then
      v_available_cash_amount := greatest(
        v_available_registry_value - v_item_total,
        0
      )::numeric(10, 2);

      if v_contribution.amount > v_available_cash_amount then
        raise exception 'Contribution exceeds remaining registry total.';
      end if;
    end if;
  end if;

  if v_order.id is not null and v_order.status <> 'paid' then
    update public.registry_items registry_item
    set purchased_quantity = registry_item.purchased_quantity + order_item.quantity
    from public.registry_order_items order_item
    where order_item.registry_order_id = v_order.id
      and order_item.registry_item_id = registry_item.id;

    update public.registry_orders
    set
      status = 'paid',
      paid_at = now(),
      paystack_reference = btrim(p_paystack_reference),
      paystack_transaction_id = coalesce(p_paystack_transaction_id, paystack_transaction_id)
    where id = v_order.id;
  end if;

  if v_contribution.id is not null and v_contribution.status <> 'paid' then
    update public.registry_contributions
    set
      status = 'paid',
      paid_at = now(),
      paystack_reference = btrim(p_paystack_reference),
      paystack_transaction_id = coalesce(p_paystack_transaction_id, paystack_transaction_id)
    where id = v_contribution.id;
  end if;

  return jsonb_build_object(
    'checkout_type', case when v_order.id is not null then 'item' else 'cash' end,
    'paystack_reference', btrim(p_paystack_reference),
    'registry_contribution_id', v_contribution.id,
    'registry_id', v_registry_id,
    'registry_order_id', v_order.id,
    'status', 'paid'
  );
end;
$$;

drop function if exists public.cancel_registry_checkout(text);

create or replace function public.cancel_registry_checkout(
  p_paystack_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_contribution_id uuid;
begin
  if coalesce(btrim(p_paystack_reference), '') = '' then
    raise exception 'Paystack reference is required.';
  end if;

  update public.registry_orders
  set status = 'cancelled'
  where paystack_reference = btrim(p_paystack_reference)
    and status = 'awaiting_payment'
  returning id into v_order_id;

  update public.registry_contributions
  set status = 'cancelled'
  where paystack_reference = btrim(p_paystack_reference)
    and status = 'awaiting_payment'
  returning id into v_contribution_id;

  return jsonb_build_object(
    'paystack_reference', btrim(p_paystack_reference),
    'registry_contribution_id', v_contribution_id,
    'registry_order_id', v_order_id,
    'status', 'cancelled'
  );
end;
$$;

revoke all on function public.create_registry_checkout(uuid, text, text, text, text, jsonb, numeric, text) from public;
grant execute on function public.create_registry_checkout(uuid, text, text, text, text, jsonb, numeric, text) to service_role;

revoke all on function public.complete_registry_checkout_payment(text, bigint, bigint) from public;
grant execute on function public.complete_registry_checkout_payment(text, bigint, bigint) to service_role;

revoke all on function public.cancel_registry_checkout(text) from public;
grant execute on function public.cancel_registry_checkout(text) to service_role;

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

drop policy if exists "Users can create own registries" on public.registries;
create policy "Users can create own registries" on public.registries
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.user_profiles
      where id = auth.uid()
        and deleted_at is null
        and coalesce(account_status, 'active') = 'active'
    )
  );

drop policy if exists "Users can update own registries" on public.registries;
create policy "Users can update own registries" on public.registries
  for update using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.user_profiles
      where id = auth.uid()
        and deleted_at is null
        and coalesce(account_status, 'active') = 'active'
    )
  );

drop policy if exists "Users can delete own registries" on public.registries;
create policy "Users can delete own registries" on public.registries
  for delete using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.user_profiles
      where id = auth.uid()
        and deleted_at is null
        and coalesce(account_status, 'active') = 'active'
    )
  );

drop function if exists public.create_store_order(numeric, jsonb, jsonb, jsonb, text);

create or replace function public.create_store_order(
  p_total numeric,
  p_shipping_address jsonb,
  p_billing_address jsonb,
  p_items jsonb,
  p_shipping_tier text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_profile public.user_profiles%rowtype;
  v_customer_name text;
  v_customer_email text;
  v_customer_phone text;
  v_shipping_name text;
  v_shipping_phone text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to create an order.';
  end if;

  select *
  into v_profile
  from public.user_profiles
  where id = auth.uid();

  if v_profile.id is null
    or v_profile.deleted_at is not null
    or coalesce(v_profile.account_status, 'active') <> 'active' then
    raise exception 'Your account is not available for checkout.';
  end if;

  if p_total is null or p_total <= 0 then
    raise exception 'Order total must be greater than zero.';
  end if;

  if coalesce(jsonb_typeof(p_shipping_address), 'null') <> 'object' then
    raise exception 'Shipping address is required.';
  end if;

  if coalesce(jsonb_typeof(p_billing_address), 'null') <> 'object' then
    raise exception 'Billing address is required.';
  end if;

  if coalesce(jsonb_typeof(p_items), 'null') <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception 'Order items are required.';
  end if;

  if coalesce(btrim(p_shipping_tier), '') = '' then
    raise exception 'Shipping tier is required.';
  end if;

  if not exists (
    select 1
    from public.shipping_tiers
    where code = btrim(p_shipping_tier)
      and is_active = true
  ) then
    raise exception 'Selected shipping tier is not available.';
  end if;

  v_shipping_name := nullif(btrim(coalesce(p_shipping_address->>'name', '')), '');
  v_shipping_phone := nullif(btrim(coalesce(p_shipping_address->>'phone', '')), '');

  v_customer_name := coalesce(
    nullif(btrim(v_profile.full_name), ''),
    v_shipping_name,
    'Customer'
  );
  v_customer_email := coalesce(nullif(btrim(v_profile.email), ''), '');
  v_customer_phone := coalesce(
    nullif(btrim(v_profile.phone), ''),
    v_shipping_phone
  );

  if v_customer_phone is null then
    raise exception 'Phone number is required to complete checkout.';
  end if;

  update public.user_profiles
  set
    full_name = coalesce(nullif(btrim(full_name), ''), v_shipping_name, v_customer_name),
    phone = coalesce(nullif(btrim(phone), ''), v_customer_phone),
    shipping_address = jsonb_build_object(
      'name', coalesce(v_shipping_name, v_customer_name),
      'phone', v_customer_phone,
      'address', coalesce(nullif(btrim(p_shipping_address->>'address'), ''), ''),
      'city', coalesce(nullif(btrim(p_shipping_address->>'city'), ''), ''),
      'state', coalesce(nullif(btrim(p_shipping_address->>'state'), ''), '')
    )
  where id = auth.uid();

  insert into public.orders (
    user_id,
    total,
    status,
    shipping_address,
    billing_address,
    items,
    payment_reference,
    shipping_tier,
    customer_name,
    customer_email,
    customer_phone
  )
  values (
    auth.uid(),
    round(p_total::numeric, 2),
    'pending',
    p_shipping_address,
    p_billing_address,
    p_items,
    null,
    btrim(p_shipping_tier),
    v_customer_name,
    v_customer_email,
    v_customer_phone
  )
  returning id into v_order_id;

  return v_order_id;
end;
$$;

revoke all on function public.create_store_order(numeric, jsonb, jsonb, jsonb, text) from public;
grant execute on function public.create_store_order(numeric, jsonb, jsonb, jsonb, text) to authenticated, service_role;

alter table public.user_profiles
  add column if not exists account_status text not null default 'active'
    check (account_status in ('active', 'disabled')),
  add column if not exists deleted_at timestamptz;

update public.user_profiles
set account_status = 'active'
where account_status is null;

create or replace function public.is_current_user_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and is_admin = true
      and coalesce(account_status, 'active') = 'active'
      and deleted_at is null
  );
$$;

create index if not exists idx_user_profiles_account_status
  on public.user_profiles (account_status, deleted_at, created_at desc);

alter table public.products
  add column if not exists slug text,
  add column if not exists is_featured boolean not null default false,
  add column if not exists featured_sort_order integer not null default 0;

with normalized as (
  select
    id,
    trim(both '-' from regexp_replace(lower(coalesce(name, '')), '[^a-z0-9]+', '-', 'g')) as base_slug
  from public.products
),
resolved as (
  select
    id,
    case
      when coalesce(base_slug, '') = '' then 'product-' || id::text
      when row_number() over (partition by base_slug order by id) = 1 then base_slug
      else base_slug || '-' || id::text
    end as next_slug
  from normalized
)
update public.products product
set slug = resolved.next_slug
from resolved
where product.id = resolved.id
  and (product.slug is null or btrim(product.slug) = '');

update public.products product
set is_featured = true
where exists (
  select 1
  from public.collection_products collection_product
  where collection_product.product_id = product.id
);

create unique index if not exists idx_products_slug_unique
  on public.products (slug);

create index if not exists idx_products_featured_category
  on public.products (is_featured, featured_sort_order, category, created_at desc);

create table if not exists public.shipping_tiers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  fee numeric(10, 2) not null check (fee >= 0),
  eta text,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shipping_tiers enable row level security;

drop policy if exists "Shipping tiers are viewable by everyone" on public.shipping_tiers;
create policy "Shipping tiers are viewable by everyone" on public.shipping_tiers
  for select using (true);

drop policy if exists "Admins can insert shipping tiers" on public.shipping_tiers;
create policy "Admins can insert shipping tiers" on public.shipping_tiers
  for insert with check (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid()
        and is_admin = true
        and coalesce(account_status, 'active') = 'active'
        and deleted_at is null
    )
  );

drop policy if exists "Admins can update shipping tiers" on public.shipping_tiers;
create policy "Admins can update shipping tiers" on public.shipping_tiers
  for update using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid()
        and is_admin = true
        and coalesce(account_status, 'active') = 'active'
        and deleted_at is null
    )
  );

drop policy if exists "Admins can delete shipping tiers" on public.shipping_tiers;
create policy "Admins can delete shipping tiers" on public.shipping_tiers
  for delete using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid()
        and is_admin = true
        and coalesce(account_status, 'active') = 'active'
        and deleted_at is null
    )
  );

insert into public.shipping_tiers (code, label, fee, eta, description, sort_order)
values
  ('lagos', 'Lagos', 2000, '2-3 days', 'Fast delivery within Lagos.', 0),
  ('southwest', 'South West', 3500, '3-5 days', 'Delivery across South West states.', 1),
  ('southeast', 'South East', 4000, '4-6 days', 'Delivery across South East states.', 2),
  ('southsouth', 'South South', 4000, '4-6 days', 'Delivery across South South states.', 3),
  ('northcentral', 'North Central', 4500, '4-6 days', 'Delivery across North Central states.', 4),
  ('northeast', 'North East', 5000, '5-7 days', 'Delivery across North East states.', 5),
  ('northwest', 'North West', 5000, '5-7 days', 'Delivery across North West states.', 6)
on conflict (code) do update
set
  label = excluded.label,
  fee = excluded.fee,
  eta = excluded.eta,
  description = excluded.description,
  sort_order = excluded.sort_order;

alter table public.orders
  add column if not exists customer_name text,
  add column if not exists customer_email text,
  add column if not exists customer_phone text;

update public.orders "order"
set
  customer_name = coalesce("order".customer_name, "order".shipping_address->>'name'),
  customer_email = coalesce("order".customer_email, profile.email),
  customer_phone = coalesce("order".customer_phone, "order".shipping_address->>'phone', profile.phone)
from public.user_profiles profile
where profile.id = "order".user_id;

alter table public.registry_orders
  add column if not exists shipping_address jsonb;

update public.registry_orders registry_order
set shipping_address = profile.shipping_address
from public.registries registry
join public.user_profiles profile
  on profile.id = registry.user_id
where registry.id = registry_order.registry_id
  and registry_order.shipping_address is null;

drop policy if exists "Users can create own registries" on public.registries;
create policy "Users can create own registries" on public.registries
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.user_profiles
      where id = auth.uid()
        and deleted_at is null
        and coalesce(account_status, 'active') = 'active'
        and coalesce(btrim(phone), '') <> ''
    )
  );

drop policy if exists "Users can update own registries" on public.registries;
create policy "Users can update own registries" on public.registries
  for update using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.user_profiles
      where id = auth.uid()
        and deleted_at is null
        and coalesce(account_status, 'active') = 'active'
        and coalesce(btrim(phone), '') <> ''
    )
  );

drop policy if exists "Users can delete own registries" on public.registries;
create policy "Users can delete own registries" on public.registries
  for delete using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.user_profiles
      where id = auth.uid()
        and deleted_at is null
        and coalesce(account_status, 'active') = 'active'
        and coalesce(btrim(phone), '') <> ''
    )
  );

drop function if exists public.create_store_order(numeric, jsonb, jsonb, jsonb, text);

create or replace function public.create_store_order(
  p_total numeric,
  p_shipping_address jsonb,
  p_billing_address jsonb,
  p_items jsonb,
  p_shipping_tier text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_profile public.user_profiles%rowtype;
  v_customer_name text;
  v_customer_email text;
  v_customer_phone text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to create an order.';
  end if;

  select *
  into v_profile
  from public.user_profiles
  where id = auth.uid();

  if v_profile.id is null
    or v_profile.deleted_at is not null
    or coalesce(v_profile.account_status, 'active') <> 'active' then
    raise exception 'Your account is not available for checkout.';
  end if;

  if coalesce(btrim(v_profile.phone), '') = '' then
    raise exception 'Add your phone number before checkout.';
  end if;

  if p_total is null or p_total <= 0 then
    raise exception 'Order total must be greater than zero.';
  end if;

  if coalesce(jsonb_typeof(p_shipping_address), 'null') <> 'object' then
    raise exception 'Shipping address is required.';
  end if;

  if coalesce(jsonb_typeof(p_billing_address), 'null') <> 'object' then
    raise exception 'Billing address is required.';
  end if;

  if coalesce(jsonb_typeof(p_items), 'null') <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception 'Order items are required.';
  end if;

  if coalesce(btrim(p_shipping_tier), '') = '' then
    raise exception 'Shipping tier is required.';
  end if;

  if not exists (
    select 1
    from public.shipping_tiers
    where code = btrim(p_shipping_tier)
      and is_active = true
  ) then
    raise exception 'Selected shipping tier is not available.';
  end if;

  v_customer_name := coalesce(
    nullif(btrim(v_profile.full_name), ''),
    nullif(btrim(p_shipping_address->>'name'), ''),
    'Customer'
  );
  v_customer_email := coalesce(nullif(btrim(v_profile.email), ''), '');
  v_customer_phone := coalesce(
    nullif(btrim(v_profile.phone), ''),
    nullif(btrim(p_shipping_address->>'phone'), '')
  );

  update public.user_profiles
  set
    full_name = coalesce(nullif(btrim(full_name), ''), nullif(btrim(p_shipping_address->>'name'), ''), v_customer_name),
    phone = coalesce(nullif(btrim(phone), ''), nullif(btrim(p_shipping_address->>'phone'), ''), v_customer_phone),
    shipping_address = jsonb_build_object(
      'name', coalesce(nullif(btrim(p_shipping_address->>'name'), ''), v_customer_name),
      'phone', coalesce(nullif(btrim(p_shipping_address->>'phone'), ''), v_customer_phone),
      'address', coalesce(nullif(btrim(p_shipping_address->>'address'), ''), ''),
      'city', coalesce(nullif(btrim(p_shipping_address->>'city'), ''), ''),
      'state', coalesce(nullif(btrim(p_shipping_address->>'state'), ''), '')
    )
  where id = auth.uid();

  insert into public.orders (
    user_id,
    total,
    status,
    shipping_address,
    billing_address,
    items,
    payment_reference,
    shipping_tier,
    customer_name,
    customer_email,
    customer_phone
  )
  values (
    auth.uid(),
    round(p_total::numeric, 2),
    'pending',
    p_shipping_address,
    p_billing_address,
    p_items,
    null,
    btrim(p_shipping_tier),
    v_customer_name,
    v_customer_email,
    v_customer_phone
  )
  returning id into v_order_id;

  return v_order_id;
end;
$$;

drop function if exists public.rebuild_registry_item_funding(uuid);

create or replace function public.rebuild_registry_item_funding(
  p_registry_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.registry_items registry_item
  set
    funded_amount = coalesce((
      select least(
        round(
          greatest(registry_item.requested_quantity, 0)::numeric *
          coalesce(registry_item.unit_price_snapshot, 0)::numeric * 1000,
          2
        ),
        coalesce(sum(order_item.amount), 0)::numeric(10, 2)
      )
      from public.registry_order_items order_item
      join public.registry_orders registry_order
        on registry_order.id = order_item.registry_order_id
      where order_item.registry_item_id = registry_item.id
        and registry_order.status = 'paid'
    ), 0),
    purchased_quantity = public.calculate_registry_item_purchased_quantity(
      registry_item.requested_quantity,
      coalesce(registry_item.unit_price_snapshot, 0),
      coalesce((
        select least(
          round(
            greatest(registry_item.requested_quantity, 0)::numeric *
            coalesce(registry_item.unit_price_snapshot, 0)::numeric * 1000,
            2
          ),
          coalesce(sum(order_item.amount), 0)::numeric(10, 2)
        )
        from public.registry_order_items order_item
        join public.registry_orders registry_order
          on registry_order.id = order_item.registry_order_id
        where order_item.registry_item_id = registry_item.id
          and registry_order.status = 'paid'
      ), 0)
    )
  where registry_item.registry_id = p_registry_id;
end;
$$;

grant execute on function public.rebuild_registry_item_funding(uuid)
  to authenticated, service_role;

drop function if exists public.create_registry_checkout(uuid, text, text, text, text, jsonb, numeric, text);

create or replace function public.create_registry_checkout(
  p_registry_id uuid,
  p_buyer_name text,
  p_buyer_email text,
  p_buyer_phone text default null,
  p_buyer_message text default null,
  p_selected_items jsonb default '[]'::jsonb,
  p_cash_amount numeric default 0,
  p_paystack_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_contribution_id uuid;
  v_payload_item_count integer := 0;
  v_invalid_quantity_count integer := 0;
  v_locked_item_count integer := 0;
  v_item_total numeric(10, 2) := 0;
  v_cash_amount numeric(10, 2) := 0;
  v_total_amount numeric(10, 2) := 0;
  v_outstanding_registry_value numeric(10, 2) := 0;
  v_paid_contribution_total numeric(10, 2) := 0;
  v_available_cash_amount numeric(10, 2) := 0;
  v_available_registry_value numeric(10, 2) := 0;
  v_checkout_type text := 'cash';
  v_order_contribution_type text := 'cash';
  v_single_item_id uuid := null;
  v_normalized_reference text := null;
  v_owner_shipping_address jsonb;
begin
  if not exists (
    select 1
    from public.registries
    where id = p_registry_id
  ) then
    raise exception 'Registry not found.';
  end if;

  select profile.shipping_address
  into v_owner_shipping_address
  from public.registries registry
  join public.user_profiles profile
    on profile.id = registry.user_id
  where registry.id = p_registry_id;

  if coalesce(jsonb_typeof(v_owner_shipping_address), 'null') <> 'object' then
    raise exception 'This registry cannot accept gifts until the owner saves a shipping address.';
  end if;

  if coalesce(btrim(p_buyer_name), '') = '' then
    raise exception 'Buyer name is required.';
  end if;

  if coalesce(btrim(p_buyer_email), '') = '' then
    raise exception 'Buyer email is required.';
  end if;

  if coalesce(btrim(p_buyer_phone), '') = '' then
    raise exception 'Buyer phone is required.';
  end if;

  if coalesce(jsonb_typeof(p_selected_items), 'array') <> 'array' then
    raise exception 'Selected items payload must be an array.';
  end if;

  v_cash_amount := round(coalesce(p_cash_amount, 0)::numeric, 2);
  v_normalized_reference := nullif(btrim(coalesce(p_paystack_reference, '')), '');

  if v_cash_amount < 0 then
    raise exception 'Contribution amount cannot be negative.';
  end if;

  if v_normalized_reference is null then
    raise exception 'Paystack reference is required.';
  end if;

  with payload as (
    select
      registry_item_id,
      sum(quantity)::integer as quantity
    from jsonb_to_recordset(coalesce(p_selected_items, '[]'::jsonb))
      as selected_item(registry_item_id uuid, quantity integer)
    group by registry_item_id
  )
  select
    count(*),
    count(*) filter (
      where registry_item_id is null
        or quantity is null
        or quantity <= 0
    )
  into v_payload_item_count, v_invalid_quantity_count
  from payload;

  if v_invalid_quantity_count > 0 then
    raise exception 'Selected item quantities must be greater than zero.';
  end if;

  with payload as (
    select
      registry_item_id,
      sum(quantity)::integer as quantity
    from jsonb_to_recordset(coalesce(p_selected_items, '[]'::jsonb))
      as selected_item(registry_item_id uuid, quantity integer)
    group by registry_item_id
  ),
  locked_items as (
    select
      registry_item.id,
      registry_item.product_id,
      registry_item.requested_quantity,
      registry_item.purchased_quantity,
      coalesce(registry_item.unit_price_snapshot, 0)::numeric(10, 2) as unit_price_snapshot,
      payload.quantity
    from payload
    join public.registry_items registry_item
      on registry_item.id = payload.registry_item_id
     and registry_item.registry_id = p_registry_id
    order by registry_item.id
    for update of registry_item
  )
  select
    count(*),
    coalesce(sum(unit_price_snapshot * quantity), 0)::numeric(10, 2),
    min(id)
  into v_locked_item_count, v_item_total, v_single_item_id
  from locked_items;

  if v_locked_item_count <> v_payload_item_count then
    raise exception 'One or more selected registry items could not be found.';
  end if;

  if exists (
    with payload as (
      select
        registry_item_id,
        sum(quantity)::integer as quantity
      from jsonb_to_recordset(coalesce(p_selected_items, '[]'::jsonb))
        as selected_item(registry_item_id uuid, quantity integer)
      group by registry_item_id
    ),
    locked_items as (
      select
        registry_item.requested_quantity,
        registry_item.purchased_quantity,
        payload.quantity
      from payload
      join public.registry_items registry_item
        on registry_item.id = payload.registry_item_id
       and registry_item.registry_id = p_registry_id
      order by registry_item.id
      for update of registry_item
    )
    select 1
    from locked_items
    where greatest(requested_quantity - purchased_quantity, 0) = 0
  ) then
    raise exception 'One or more selected registry items are already fully purchased.';
  end if;

  if exists (
    with payload as (
      select
        registry_item_id,
        sum(quantity)::integer as quantity
      from jsonb_to_recordset(coalesce(p_selected_items, '[]'::jsonb))
        as selected_item(registry_item_id uuid, quantity integer)
      group by registry_item_id
    ),
    locked_items as (
      select
        registry_item.requested_quantity,
        registry_item.purchased_quantity,
        payload.quantity
      from payload
      join public.registry_items registry_item
        on registry_item.id = payload.registry_item_id
       and registry_item.registry_id = p_registry_id
      order by registry_item.id
      for update of registry_item
    )
    select 1
    from locked_items
    where quantity > greatest(requested_quantity - purchased_quantity, 0)
  ) then
    raise exception 'Some registry items are no longer available in the requested quantity.';
  end if;

  if v_payload_item_count = 0 and v_cash_amount <= 0 then
    raise exception 'Select registry items or enter a contribution amount.';
  end if;

  select
    coalesce(
      sum(
        coalesce(unit_price_snapshot, 0)::numeric(10, 2) *
        greatest(requested_quantity - purchased_quantity, 0)
      ),
      0
    )::numeric(10, 2)
  into v_outstanding_registry_value
  from public.registry_items
  where registry_id = p_registry_id;

  select
    coalesce(sum(amount), 0)::numeric(10, 2)
  into v_paid_contribution_total
  from public.registry_contributions
  where registry_id = p_registry_id
    and status = 'paid';

  v_available_registry_value := greatest(
    v_outstanding_registry_value - v_paid_contribution_total,
    0
  )::numeric(10, 2);

  if v_payload_item_count > 0 and v_item_total > v_available_registry_value then
    raise exception 'Selected items exceed the remaining unfunded registry total.';
  end if;

  v_available_cash_amount := greatest(
    v_available_registry_value - v_item_total,
    0
  )::numeric(10, 2);

  if v_cash_amount > v_available_cash_amount then
    raise exception 'Contribution exceeds remaining registry total.';
  end if;

  v_total_amount := (v_item_total + v_cash_amount)::numeric(10, 2);
  v_checkout_type := case when v_payload_item_count > 0 then 'item' else 'cash' end;
  v_order_contribution_type := case
    when v_payload_item_count > 0 and v_cash_amount > 0 then 'mixed'
    when v_payload_item_count > 0 then 'items'
    else 'cash'
  end;

  if v_payload_item_count > 0 then
    insert into public.registry_orders (
      registry_id,
      buyer_name,
      buyer_email,
      buyer_phone,
      buyer_message,
      total_amount,
      contribution_type,
      status,
      paystack_reference,
      shipping_address
    )
    values (
      p_registry_id,
      btrim(p_buyer_name),
      btrim(p_buyer_email),
      btrim(p_buyer_phone),
      nullif(btrim(coalesce(p_buyer_message, '')), ''),
      v_item_total,
      v_order_contribution_type,
      'awaiting_payment',
      v_normalized_reference,
      v_owner_shipping_address
    )
    returning id into v_order_id;

    insert into public.registry_order_items (
      registry_order_id,
      registry_item_id,
      product_id,
      quantity,
      amount
    )
    with payload as (
      select
        registry_item_id,
        sum(quantity)::integer as quantity
      from jsonb_to_recordset(coalesce(p_selected_items, '[]'::jsonb))
        as selected_item(registry_item_id uuid, quantity integer)
      group by registry_item_id
    ),
    locked_items as (
      select
        registry_item.id,
        registry_item.product_id,
        coalesce(registry_item.unit_price_snapshot, 0)::numeric(10, 2) as unit_price_snapshot,
        payload.quantity
      from payload
      join public.registry_items registry_item
        on registry_item.id = payload.registry_item_id
       and registry_item.registry_id = p_registry_id
      order by registry_item.id
      for update of registry_item
    )
    select
      v_order_id,
      locked_items.id,
      locked_items.product_id,
      locked_items.quantity,
      (locked_items.unit_price_snapshot * locked_items.quantity)::numeric(10, 2)
    from locked_items;
  end if;

  if v_cash_amount > 0 then
    insert into public.registry_contributions (
      registry_id,
      buyer_name,
      buyer_email,
      buyer_phone,
      buyer_message,
      amount,
      status,
      paystack_reference
    )
    values (
      p_registry_id,
      btrim(p_buyer_name),
      btrim(p_buyer_email),
      btrim(p_buyer_phone),
      nullif(btrim(coalesce(p_buyer_message, '')), ''),
      v_cash_amount,
      'awaiting_payment',
      v_normalized_reference
    )
    returning id into v_contribution_id;
  end if;

  return jsonb_build_object(
    'amount_kobo', round(v_total_amount * 100)::bigint,
    'cash_amount', v_cash_amount,
    'checkout_type', v_checkout_type,
    'item_total', v_item_total,
    'metadata', jsonb_build_object(
      'item_id', case when v_payload_item_count = 1 then v_single_item_id else null end,
      'registry_id', p_registry_id,
      'type', v_checkout_type
    ),
    'paystack_reference', v_normalized_reference,
    'registry_contribution_id', v_contribution_id,
    'registry_order_id', v_order_id,
    'total_amount', v_total_amount
  );
end;
$$;

revoke all on function public.create_registry_order(uuid, text, text, text, text, numeric, text, jsonb) from public;
grant execute on function public.create_registry_order(uuid, text, text, text, text, numeric, text, jsonb) to service_role;

revoke all on function public.complete_registry_order_payment(uuid, text) from public;
grant execute on function public.complete_registry_order_payment(uuid, text) to service_role;

revoke all on function public.cancel_registry_order(uuid) from public;
grant execute on function public.cancel_registry_order(uuid) to service_role;

revoke all on function public.process_registry_payment(uuid, text, text, text, text, numeric, text, jsonb, text) from public;
grant execute on function public.process_registry_payment(uuid, text, text, text, text, numeric, text, jsonb, text) to service_role;

create or replace function public.touch_blog_posts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_blog_posts_updated_at on public.blog_posts;
create trigger touch_blog_posts_updated_at
  before update on public.blog_posts
  for each row execute function public.touch_blog_posts_updated_at();

create index if not exists idx_products_created_at on public.products (created_at desc);
create index if not exists idx_user_profiles_is_admin on public.user_profiles (is_admin, created_at desc);
create index if not exists idx_orders_user_id_created_at on public.orders (user_id, created_at desc);
create index if not exists idx_registries_user_id_created_at on public.registries (user_id, created_at desc);
create index if not exists idx_registry_items_registry_id_created_at on public.registry_items (registry_id, created_at desc);
create index if not exists idx_homepage_deals_active_sort_order on public.homepage_deals (is_active, sort_order);
create index if not exists idx_collections_active_sort_order on public.collections (is_active, sort_order);
create index if not exists idx_collection_products_collection_sort_order on public.collection_products (collection_id, sort_order);
create index if not exists idx_blog_posts_publish_order on public.blog_posts (is_published, published_at desc);
create index if not exists idx_registry_orders_registry_id_created_at on public.registry_orders (registry_id, created_at desc);

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  source text,
  is_active boolean not null default true,
  last_sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.newsletter_subscribers enable row level security;

drop policy if exists "Admins can view newsletter subscribers" on public.newsletter_subscribers;
create policy "Admins can view newsletter subscribers" on public.newsletter_subscribers
  for select using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Anyone can subscribe to newsletter" on public.newsletter_subscribers;
create policy "Anyone can subscribe to newsletter" on public.newsletter_subscribers
  for insert with check (true);

drop policy if exists "Admins can update newsletter subscribers" on public.newsletter_subscribers;
create policy "Admins can update newsletter subscribers" on public.newsletter_subscribers
  for update using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

create table if not exists public.newsletter_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body text not null,
  campaign_type text not null default 'newsletter'
    check (campaign_type in ('newsletter', 'customer')),
  status text not null default 'draft' check (status in ('draft', 'sent', 'failed')),
  recipient_count integer not null default 0,
  sent_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.newsletter_campaigns enable row level security;

drop policy if exists "Admins can view newsletter campaigns" on public.newsletter_campaigns;
create policy "Admins can view newsletter campaigns" on public.newsletter_campaigns
  for select using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can insert newsletter campaigns" on public.newsletter_campaigns;
create policy "Admins can insert newsletter campaigns" on public.newsletter_campaigns
  for insert with check (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

create index if not exists idx_newsletter_subscribers_active_created_at
  on public.newsletter_subscribers (created_at desc)
  where is_active = true;
create index if not exists idx_newsletter_campaigns_created_at
  on public.newsletter_campaigns (created_at desc);
create index if not exists idx_newsletter_campaigns_type_created_at
  on public.newsletter_campaigns (campaign_type, created_at desc);

alter table public.registry_items
  add column if not exists funded_amount numeric(10, 2) not null default 0
    check (funded_amount >= 0);

drop function if exists public.calculate_registry_item_remaining_amount(integer, numeric, numeric);

create or replace function public.calculate_registry_item_remaining_amount(
  p_requested_quantity integer,
  p_unit_price numeric,
  p_funded_amount numeric
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_unit_amount numeric(10, 2) := 0;
begin
  if coalesce(p_requested_quantity, 0) <= 0 or coalesce(p_unit_price, 0) <= 0 then
    return 0;
  end if;

  v_unit_amount := round(p_unit_price * 1000, 2);

  return greatest(
    round((p_requested_quantity::numeric * v_unit_amount) - coalesce(p_funded_amount, 0), 2),
    0
  );
end;
$$;

drop function if exists public.calculate_registry_item_selection_amount(integer, integer, numeric, numeric, integer);

create or replace function public.calculate_registry_item_selection_amount(
  p_requested_quantity integer,
  p_purchased_quantity integer,
  p_unit_price numeric,
  p_funded_amount numeric,
  p_selected_quantity integer
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_remaining_amount numeric(10, 2) := 0;
  v_partial_unit_amount numeric(10, 2) := 0;
  v_unit_amount numeric(10, 2) := 0;
begin
  if coalesce(p_selected_quantity, 0) <= 0 or coalesce(p_unit_price, 0) <= 0 then
    return 0;
  end if;

  v_unit_amount := round(p_unit_price * 1000, 2);

  v_remaining_amount := public.calculate_registry_item_remaining_amount(
    p_requested_quantity,
    p_unit_price,
    p_funded_amount
  );

  if v_remaining_amount <= 0 then
    return 0;
  end if;

  if coalesce(p_purchased_quantity, 0) < coalesce(p_requested_quantity, 0) then
    v_partial_unit_amount := mod(greatest(coalesce(p_funded_amount, 0), 0), v_unit_amount);
  end if;

  return least(
    v_remaining_amount,
    greatest((p_selected_quantity::numeric * v_unit_amount) - v_partial_unit_amount, 0)
  );
end;
$$;

drop function if exists public.calculate_registry_item_purchased_quantity(integer, numeric, numeric);

create or replace function public.calculate_registry_item_purchased_quantity(
  p_requested_quantity integer,
  p_unit_price numeric,
  p_funded_amount numeric
)
returns integer
language plpgsql
immutable
as $$
declare
  v_target_amount numeric(10, 2) := 0;
  v_capped_funded_amount numeric(10, 2) := 0;
  v_unit_amount numeric(10, 2) := 0;
begin
  if coalesce(p_requested_quantity, 0) <= 0 or coalesce(p_unit_price, 0) <= 0 then
    return 0;
  end if;

  v_unit_amount := round(p_unit_price * 1000, 2);
  v_target_amount := p_requested_quantity::numeric * v_unit_amount;
  v_capped_funded_amount := least(greatest(coalesce(p_funded_amount, 0), 0), v_target_amount);

  return least(
    p_requested_quantity,
    floor(v_capped_funded_amount / v_unit_amount)::integer
  );
end;
$$;

update public.registry_items
set
  funded_amount = least(
    greatest(
      coalesce(funded_amount, 0),
      greatest(coalesce(purchased_quantity, 0), 0)::numeric *
        round(greatest(coalesce(unit_price_snapshot, 0), 0)::numeric * 1000, 2)
    ),
    greatest(coalesce(requested_quantity, 0), 0)::numeric *
      round(greatest(coalesce(unit_price_snapshot, 0), 0)::numeric * 1000, 2)
  ),
  purchased_quantity = public.calculate_registry_item_purchased_quantity(
    requested_quantity,
    unit_price_snapshot,
    least(
      greatest(
        coalesce(funded_amount, 0),
        greatest(coalesce(purchased_quantity, 0), 0)::numeric *
          round(greatest(coalesce(unit_price_snapshot, 0), 0)::numeric * 1000, 2)
      ),
      greatest(coalesce(requested_quantity, 0), 0)::numeric *
        round(greatest(coalesce(unit_price_snapshot, 0), 0)::numeric * 1000, 2)
    )
  );

drop function if exists public.create_registry_checkout(uuid, text, text, text, text, jsonb, numeric, text);

create or replace function public.create_registry_checkout(
  p_registry_id uuid,
  p_buyer_name text,
  p_buyer_email text,
  p_buyer_phone text default null,
  p_buyer_message text default null,
  p_selected_items jsonb default '[]'::jsonb,
  p_payment_amount numeric default 0,
  p_paystack_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_contribution_id uuid;
  v_payload_item_count integer := 0;
  v_invalid_quantity_count integer := 0;
  v_locked_item_count integer := 0;
  v_payment_amount numeric(10, 2) := 0;
  v_selection_total numeric(10, 2) := 0;
  v_remaining_registry_total numeric(10, 2) := 0;
  v_paid_contribution_total numeric(10, 2) := 0;
  v_available_registry_value numeric(10, 2) := 0;
  v_payment_cap numeric(10, 2) := 0;
  v_checkout_type text := 'cash';
  v_single_item_id uuid := null;
  v_normalized_reference text := null;
begin
  if not exists (
    select 1
    from public.registries
    where id = p_registry_id
  ) then
    raise exception 'Registry not found.';
  end if;

  if coalesce(btrim(p_buyer_name), '') = '' then
    raise exception 'Buyer name is required.';
  end if;

  if coalesce(btrim(p_buyer_email), '') = '' then
    raise exception 'Buyer email is required.';
  end if;

  if coalesce(jsonb_typeof(p_selected_items), 'array') <> 'array' then
    raise exception 'Selected items payload must be an array.';
  end if;

  v_payment_amount := round(coalesce(p_payment_amount, 0)::numeric, 2);
  v_normalized_reference := nullif(btrim(coalesce(p_paystack_reference, '')), '');

  if v_payment_amount < 0 then
    raise exception 'Payment amount cannot be negative.';
  end if;

  if v_normalized_reference is null then
    raise exception 'Paystack reference is required.';
  end if;

  with raw_payload as (
    select
      ordinality::integer as payload_position,
      nullif(btrim(payload_item.value ->> 'registry_item_id'), '')::uuid as registry_item_id,
      nullif(btrim(payload_item.value ->> 'quantity'), '')::integer as quantity
    from jsonb_array_elements(coalesce(p_selected_items, '[]'::jsonb))
      with ordinality as payload_item(value, ordinality)
  ),
  payload as (
    select
      registry_item_id,
      sum(quantity)::integer as quantity,
      min(payload_position)::integer as payload_position
    from raw_payload
    group by registry_item_id
  )
  select
    count(*),
    count(*) filter (
      where registry_item_id is null
        or quantity is null
        or quantity <= 0
    )
  into v_payload_item_count, v_invalid_quantity_count
  from payload;

  if v_invalid_quantity_count > 0 then
    raise exception 'Selected item quantities must be greater than zero.';
  end if;

  select
    coalesce(
      sum(
        public.calculate_registry_item_remaining_amount(
          registry_item.requested_quantity,
          registry_item.unit_price_snapshot,
          registry_item.funded_amount
        )
      ),
      0
    )::numeric(10, 2)
  into v_remaining_registry_total
  from public.registry_items registry_item
  where registry_item.registry_id = p_registry_id;

  select
    coalesce(sum(amount), 0)::numeric(10, 2)
  into v_paid_contribution_total
  from public.registry_contributions
  where registry_id = p_registry_id
    and status = 'paid';

  v_available_registry_value := greatest(
    v_remaining_registry_total - v_paid_contribution_total,
    0
  )::numeric(10, 2);

  if v_payload_item_count > 0 then
    with raw_payload as (
      select
        ordinality::integer as payload_position,
        nullif(btrim(payload_item.value ->> 'registry_item_id'), '')::uuid as registry_item_id,
        nullif(btrim(payload_item.value ->> 'quantity'), '')::integer as quantity
      from jsonb_array_elements(coalesce(p_selected_items, '[]'::jsonb))
        with ordinality as payload_item(value, ordinality)
    ),
    payload as (
      select
        registry_item_id,
        sum(quantity)::integer as quantity,
        min(payload_position)::integer as payload_position
      from raw_payload
      group by registry_item_id
    ),
    locked_items as (
      select
        registry_item.id,
        registry_item.requested_quantity,
        registry_item.purchased_quantity,
        coalesce(registry_item.unit_price_snapshot, 0)::numeric(10, 2) as unit_price_snapshot,
        coalesce(registry_item.funded_amount, 0)::numeric(10, 2) as funded_amount,
        payload.quantity,
        payload.payload_position,
        public.calculate_registry_item_selection_amount(
          registry_item.requested_quantity,
          registry_item.purchased_quantity,
          registry_item.unit_price_snapshot,
          registry_item.funded_amount,
          payload.quantity
        )::numeric(10, 2) as selectable_amount
      from payload
      join public.registry_items registry_item
        on registry_item.id = payload.registry_item_id
       and registry_item.registry_id = p_registry_id
      order by payload.payload_position, registry_item.id
      for update of registry_item
    )
    select
      count(*),
      coalesce(sum(selectable_amount), 0)::numeric(10, 2),
      min(id)
    into v_locked_item_count, v_selection_total, v_single_item_id
    from locked_items;

    if v_locked_item_count <> v_payload_item_count then
      raise exception 'One or more selected registry items could not be found.';
    end if;

    if exists (
      with raw_payload as (
        select
          ordinality::integer as payload_position,
          nullif(btrim(payload_item.value ->> 'registry_item_id'), '')::uuid as registry_item_id,
          nullif(btrim(payload_item.value ->> 'quantity'), '')::integer as quantity
        from jsonb_array_elements(coalesce(p_selected_items, '[]'::jsonb))
          with ordinality as payload_item(value, ordinality)
      ),
      payload as (
        select
          registry_item_id,
          sum(quantity)::integer as quantity
        from raw_payload
        group by registry_item_id
      ),
      locked_items as (
        select
          registry_item.requested_quantity,
          registry_item.purchased_quantity,
          coalesce(registry_item.unit_price_snapshot, 0)::numeric(10, 2) as unit_price_snapshot,
          payload.quantity
        from payload
        join public.registry_items registry_item
          on registry_item.id = payload.registry_item_id
         and registry_item.registry_id = p_registry_id
        order by registry_item.id
        for update of registry_item
      )
      select 1
      from locked_items
      where unit_price_snapshot <= 0
         or quantity > greatest(requested_quantity - purchased_quantity, 0)
    ) then
      raise exception 'Some registry items are no longer available in the requested quantity.';
    end if;

    if v_selection_total <= 0 then
      raise exception 'The selected registry items are already fully funded.';
    end if;

    if v_payment_amount <= 0 then
      raise exception 'Enter how much you want to pay toward the selected items.';
    end if;

    v_payment_cap := least(v_selection_total, v_available_registry_value)::numeric(10, 2);
    if v_payment_amount > v_payment_cap then
      raise exception 'This payment exceeds the remaining fundable balance for the selected registry items.';
    end if;

    insert into public.registry_orders (
      registry_id,
      buyer_name,
      buyer_email,
      buyer_phone,
      buyer_message,
      total_amount,
      contribution_type,
      status,
      paystack_reference
    )
    values (
      p_registry_id,
      btrim(p_buyer_name),
      btrim(p_buyer_email),
      nullif(btrim(coalesce(p_buyer_phone, '')), ''),
      nullif(btrim(coalesce(p_buyer_message, '')), ''),
      v_payment_amount,
      'items',
      'awaiting_payment',
      v_normalized_reference
    )
    returning id into v_order_id;

    insert into public.registry_order_items (
      registry_order_id,
      registry_item_id,
      product_id,
      quantity,
      amount
    )
    with raw_payload as (
      select
        ordinality::integer as payload_position,
        nullif(btrim(payload_item.value ->> 'registry_item_id'), '')::uuid as registry_item_id,
        nullif(btrim(payload_item.value ->> 'quantity'), '')::integer as quantity
      from jsonb_array_elements(coalesce(p_selected_items, '[]'::jsonb))
        with ordinality as payload_item(value, ordinality)
    ),
    payload as (
      select
        registry_item_id,
        sum(quantity)::integer as quantity,
        min(payload_position)::integer as payload_position
      from raw_payload
      group by registry_item_id
    ),
    locked_items as (
      select
        registry_item.id,
        registry_item.product_id,
        payload.quantity,
        payload.payload_position,
        public.calculate_registry_item_selection_amount(
          registry_item.requested_quantity,
          registry_item.purchased_quantity,
          registry_item.unit_price_snapshot,
          registry_item.funded_amount,
          payload.quantity
        )::numeric(10, 2) as selectable_amount
      from payload
      join public.registry_items registry_item
        on registry_item.id = payload.registry_item_id
       and registry_item.registry_id = p_registry_id
      order by payload.payload_position, registry_item.id
      for update of registry_item
    ),
    allocated_items as (
      select
        locked_items.*,
        least(
          locked_items.selectable_amount,
          greatest(
            v_payment_amount - coalesce(
              sum(locked_items.selectable_amount) over (
                order by locked_items.payload_position, locked_items.id
                rows between unbounded preceding and 1 preceding
              ),
              0
            ),
            0
          )
        )::numeric(10, 2) as allocated_amount
      from locked_items
    )
    select
      v_order_id,
      allocated_items.id,
      allocated_items.product_id,
      allocated_items.quantity,
      allocated_items.allocated_amount
    from allocated_items
    where allocated_items.allocated_amount > 0;

    v_checkout_type := 'item';
  else
    if v_payment_amount <= 0 then
      raise exception 'Enter a contribution amount.';
    end if;

    if v_payment_amount > v_available_registry_value then
      raise exception 'Contribution exceeds the remaining registry total.';
    end if;

    insert into public.registry_contributions (
      registry_id,
      buyer_name,
      buyer_email,
      buyer_phone,
      buyer_message,
      amount,
      status,
      paystack_reference
    )
    values (
      p_registry_id,
      btrim(p_buyer_name),
      btrim(p_buyer_email),
      nullif(btrim(coalesce(p_buyer_phone, '')), ''),
      nullif(btrim(coalesce(p_buyer_message, '')), ''),
      v_payment_amount,
      'awaiting_payment',
      v_normalized_reference
    )
    returning id into v_contribution_id;
  end if;

  return jsonb_build_object(
    'amount_kobo', round(v_payment_amount * 100)::bigint,
    'checkout_type', v_checkout_type,
    'item_total', v_selection_total,
    'metadata', jsonb_build_object(
      'item_id', case when v_payload_item_count = 1 then v_single_item_id else null end,
      'registry_id', p_registry_id,
      'type', v_checkout_type
    ),
    'payment_amount', v_payment_amount,
    'paystack_reference', v_normalized_reference,
    'registry_contribution_id', v_contribution_id,
    'registry_order_id', v_order_id,
    'selection_total', v_selection_total
  );
end;
$$;

drop function if exists public.complete_registry_checkout_payment(text, bigint, bigint);

create or replace function public.complete_registry_checkout_payment(
  p_paystack_reference text,
  p_paid_amount_kobo bigint default null,
  p_paystack_transaction_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.registry_orders%rowtype;
  v_contribution public.registry_contributions%rowtype;
  v_registry_id uuid;
  v_expected_total numeric(10, 2) := 0;
  v_selection_total numeric(10, 2) := 0;
  v_remaining_registry_total numeric(10, 2) := 0;
  v_paid_contribution_total numeric(10, 2) := 0;
  v_available_registry_value numeric(10, 2) := 0;
begin
  if coalesce(btrim(p_paystack_reference), '') = '' then
    raise exception 'Paystack reference is required.';
  end if;

  select *
  into v_order
  from public.registry_orders
  where paystack_reference = btrim(p_paystack_reference)
  for update;

  select *
  into v_contribution
  from public.registry_contributions
  where paystack_reference = btrim(p_paystack_reference)
  for update;

  if v_order.id is null and v_contribution.id is null then
    raise exception 'Registry checkout not found.';
  end if;

  if v_order.id is not null then
    v_registry_id := v_order.registry_id;

    if v_order.status = 'paid' and (
      v_contribution.id is null or v_contribution.status = 'paid'
    ) then
      return jsonb_build_object(
        'checkout_type', case when v_order.id is not null then 'item' else 'cash' end,
        'paystack_reference', btrim(p_paystack_reference),
        'registry_contribution_id', v_contribution.id,
        'registry_id', v_registry_id,
        'registry_order_id', v_order.id,
        'status', 'paid'
      );
    end if;

    if v_order.status not in ('awaiting_payment', 'paid') then
      raise exception 'Registry order can no longer be completed.';
    end if;
  end if;

  if v_contribution.id is not null then
    if v_registry_id is null then
      v_registry_id := v_contribution.registry_id;
    elsif v_registry_id <> v_contribution.registry_id then
      raise exception 'Registry checkout records do not match.';
    end if;

    if v_contribution.status = 'paid' and (
      v_order.id is null or v_order.status = 'paid'
    ) then
      return jsonb_build_object(
        'checkout_type', case when v_order.id is not null then 'item' else 'cash' end,
        'paystack_reference', btrim(p_paystack_reference),
        'registry_contribution_id', v_contribution.id,
        'registry_id', v_registry_id,
        'registry_order_id', v_order.id,
        'status', 'paid'
      );
    end if;

    if v_contribution.status not in ('awaiting_payment', 'paid') then
      raise exception 'Registry contribution can no longer be completed.';
    end if;
  end if;

  if (
    v_order.id is not null
    and v_order.status = 'paid'
    and v_contribution.id is not null
    and v_contribution.status <> 'paid'
  ) or (
    v_contribution.id is not null
    and v_contribution.status = 'paid'
    and v_order.id is not null
    and v_order.status <> 'paid'
  ) then
    raise exception 'Registry checkout is in an unexpected partially completed state.';
  end if;

  v_expected_total := (
    coalesce(v_order.total_amount, 0) +
    coalesce(v_contribution.amount, 0)
  )::numeric(10, 2);

  if v_expected_total <= 0 then
    raise exception 'Registry checkout total must be greater than zero.';
  end if;

  if p_paid_amount_kobo is not null
    and round(v_expected_total * 100)::bigint <> p_paid_amount_kobo then
    raise exception 'Verified payment amount does not match this registry checkout.';
  end if;

  if v_order.id is not null then
    perform 1
    from public.registry_order_items order_item
    join public.registry_items registry_item
      on registry_item.id = order_item.registry_item_id
    where order_item.registry_order_id = v_order.id
    for update of registry_item;

    if exists (
      select 1
      from public.registry_order_items order_item
      join public.registry_items registry_item
        on registry_item.id = order_item.registry_item_id
      where order_item.registry_order_id = v_order.id
        and (
          coalesce(registry_item.unit_price_snapshot, 0) <= 0
          or order_item.quantity > greatest(registry_item.requested_quantity - registry_item.purchased_quantity, 0)
        )
    ) then
      raise exception 'Some registry items are no longer available in the requested quantity.';
    end if;

    select
      coalesce(
        sum(
          public.calculate_registry_item_selection_amount(
            registry_item.requested_quantity,
            registry_item.purchased_quantity,
            registry_item.unit_price_snapshot,
            registry_item.funded_amount,
            order_item.quantity
          )
        ),
        0
      )::numeric(10, 2)
    into v_selection_total
    from public.registry_order_items order_item
    join public.registry_items registry_item
      on registry_item.id = order_item.registry_item_id
    where order_item.registry_order_id = v_order.id;

    if v_selection_total <= 0 or v_order.total_amount > v_selection_total then
      raise exception 'This registry payment exceeds the remaining balance for the selected items.';
    end if;
  end if;

  perform 1
  from public.registry_items
  where registry_id = v_registry_id
  for update;

  select
    coalesce(
      sum(
        public.calculate_registry_item_remaining_amount(
          registry_item.requested_quantity,
          registry_item.unit_price_snapshot,
          registry_item.funded_amount
        )
      ),
      0
    )::numeric(10, 2)
  into v_remaining_registry_total
  from public.registry_items registry_item
  where registry_item.registry_id = v_registry_id;

  select
    coalesce(sum(amount), 0)::numeric(10, 2)
  into v_paid_contribution_total
  from public.registry_contributions
  where registry_id = v_registry_id
    and status = 'paid'
    and paystack_reference <> btrim(p_paystack_reference);

  v_available_registry_value := greatest(
    v_remaining_registry_total - v_paid_contribution_total,
    0
  )::numeric(10, 2);

  if v_order.id is not null and v_order.total_amount > v_available_registry_value then
    raise exception 'This registry payment exceeds the remaining fundable balance.';
  end if;

  if v_contribution.id is not null then
    if v_contribution.amount > greatest(
      v_available_registry_value - coalesce(v_order.total_amount, 0),
      0
    ) then
      raise exception 'Contribution exceeds the remaining registry total.';
    end if;
  end if;

  if v_order.id is not null and v_order.status <> 'paid' then
    update public.registry_items registry_item
    set
      funded_amount = least(
        round(registry_item.requested_quantity::numeric * registry_item.unit_price_snapshot * 1000, 2),
        registry_item.funded_amount + order_item.amount
      ),
      purchased_quantity = public.calculate_registry_item_purchased_quantity(
        registry_item.requested_quantity,
        registry_item.unit_price_snapshot,
        least(
          round(registry_item.requested_quantity::numeric * registry_item.unit_price_snapshot * 1000, 2),
          registry_item.funded_amount + order_item.amount
        )
      )
    from public.registry_order_items order_item
    where order_item.registry_order_id = v_order.id
      and order_item.registry_item_id = registry_item.id;

    update public.registry_orders
    set
      status = 'paid',
      paid_at = now(),
      paystack_reference = btrim(p_paystack_reference),
      paystack_transaction_id = coalesce(p_paystack_transaction_id, paystack_transaction_id)
    where id = v_order.id;
  end if;

  if v_contribution.id is not null and v_contribution.status <> 'paid' then
    update public.registry_contributions
    set
      status = 'paid',
      paid_at = now(),
      paystack_reference = btrim(p_paystack_reference),
      paystack_transaction_id = coalesce(p_paystack_transaction_id, paystack_transaction_id)
    where id = v_contribution.id;
  end if;

  return jsonb_build_object(
    'checkout_type', case when v_order.id is not null then 'item' else 'cash' end,
    'paystack_reference', btrim(p_paystack_reference),
    'registry_contribution_id', v_contribution.id,
    'registry_id', v_registry_id,
    'registry_order_id', v_order.id,
    'status', 'paid'
  );
end;
$$;

revoke all on function public.calculate_registry_item_remaining_amount(integer, numeric, numeric) from public;
grant execute on function public.calculate_registry_item_remaining_amount(integer, numeric, numeric) to authenticated, service_role;

revoke all on function public.calculate_registry_item_selection_amount(integer, integer, numeric, numeric, integer) from public;
grant execute on function public.calculate_registry_item_selection_amount(integer, integer, numeric, numeric, integer) to authenticated, service_role;

revoke all on function public.calculate_registry_item_purchased_quantity(integer, numeric, numeric) from public;
grant execute on function public.calculate_registry_item_purchased_quantity(integer, numeric, numeric) to authenticated, service_role;

revoke all on function public.create_registry_checkout(uuid, text, text, text, text, jsonb, numeric, text) from public;
grant execute on function public.create_registry_checkout(uuid, text, text, text, text, jsonb, numeric, text) to service_role;

revoke all on function public.complete_registry_checkout_payment(text, bigint, bigint) from public;
grant execute on function public.complete_registry_checkout_payment(text, bigint, bigint) to service_role;

revoke all on function public.cancel_registry_checkout(text) from public;
grant execute on function public.cancel_registry_checkout(text) to service_role;
