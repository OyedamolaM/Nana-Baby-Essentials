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
  v_customer_name text;
  v_customer_email text;
  v_customer_phone text;
  v_subtotal numeric := 0;
  v_order_items jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'You must be signed in to create an order.'; end if;
  if coalesce(jsonb_typeof(p_items), 'null') <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Order items are required.'; end if;
  if coalesce(jsonb_typeof(p_shipping_address), 'null') <> 'object' or coalesce(jsonb_typeof(p_billing_address), 'null') <> 'object' then raise exception 'Shipping and billing addresses are required.'; end if;

  select * into v_profile from public.user_profiles where id = auth.uid();
  if v_profile.id is null or v_profile.deleted_at is not null or coalesce(v_profile.account_status, 'active') <> 'active' then raise exception 'Your account is not available for checkout.'; end if;
  v_customer_name := coalesce(nullif(btrim(v_profile.full_name), ''), nullif(btrim(p_shipping_address->>'name'), ''), 'Customer');
  v_customer_email := coalesce(nullif(btrim(v_profile.email), ''), '');
  v_customer_phone := coalesce(nullif(btrim(v_profile.phone), ''), nullif(btrim(p_shipping_address->>'phone'), ''));
  if v_customer_phone is null then raise exception 'Phone number is required to complete checkout.'; end if;

  select fee into v_shipping_fee from public.shipping_tiers where code = btrim(coalesce(p_shipping_tier, '')) and is_active = true;
  if not found then raise exception 'Selected shipping tier is not available.'; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(v_item->>'product_id', '') !~ '^[1-9][0-9]*$' or coalesce(v_item->>'quantity', '') !~ '^[1-9][0-9]*$' then raise exception 'Every order item needs a valid product and quantity.'; end if;
    v_product_id := (v_item->>'product_id')::bigint;
    v_quantity := (v_item->>'quantity')::integer;
    select name, coalesce(selling_price, price), in_stock into v_product_name, v_product_price, v_product_in_stock from public.products where id = v_product_id and product_kind = 'standard';
    if not found or not coalesce(v_product_in_stock, false) or v_product_price is null or v_product_price < 0 then raise exception 'This product is no longer available.'; end if;
    v_variant_id := nullif(btrim(coalesce(v_item->>'variant_id', '')), '')::uuid;
    v_variant_price := null; v_variant_size := null; v_variant_color := null;
    if v_variant_id is not null then
      select price_override, size, color, in_stock into v_variant_price, v_variant_size, v_variant_color, v_variant_in_stock from public.product_variants where id = v_variant_id and product_id = v_product_id;
      if not found or not coalesce(v_variant_in_stock, false) then raise exception 'The selected option is no longer available.'; end if;
    end if;
    v_product_price := round(coalesce(v_variant_price, v_product_price) * 1000, 2);
    v_subtotal := v_subtotal + (v_product_price * v_quantity);
    v_order_items := v_order_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('product_id', v_product_id, 'name', v_product_name, 'price', v_product_price, 'quantity', v_quantity, 'variant_id', v_variant_id, 'size', v_variant_size, 'color', v_variant_color)));
  end loop;

  update public.user_profiles
  set full_name = coalesce(nullif(btrim(full_name), ''), nullif(btrim(p_shipping_address->>'name'), ''), v_customer_name),
      phone = coalesce(nullif(btrim(phone), ''), v_customer_phone),
      shipping_address = jsonb_build_object('name', coalesce(nullif(btrim(p_shipping_address->>'name'), ''), v_customer_name), 'phone', v_customer_phone, 'address', coalesce(nullif(btrim(p_shipping_address->>'address'), ''), ''), 'city', coalesce(nullif(btrim(p_shipping_address->>'city'), ''), ''), 'state', coalesce(nullif(btrim(p_shipping_address->>'state'), ''), ''))
  where id = auth.uid();

  insert into public.orders (user_id, total, status, shipping_address, billing_address, items, payment_method, shipping_tier, customer_name, customer_email, customer_phone)
  values (auth.uid(), round(v_subtotal + v_shipping_fee, 2), 'pending', p_shipping_address, p_billing_address, v_order_items, 'paystack', btrim(p_shipping_tier), v_customer_name, v_customer_email, v_customer_phone)
  returning id into v_order_id;
  return v_order_id;
end;
$$;

notify pgrst, 'reload schema';
