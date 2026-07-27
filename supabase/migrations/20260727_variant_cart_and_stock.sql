-- Step 8: variant-aware carts and atomic product-variant stock handling.
-- Apply after 20260725_product_gallery_variants.sql and before deploying the
-- matching cart/checkout code. Every statement is safe to re-run.

alter table public.shopping_cart_items
  add column if not exists variant_id uuid
    references public.product_variants(id) on delete set null;

-- The original cart key permits only one line per product. Remove it even if
-- a previous environment generated a different default constraint name.
do $$
declare
  v_constraint_name text;
begin
  for v_constraint_name in
    select constraint_row.conname
    from pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.shopping_cart_items'::regclass
      and constraint_row.contype = 'u'
      and (
        select array_agg(attribute_row.attname order by key_row.ordinality)
        from unnest(constraint_row.conkey) with ordinality as key_row(attnum, ordinality)
        join pg_attribute as attribute_row
          on attribute_row.attrelid = constraint_row.conrelid
          and attribute_row.attnum = key_row.attnum
      ) = array['cart_id', 'product_id']::name[]
  loop
    execute format(
      'alter table public.shopping_cart_items drop constraint if exists %I',
      v_constraint_name
    );
  end loop;
end;
$$;

create unique index if not exists shopping_cart_items_cart_product_variant_unique
  on public.shopping_cart_items (cart_id, product_id, variant_id)
  where variant_id is not null;

create unique index if not exists shopping_cart_items_cart_product_base_unique
  on public.shopping_cart_items (cart_id, product_id)
  where variant_id is null;

create or replace function public.validate_shopping_cart_item_variant()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.variant_id is not null and not exists (
    select 1
    from public.product_variants
    where id = new.variant_id
      and product_id = new.product_id
  ) then
    raise exception 'The selected variant does not belong to this product.';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_shopping_cart_item_variant() from public;

drop trigger if exists shopping_cart_items_validate_variant on public.shopping_cart_items;
create trigger shopping_cart_items_validate_variant
  before insert or update of product_id, variant_id
  on public.shopping_cart_items
  for each row
  execute function public.validate_shopping_cart_item_variant();

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
  v_variant_id uuid;
  v_product_has_variants boolean;
  v_product_in_stock boolean;
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

    select name, has_variants, in_stock
    into v_product_name, v_product_has_variants, v_product_in_stock
    from public.products
    where id = v_product_id
      and product_kind = 'standard';

    if not found then
      raise exception 'This product is no longer available.';
    end if;

    if coalesce(v_product_has_variants, false) then
      if coalesce(v_item->>'variant_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception 'Choose an available option for %.', v_product_name;
      end if;

      v_variant_id := (v_item->>'variant_id')::uuid;
      select stock_quantity, in_stock
      into v_variant_stock_quantity, v_variant_in_stock
      from public.product_variants
      where id = v_variant_id
        and product_id = v_product_id;

      if not found
        or not coalesce(v_variant_in_stock, false)
        or coalesce(v_variant_stock_quantity, 0) < v_quantity then
        raise exception 'The selected option for % is no longer available in that quantity.', v_product_name;
      end if;
    elsif nullif(btrim(coalesce(v_item->>'variant_id', '')), '') is not null then
      raise exception '% does not have selectable options.', v_product_name;
    elsif not coalesce(v_product_in_stock, false) then
      raise exception '% is currently out of stock.', v_product_name;
    end if;
  end loop;
end;
$$;

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

  perform public.assert_store_order_items_available(p_items);

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
    payment_method,
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
    'paystack',
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
  v_variant_id uuid;
  v_product_has_variants boolean;
  v_product_in_stock boolean;
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

    select name, has_variants, in_stock
    into v_product_name, v_product_has_variants, v_product_in_stock
    from public.products
    where id = v_product_id
      and product_kind = 'standard'
    for share;

    if not found then
      raise exception 'This product is no longer available.';
    end if;

    if coalesce(v_product_has_variants, false) then
      v_variant_id := (v_item->>'variant_id')::uuid;
      select stock_quantity, in_stock
      into v_variant_stock_quantity, v_variant_in_stock
      from public.product_variants
      where id = v_variant_id
        and product_id = v_product_id
      for update;

      if not found
        or not coalesce(v_variant_in_stock, false)
        or coalesce(v_variant_stock_quantity, 0) < v_quantity then
        raise exception 'The selected option for % is no longer available in that quantity.', v_product_name;
      end if;

      update public.product_variants
      set
        stock_quantity = stock_quantity - v_quantity,
        in_stock = (stock_quantity - v_quantity) > 0
      where id = v_variant_id;
    elsif not coalesce(v_product_in_stock, false) then
      raise exception '% is currently out of stock.', v_product_name;
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

revoke all on function public.assert_store_order_items_available(jsonb) from public;
grant execute on function public.assert_store_order_items_available(jsonb) to authenticated, service_role;

revoke all on function public.create_store_order(numeric, jsonb, jsonb, jsonb, text) from public;
grant execute on function public.create_store_order(numeric, jsonb, jsonb, jsonb, text) to authenticated, service_role;

revoke all on function public.complete_store_order_payment(uuid, text) from public;
grant execute on function public.complete_store_order_payment(uuid, text) to service_role;

notify pgrst, 'reload schema';