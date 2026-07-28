-- Step 11: a product with variants no longer requires a variant to be picked.
-- If no variant_id is sent for an order item, treat it like a simple product
-- and check the product's own in_stock flag instead of forcing a selection.
-- Safe to re-run.

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

    select name, has_variants, in_stock
    into v_product_name, v_product_has_variants, v_product_in_stock
    from public.products
    where id = v_product_id
      and product_kind = 'standard';

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
      -- No variant chosen: fall back to the product's own availability,
      -- whether or not it has variants defined.
      raise exception '% is currently out of stock.', v_product_name;
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

    select name, has_variants, in_stock
    into v_product_name, v_product_has_variants, v_product_in_stock
    from public.products
    where id = v_product_id
      and product_kind = 'standard'
    for share;

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

notify pgrst, 'reload schema';
