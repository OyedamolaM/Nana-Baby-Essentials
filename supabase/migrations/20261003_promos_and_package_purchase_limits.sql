-- Percentage promo codes and optional purchase limits for packages/bundles.
-- Apply after 20261002_colour_galleries_and_explicit_stock_limits.sql.
create table if not exists public.store_promos (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(btrim(code)) and code ~ '^[A-Z0-9_-]{2,40}$'),
  percentage numeric(5,2) not null check (percentage > 0 and percentage < 100),
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);
alter table public.store_promos enable row level security;
revoke all on public.store_promos from public, anon, authenticated;
grant all on public.store_promos to service_role;
alter table public.orders add column if not exists shipping_label text;
update public.orders o set shipping_label = t.label from public.shipping_tiers t where o.shipping_tier = t.code and o.shipping_label is null;
alter table public.orders add column if not exists promo_code text;
alter table public.orders add column if not exists discount_percentage numeric not null default 0;
alter table public.orders add column if not exists discount_amount numeric not null default 0;

create or replace function public.get_store_promo_discount(p_code text, p_subtotal numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_promo public.store_promos%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in to use a promo code.'; end if;
  if p_subtotal is null or p_subtotal < 0 or p_subtotal::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid subtotal.'; end if;
  select * into v_promo from public.store_promos where code = upper(btrim(p_code)) and is_active = true
    and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now());
  if not found then raise exception 'This promo code is invalid, inactive, or outside its valid dates.'; end if;
  return jsonb_build_object('code', v_promo.code, 'percentage', v_promo.percentage, 'discount_amount', round(p_subtotal * v_promo.percentage / 100, 2));
end;
$$;
revoke all on function public.get_store_promo_discount(text,numeric) from public;
grant execute on function public.get_store_promo_discount(text,numeric) to authenticated;

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
  v_required_quantity numeric;
  v_variant_id_text text;
  v_variant_id uuid;
  v_product_has_variants boolean;
  v_product_in_stock boolean;
  v_product_stock_quantity integer;
  v_product_stock_limited boolean;
  v_variant_stock_quantity integer;
  v_variant_stock_limited boolean;
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
    select sum((entry->>'quantity')::numeric) into v_required_quantity
    from jsonb_array_elements(p_items) entry
    where entry->>'product_id' = v_item->>'product_id'
      and lower(nullif(btrim(coalesce(entry->>'variant_id', '')), '')) is not distinct from lower(v_variant_id_text);

    select name, has_variants, in_stock, stock_quantity, stock_limited
    into v_product_name, v_product_has_variants, v_product_in_stock, v_product_stock_quantity, v_product_stock_limited
    from public.products
    where id = v_product_id
      and product_kind in ('standard', 'deal', 'special_package');

    if not found then
      raise exception 'This product is no longer available.';
    end if;
    if not coalesce(v_product_in_stock, false) then
      raise exception '% is currently out of stock.', v_product_name;
    end if;

    if coalesce(v_product_has_variants, false) and v_variant_id_text is null then
      raise exception 'Choose an available option for %.', v_product_name;
    end if;

    if v_variant_id_text is not null then
      if not coalesce(v_product_has_variants, false) then
        raise exception '% does not have selectable options.', v_product_name;
      end if;

      if v_variant_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception 'Choose an available option for %.', v_product_name;
      end if;

      v_variant_id := v_variant_id_text::uuid;
      select stock_quantity, in_stock, stock_limited
      into v_variant_stock_quantity, v_variant_in_stock, v_variant_stock_limited
      from public.product_variants
      where id = v_variant_id
        and product_id = v_product_id;

      if not found
        or not coalesce(v_variant_in_stock, false)
        or (coalesce(v_variant_stock_limited, false) and v_variant_stock_quantity < v_required_quantity) then
        raise exception 'The selected option for % is no longer available in that quantity.', v_product_name;
      end if;
    elsif not coalesce(v_product_in_stock, false) then
      raise exception '% is currently out of stock.', v_product_name;
    elsif coalesce(v_product_stock_limited, false)
      and v_product_stock_quantity < v_required_quantity then
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
  v_product_stock_limited boolean;
  v_variant_stock_quantity integer;
  v_variant_stock_limited boolean;
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

    select name, has_variants, in_stock, stock_quantity, stock_limited
    into v_product_name, v_product_has_variants, v_product_in_stock, v_product_stock_quantity, v_product_stock_limited
    from public.products
    where id = v_product_id
      and product_kind in ('standard', 'deal', 'special_package')
    for update;

    if not found then
      raise exception 'This product is no longer available.';
    end if;
    if not coalesce(v_product_in_stock, false) then
      raise exception '% is currently out of stock.', v_product_name;
    end if;

    if v_variant_id_text is not null and coalesce(v_product_has_variants, false) then
      v_variant_id := v_variant_id_text::uuid;
      select stock_quantity, in_stock, stock_limited
      into v_variant_stock_quantity, v_variant_in_stock, v_variant_stock_limited
      from public.product_variants
      where id = v_variant_id
        and product_id = v_product_id
      for update;

      if not found
        or not coalesce(v_variant_in_stock, false)
        or (coalesce(v_variant_stock_limited, false) and v_variant_stock_quantity < v_quantity) then
        raise exception 'The selected option for % is no longer available in that quantity.', v_product_name;
      end if;

      -- The stock limit setting persists when remaining inventory reaches zero.
      if coalesce(v_variant_stock_limited, false) then
        update public.product_variants
        set
          stock_quantity = stock_quantity - v_quantity
        where id = v_variant_id;
      end if;
    elsif not coalesce(v_product_in_stock, false) then
      raise exception '% is currently out of stock.', v_product_name;
    elsif coalesce(v_product_stock_limited, false) then
      if v_product_stock_quantity < v_quantity then
        raise exception '% only has % left.', v_product_name, v_product_stock_quantity;
      end if;
      update public.products
      set
        stock_quantity = stock_quantity - v_quantity
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

create or replace function public.create_store_order(
  p_shipping_address jsonb,
  p_billing_address jsonb,
  p_items jsonb,
  p_shipping_tier text,
  p_promo_code text
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
  v_variant_options jsonb;
  v_variant_size text;
  v_variant_color text;
  v_variant_in_stock boolean;
  v_shipping_fee numeric;
  v_shipping_label text;
  v_subtotal numeric := 0;
  v_promo jsonb;
  v_discount numeric := 0;
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

  select fee, label into v_shipping_fee, v_shipping_label
  from public.shipping_tiers
  where code = btrim(coalesce(p_shipping_tier, '')) and is_active = true;
  if not found then
    raise exception 'Selected shipping tier is not available.';
  end if;

  perform public.assert_store_order_items_available(p_items);

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
    where id = v_product_id and product_kind in ('standard', 'deal', 'special_package');
    if not found or not coalesce(v_product_in_stock, false) or v_product_price is null or v_product_price < 0 then
      raise exception 'This product is no longer available.';
    end if;

    v_variant_id := nullif(btrim(coalesce(v_item->>'variant_id', '')), '')::uuid;
    v_variant_options := null;
    v_variant_price := null;
    v_variant_size := null;
    v_variant_color := null;
    if v_variant_id is not null then
      select price_override, size, color, in_stock, options
      into v_variant_price, v_variant_size, v_variant_color, v_variant_in_stock, v_variant_options
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
      'quantity', v_quantity, 'variant_id', v_variant_id, 'size', v_variant_size, 'color', v_variant_color,
      'options', v_variant_options
    )));
  end loop;

  if nullif(btrim(coalesce(p_promo_code, '')), '') is not null then
    v_promo := public.get_store_promo_discount(p_promo_code, v_subtotal);
    v_discount := (v_promo->>'discount_amount')::numeric;
  end if;

  insert into public.orders (user_id, total, status, shipping_address, billing_address, items, payment_method, shipping_tier, customer_name, customer_email, customer_phone, shipping_label, promo_code, discount_percentage, discount_amount)
  values (
    auth.uid(), round(v_subtotal - v_discount + v_shipping_fee, 2), 'pending', p_shipping_address, p_billing_address, v_order_items,
    'paystack', btrim(p_shipping_tier), coalesce(nullif(btrim(v_profile.full_name), ''), nullif(btrim(p_shipping_address->>'name'), ''), 'Customer'),
    coalesce(nullif(btrim(v_profile.email), ''), ''), coalesce(nullif(btrim(v_profile.phone), ''), nullif(p_shipping_address->>'phone', '')),
    v_shipping_label, v_promo->>'code', coalesce((v_promo->>'percentage')::numeric, 0), v_discount
  ) returning id into v_order_id;

  return v_order_id;
end;
$$;

-- Preserve existing clients that do not send a promo code.
create or replace function public.create_store_order(p_shipping_address jsonb,p_billing_address jsonb,p_items jsonb,p_shipping_tier text)
returns uuid language sql security definer set search_path = public as $$
  select public.create_store_order(p_shipping_address,p_billing_address,p_items,p_shipping_tier,null);
$$;
revoke all on function public.create_store_order(jsonb,jsonb,jsonb,text,text) from public;
grant execute on function public.create_store_order(jsonb,jsonb,jsonb,text,text) to authenticated, service_role;
grant execute on function public.create_store_order(jsonb,jsonb,jsonb,text) to authenticated, service_role;
notify pgrst, 'reload schema';
