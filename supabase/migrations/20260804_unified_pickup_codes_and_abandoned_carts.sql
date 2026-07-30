alter table public.orders
  add column if not exists pickup_code text;

update public.orders as store_order
set pickup_code = coalesce(
  nullif(btrim(store_order.pickup_code), ''),
  nullif(btrim(store_order.customer_pickup_code), ''),
  nullif(btrim(store_order.rider_pickup_code), ''),
  'PU-' || upper(substr(md5(gen_random_uuid()::text), 1, 6))
)
from public.shipping_tiers as shipping_tier
where shipping_tier.code = store_order.shipping_tier
  and shipping_tier.fulfillment_type = 'pickup';

update public.orders
set
  customer_pickup_code = pickup_code,
  rider_pickup_code = pickup_code
where pickup_code is not null;

update public.orders as store_order
set
  pickup_code = null,
  customer_pickup_code = null,
  rider_pickup_code = null
where not exists (
  select 1
  from public.shipping_tiers as shipping_tier
  where shipping_tier.code = store_order.shipping_tier
    and shipping_tier.fulfillment_type = 'pickup'
);

alter table public.orders
  drop constraint if exists orders_pickup_codes_match;

alter table public.orders
  add constraint orders_pickup_codes_match
  check (
    (
      pickup_code is null
      and customer_pickup_code is null
      and rider_pickup_code is null
    )
    or (
      pickup_code is not null
      and pickup_code = customer_pickup_code
      and pickup_code = rider_pickup_code
    )
  );

create or replace function public.assign_store_order_pickup_codes()
returns trigger
language plpgsql
as $$
declare
  v_fulfillment_type text := 'delivery';
  v_pickup_code text;
begin
  select fulfillment_type
  into v_fulfillment_type
  from public.shipping_tiers
  where code = new.shipping_tier;

  if coalesce(v_fulfillment_type, 'delivery') = 'pickup' then
    v_pickup_code := coalesce(
      nullif(btrim(new.pickup_code), ''),
      nullif(btrim(new.customer_pickup_code), ''),
      nullif(btrim(new.rider_pickup_code), ''),
      'PU-' || upper(substr(md5(gen_random_uuid()::text), 1, 6))
    );
    new.pickup_code := v_pickup_code;
    new.customer_pickup_code := v_pickup_code;
    new.rider_pickup_code := v_pickup_code;
  else
    new.pickup_code := null;
    new.customer_pickup_code := null;
    new.rider_pickup_code := null;
  end if;

  return new;
end;
$$;

drop trigger if exists set_store_order_pickup_codes on public.orders;
create trigger set_store_order_pickup_codes
before insert or update of shipping_tier, pickup_code, customer_pickup_code, rider_pickup_code
on public.orders
for each row
execute function public.assign_store_order_pickup_codes();

alter table public.shopping_carts
  add column if not exists updated_at timestamptz not null default now();

update public.shopping_carts
set updated_at = coalesce(updated_at, created_at, now());

create or replace function public.touch_shopping_cart_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cart_id uuid;
begin
  if tg_op = 'DELETE' then
    v_cart_id := old.cart_id;
  else
    v_cart_id := new.cart_id;
  end if;

  update public.shopping_carts
  set updated_at = now()
  where id = v_cart_id;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.touch_shopping_cart_activity() from public;

drop trigger if exists touch_shopping_cart_after_item_change on public.shopping_cart_items;
create trigger touch_shopping_cart_after_item_change
after insert or update or delete
on public.shopping_cart_items
for each row
execute function public.touch_shopping_cart_activity();

drop policy if exists "Admins can view shopping carts" on public.shopping_carts;
create policy "Admins can view shopping carts"
  on public.shopping_carts
  for select
  using (public.is_current_user_admin());

drop policy if exists "Admins can view shopping cart items" on public.shopping_cart_items;
create policy "Admins can view shopping cart items"
  on public.shopping_cart_items
  for select
  using (public.is_current_user_admin());

create index if not exists idx_shopping_carts_updated_at
  on public.shopping_carts (updated_at desc);

notify pgrst, 'reload schema';
