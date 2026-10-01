-- Adds multi-image galleries for special packages and homepage deals, plus an
-- optional per-product stock quantity that caps how many units a customer can
-- buy (0 = not tracked). Safe to re-run.

-- Multi-image galleries ------------------------------------------------------
alter table public.special_packages
  add column if not exists override_images text[] not null default '{}'::text[];

alter table public.homepage_deals
  add column if not exists override_images text[] not null default '{}'::text[];

-- Backfill the legacy single image the first time the new column is added.
update public.special_packages
set override_images = array[override_image]
where override_images = '{}'::text[]
  and override_image is not null
  and btrim(override_image) <> '';

update public.homepage_deals
set override_images = array[override_image]
where override_images = '{}'::text[]
  and override_image is not null
  and btrim(override_image) <> '';

-- Optional stock quantity -----------------------------------------------------
alter table public.products
  add column if not exists stock_quantity integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_stock_quantity_nonnegative'
  ) then
    alter table public.products
      add constraint products_stock_quantity_nonnegative check (stock_quantity >= 0);
  end if;
end $$;

-- Availability check: a simple product (or a product ordered without picking a
-- variant) may now be capped by products.stock_quantity when it is tracked.
create or replace function public.assert_store_order_items_available(
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_product_id bigint;
  v_product_name text;
  v_quantity integer;
  v_variant_id_text text;
  v_variant_id uuid;
  v_product_has_variants boolean;
  v_product_in_stock boolean;
  v_product_stock_quantity integer;
  v_variant_stock_quantity integer;
  v_variant_in_stock boolean;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'You must be signed in to check product availability.';
  end if;

  if coalesce(jsonb_typeof(p_items), 'null') <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception 'Order items are required.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Every order item must be an object.';
    end if;

    if coalesce(v_item->>'product_id', '') !~ '^[1-9][0-9]*$' then
      raise exception 'Every order item needs a valid product id.';
    end if;

    if coalesce(v_item->>'quantity', '') !~ '^[1-9][0-9]*$' then
      raise exception 'Every order item needs a valid quantity.';
    end if;

    v_product_id := (v_item->>'product_id')::bigint;
    v_quantity := (v_item->>'quantity')::integer;
    v_variant_id_text := nullif(btrim(coalesce(v_item->>'variant_id', '')), '');

    select name, has_variants, in_stock, stock_quantity
    into v_product_name, v_product_has_variants, v_product_in_stock, v_product_stock_quantity
    from public.products
    where id = v_product_id
      and product_kind in ('standard', 'deal');

    if not found then
      raise exception 'This product is no longer available.';
    end if;

    if v_variant_id_text is not null then
      if not coalesce(v_product_has_variants, false) then
        raise exception '% does not have selectable options.', v_product_name;
      end if;

      if v_variant_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception 'Choose an available option for %.', v_product_name;
      end if;

      v_variant_id := v_variant_id_text::uuid;
      select stock_quantity, in_stock
      into v_variant_stock_quantity, v_variant_in_stock
      from public.product_variants
      where id = v_variant_id
        and product_id = v_product_id;

      if not found
        or not coalesce(v_variant_in_stock, false)
        or (coalesce(v_variant_stock_quantity, 0) > 0 and v_variant_stock_quantity < v_quantity) then
        raise exception 'The selected option for % is no longer available in that quantity.', v_product_name;
      end if;
    elsif not coalesce(v_product_in_stock, false) then
      raise exception '% is currently out of stock.', v_product_name;
    elsif coalesce(v_product_stock_quantity, 0) > 0
      and v_product_stock_quantity < v_quantity then
      raise exception '% only has % left.', v_product_name, v_product_stock_quantity;
    end if;
  end loop;
end;
$$;

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
  v_items jsonb;
  v_item jsonb;
  v_product_id bigint;
  v_product_name text;
  v_quantity integer;
  v_variant_id_text text;
  v_variant_id uuid;
  v_product_has_variants boolean;
  v_product_in_stock boolean;
  v_product_stock_quantity integer;
  v_variant_stock_quantity integer;
  v_variant_in_stock boolean;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'You must be signed in to complete an order payment.';
  end if;

  if coalesce(btrim(p_paystack_reference), '') = '' then
    raise exception 'Paystack reference is required.';
  end if;

  select status, payment_reference, user_id, items
  into v_status, v_existing_reference, v_user_id, v_items
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if auth.uid() is not null and v_user_id <> auth.uid() then
    raise exception 'You do not have access to this order.';
  end if;

  if v_status = 'paid' then
    if v_existing_reference is not null
      and v_existing_reference <> p_paystack_reference then
      raise exception 'Order is already marked as paid with a different payment reference.';
    end if;

    return p_order_id;
  end if;

  if v_status not in ('pending', 'awaiting_payment') then
    raise exception 'Order can no longer be completed.';
  end if;

  perform public.assert_store_order_items_available(v_items);

  for v_item in select value from jsonb_array_elements(v_items)
  loop
    v_product_id := (v_item->>'product_id')::bigint;
    v_quantity := (v_item->>'quantity')::integer;
    v_variant_id_text := nullif(btrim(coalesce(v_item->>'variant_id', '')), '');

    select name, has_variants, in_stock, stock_quantity
    into v_product_name, v_product_has_variants, v_product_in_stock, v_product_stock_quantity
    from public.products
    where id = v_product_id
      and product_kind in ('standard', 'deal')
    for update;

    if not found then
      raise exception 'This product is no longer available.';
    end if;

    if v_variant_id_text is not null and coalesce(v_product_has_variants, false) then
      v_variant_id := v_variant_id_text::uuid;
      select stock_quantity, in_stock
      into v_variant_stock_quantity, v_variant_in_stock
      from public.product_variants
      where id = v_variant_id
        and product_id = v_product_id
      for update;

      if not found
        or not coalesce(v_variant_in_stock, false)
        or (coalesce(v_variant_stock_quantity, 0) > 0 and v_variant_stock_quantity < v_quantity) then
        raise exception 'The selected option for % is no longer available in that quantity.', v_product_name;
      end if;

      -- Only decrement/auto-toggle a tracked quantity. When stock_quantity is
      -- 0 (i.e. not being tracked), leave it and in_stock exactly as the
      -- admin set them: the checkbox stays the source of truth.
      if coalesce(v_variant_stock_quantity, 0) > 0 then
        update public.product_variants
        set
          stock_quantity = greatest(stock_quantity - v_quantity, 0),
          in_stock = (stock_quantity - v_quantity) > 0
        where id = v_variant_id;
      end if;
    elsif not coalesce(v_product_in_stock, false) then
      raise exception '% is currently out of stock.', v_product_name;
    elsif coalesce(v_product_stock_quantity, 0) > 0 then
      update public.products
      set
        stock_quantity = greatest(stock_quantity - v_quantity, 0),
        in_stock = (stock_quantity - v_quantity) > 0
      where id = v_product_id;
    end if;
  end loop;

  update public.orders
  set
    payment_method = 'paystack',
    payment_reference = p_paystack_reference,
    status = 'paid'
  where id = p_order_id;

  return p_order_id;
end;
$$;

-- Standalone deals -----------------------------------------------------------
-- Homepage deals are their own products now. Each deal owns a hidden product
-- row (product_kind = 'deal') that carries its name, description, price, image,
-- and optional quantity limit. Checkout, stock, and order history keep working
-- without the admin having to pick an existing product from the catalogue.
do $$
declare
  v_constraint text;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.products'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%product_kind%'
  loop
    execute format('alter table public.products drop constraint %I', v_constraint);
  end loop;
end $$;

alter table public.products
  add constraint products_product_kind_check
  check (product_kind in ('standard', 'special_package', 'deal'));

-- Trusted totals: deal products are sellable just like standard products.
create or replace function public.create_store_order(
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
  v_item jsonb;
  v_product_id bigint;
  v_quantity integer;
  v_variant_id uuid;
  v_product_name text;
  v_product_price numeric;
  v_product_in_stock boolean;
  v_variant_price numeric;
  v_variant_size text;
  v_variant_color text;
  v_variant_in_stock boolean;
  v_shipping_fee numeric;
  v_subtotal numeric := 0;
  v_order_items jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to create an order.';
  end if;

  if coalesce(jsonb_typeof(p_items), 'null') <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception 'Order items are required.';
  end if;

  if coalesce(jsonb_typeof(p_shipping_address), 'null') <> 'object'
    or coalesce(jsonb_typeof(p_billing_address), 'null') <> 'object' then
    raise exception 'Shipping and billing addresses are required.';
  end if;

  select * into v_profile from public.user_profiles where id = auth.uid();
  if v_profile.id is null or v_profile.deleted_at is not null
    or coalesce(v_profile.account_status, 'active') <> 'active'
    or coalesce(btrim(v_profile.phone), '') = '' then
    raise exception 'Your account is not available for checkout.';
  end if;

  select fee into v_shipping_fee
  from public.shipping_tiers
  where code = btrim(coalesce(p_shipping_tier, '')) and is_active = true;
  if not found then
    raise exception 'Selected shipping tier is not available.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if coalesce(v_item->>'product_id', '') !~ '^[1-9][0-9]*$'
      or coalesce(v_item->>'quantity', '') !~ '^[1-9][0-9]*$' then
      raise exception 'Every order item needs a valid product and quantity.';
    end if;

    v_product_id := (v_item->>'product_id')::bigint;
    v_quantity := (v_item->>'quantity')::integer;
    select name, coalesce(selling_price, price), in_stock
    into v_product_name, v_product_price, v_product_in_stock
    from public.products
    where id = v_product_id and product_kind in ('standard', 'deal');
    if not found or not coalesce(v_product_in_stock, false) or v_product_price is null or v_product_price < 0 then
      raise exception 'This product is no longer available.';
    end if;

    v_variant_id := nullif(btrim(coalesce(v_item->>'variant_id', '')), '')::uuid;
    v_variant_price := null;
    v_variant_size := null;
    v_variant_color := null;
    if v_variant_id is not null then
      select price_override, size, color, in_stock
      into v_variant_price, v_variant_size, v_variant_color, v_variant_in_stock
      from public.product_variants
      where id = v_variant_id and product_id = v_product_id;
      if not found or not coalesce(v_variant_in_stock, false) then
        raise exception 'The selected option is no longer available.';
      end if;
    end if;

    v_product_price := round(coalesce(v_variant_price, v_product_price) * 1000, 2);
    v_subtotal := v_subtotal + (v_product_price * v_quantity);
    v_order_items := v_order_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'product_id', v_product_id, 'name', v_product_name, 'price', v_product_price,
      'quantity', v_quantity, 'variant_id', v_variant_id, 'size', v_variant_size, 'color', v_variant_color
    )));
  end loop;

  insert into public.orders (user_id, total, status, shipping_address, billing_address, items, payment_method, shipping_tier, customer_name, customer_email, customer_phone)
  values (
    auth.uid(), round(v_subtotal + v_shipping_fee, 2), 'pending', p_shipping_address, p_billing_address, v_order_items,
    'paystack', btrim(p_shipping_tier), coalesce(nullif(btrim(v_profile.full_name), ''), nullif(btrim(p_shipping_address->>'name'), ''), 'Customer'),
    coalesce(nullif(btrim(v_profile.email), ''), ''), coalesce(nullif(btrim(v_profile.phone), ''), nullif(p_shipping_address->>'phone', ''))
  ) returning id into v_order_id;

  return v_order_id;
end;
$$;

grant execute on function public.create_store_order(jsonb, jsonb, jsonb, text) to authenticated, service_role;
notify pgrst, 'reload schema';
