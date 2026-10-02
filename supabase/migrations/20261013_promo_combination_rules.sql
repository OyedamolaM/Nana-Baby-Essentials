alter table public.store_promos add column if not exists can_combine boolean not null default false;
alter table public.orders add column if not exists promo_details jsonb;
create or replace function public.get_checkout_promo_discount_single(
  p_code text, p_subtotal numeric, p_shipping_fee numeric, p_context text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_promo public.store_promos%rowtype;
  v_discount numeric;
  v_base numeric;
begin
  if auth.uid() is null and coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Sign in to use a promo code.';
  end if;
  if p_context is null or p_context not in ('store','registry','registry_delivery') then raise exception 'Invalid checkout.'; end if;
  if p_subtotal is null or p_subtotal < 0 or p_subtotal::text in ('NaN','Infinity','-Infinity')
    or p_shipping_fee is null or p_shipping_fee < 0 or p_shipping_fee::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Invalid checkout amount.';
  end if;
  select * into v_promo from public.store_promos
  where code = upper(btrim(p_code)) and is_active = true
    and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now());
  if not found then raise exception 'This promo code is invalid, inactive, or outside its valid dates.'; end if;
  if (p_context = 'store' and not v_promo.applies_to_store)
    or (p_context in ('registry','registry_delivery') and not v_promo.applies_to_registry) then
    raise exception 'This promo code is not enabled for this checkout.';
  end if;
  if p_subtotal < v_promo.minimum_purchase_amount then
    raise exception 'This promo code requires at least NGN % worth of products, excluding delivery.',
      to_char(v_promo.minimum_purchase_amount, 'FM999,999,999,999,990.00');
  end if;
  if v_promo.promo_type <> 'products' and (p_context = 'registry' or p_shipping_fee <= 0) then
    raise exception 'This promo code requires a checkout with a delivery fee.';
  end if;
  if p_context='registry_delivery' and v_promo.promo_type='products' then raise exception 'Use a delivery promo for the delivery fee.'; end if;
  v_base := case when v_promo.promo_type = 'products' then p_subtotal else p_shipping_fee end;
  v_discount := case when v_promo.promo_type = 'free_delivery' then v_base
    else round(v_base * v_promo.percentage / 100, 2) end;
  if v_promo.maximum_discount_amount is not null then
    v_discount := least(v_discount, v_promo.maximum_discount_amount);
  end if;
  v_discount := least(v_discount, v_base);
  return jsonb_build_object(
    'code',v_promo.code, 'percentage',v_promo.percentage, 'promo_type',v_promo.promo_type,
    'minimum_purchase_amount',v_promo.minimum_purchase_amount,
    'maximum_discount_amount',v_promo.maximum_discount_amount,
    'discount_amount',v_discount,
    'shipping_discount_amount',case when v_promo.promo_type = 'products' then 0 else v_discount end
  );
end;
$$;
revoke all on function public.get_checkout_promo_discount_single(text,numeric,numeric,text) from public;
grant execute on function public.get_checkout_promo_discount_single(text,numeric,numeric,text) to authenticated,service_role;


notify pgrst, 'reload schema';

create or replace function public.assert_store_promos_combinable(p_codes text)
returns void language plpgsql security definer set search_path=public as $$
declare v_codes text[];
begin
  select array_agg(upper(btrim(code))) into v_codes from unnest(string_to_array(p_codes,',')) code;
  if cardinality(v_codes)>5 then raise exception 'Use at most five promo codes.'; end if;
  if exists(select 1 from unnest(v_codes) c where c !~ '^[A-Z0-9_-]{2,40}$') then raise exception 'Enter valid promo codes.'; end if;
  if (select count(distinct c) from unnest(v_codes) c) <> cardinality(v_codes) then raise exception 'A promo code cannot be used twice.'; end if;
  if cardinality(v_codes)>1 and exists(select 1 from unnest(v_codes) c left join public.store_promos p on p.code=c where not coalesce(p.can_combine,false)) then raise exception 'These promo codes cannot be combined.'; end if;
end;
$$;
revoke all on function public.assert_store_promos_combinable(text) from public,anon,authenticated;
grant execute on function public.assert_store_promos_combinable(text) to service_role;
create or replace function public.get_checkout_promo_discount(p_code text,p_subtotal numeric,p_shipping_fee numeric,p_context text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_code text; v_quote jsonb; v_promos jsonb:='[]'; v_products numeric:=0; v_shipping numeric:=0; v_percentage numeric:=0; v_codes text[];
begin
  perform public.assert_store_promos_combinable(p_code);
  foreach v_code in array string_to_array(p_code,',') loop
    v_quote:=public.get_checkout_promo_discount_single(btrim(v_code),p_subtotal,p_shipping_fee,p_context);
    v_promos:=v_promos||jsonb_build_array(v_quote);
    v_codes:=array_append(v_codes,v_quote->>'code');
    if v_quote->>'promo_type'='products' then v_products:=v_products+(v_quote->>'discount_amount')::numeric;v_percentage:=v_percentage+(v_quote->>'percentage')::numeric;
    else v_shipping:=v_shipping+(v_quote->>'discount_amount')::numeric; end if;
  end loop;
  v_products:=least(v_products,p_subtotal);v_shipping:=least(v_shipping,p_shipping_fee);
  if cardinality(v_codes)=1 then return v_quote||jsonb_build_object('promos',v_promos); end if;
  return jsonb_build_object('code',array_to_string(v_codes,', '),'percentage',v_percentage,'promo_type',case when v_products>0 then 'products' else 'delivery_discount' end,
    'discount_amount',v_products+v_shipping,'shipping_discount_amount',v_shipping,'maximum_discount_amount',null,'promos',v_promos);
end;
$$;
revoke all on function public.get_checkout_promo_discount(text,numeric,numeric,text) from public;
grant execute on function public.get_checkout_promo_discount(text,numeric,numeric,text) to authenticated,service_role;

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
    v_promo := public.get_checkout_promo_discount(p_promo_code, v_subtotal, v_shipping_fee, 'store');
    v_discount := (v_promo->>'discount_amount')::numeric;
  end if;

  insert into public.orders (user_id, total, status, shipping_address, billing_address, items, payment_method, shipping_tier, customer_name, customer_email, customer_phone, shipping_label, promo_code, discount_percentage, discount_amount, promo_type, maximum_discount_amount, shipping_discount_amount, promo_details)
  values (
    auth.uid(), round(v_subtotal - v_discount + v_shipping_fee, 2), 'pending', p_shipping_address, p_billing_address, v_order_items,
    'paystack', btrim(p_shipping_tier), coalesce(nullif(btrim(v_profile.full_name), ''), nullif(btrim(p_shipping_address->>'name'), ''), 'Customer'),
    coalesce(nullif(btrim(v_profile.email), ''), ''), coalesce(nullif(btrim(v_profile.phone), ''), nullif(p_shipping_address->>'phone', '')),
    v_shipping_label, v_promo->>'code', coalesce((v_promo->>'percentage')::numeric, 0), v_discount, v_promo->>'promo_type', (v_promo->>'maximum_discount_amount')::numeric, coalesce((v_promo->>'shipping_discount_amount')::numeric, 0), v_promo->'promos'
  ) returning id into v_order_id;

  return v_order_id;
end;
$$;


notify pgrst, 'reload schema';

create or replace function public.get_registry_delivery_quote(p_registry_id uuid,p_actor_id uuid,p_shipping_tier text,p_promo_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_registry public.registries%rowtype;
  v_address jsonb;
  v_fee numeric;
  v_label text;
  v_items jsonb;
  v_subtotal numeric;
  v_promo jsonb;
  v_discount numeric := 0;
begin
  if nullif(btrim(p_promo_code),'') is not null and exists(select 1 from public.registries where id=p_registry_id and product_promo_code is not null) then perform public.assert_store_promos_combinable((select product_promo_code from public.registries where id=p_registry_id)||','||p_promo_code); end if;
  perform public.get_registry_cash_balance(p_registry_id,p_actor_id);
  select * into v_registry from public.registries where id=p_registry_id;
  if coalesce(v_registry.fulfillment_status,'collecting') not in ('collecting','ready_for_shipping') then raise exception 'This registry has already been dispatched.'; end if;
  if exists(select 1 from public.registry_orders where registry_id=p_registry_id and status in ('pending','awaiting_payment'))
    or exists(select 1 from public.registry_contributions where registry_id=p_registry_id and status in ('pending','awaiting_payment')) then
    raise exception 'A gift payment is still pending. Resolve it before requesting delivery.';
  end if;
  if (public.get_registry_cash_balance(p_registry_id,p_actor_id)->>'available')::numeric > 0 then raise exception 'Apply the available gift balance to products before requesting delivery.'; end if;
  if exists(select 1 from public.registry_items where registry_id=p_registry_id and funded_amount > round(purchased_quantity*unit_price_snapshot*1000,2)) then
    raise exception 'Complete partially funded products before requesting delivery.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('registry_item_id',i.id,'product_id',i.product_id,'name',p.name,'quantity',i.purchased_quantity)), '[]'),
    coalesce(sum(round(i.purchased_quantity*i.unit_price_snapshot*1000,2)),0)
  into v_items,v_subtotal from public.registry_items i left join public.products p on p.id=i.product_id
  where i.registry_id=p_registry_id and i.purchased_quantity>0;
  if jsonb_array_length(v_items)=0 then raise exception 'No fully funded products are ready for delivery.'; end if;
  select shipping_address into v_address from public.user_profiles where id=v_registry.user_id;
  if coalesce(jsonb_typeof(v_address),'null') <> 'object'
    or coalesce(btrim(v_address->>'name'),'')='' or coalesce(btrim(v_address->>'phone'),'')=''
    or coalesce(btrim(v_address->>'address'),'')='' or coalesce(btrim(v_address->>'city'),'')=''
    or coalesce(btrim(v_address->>'state'),'')='' then raise exception 'Save a complete delivery address first.'; end if;
  select fee,label into v_fee,v_label from public.shipping_tiers
    where code=p_shipping_tier and is_active and coalesce(fulfillment_type,'delivery')='delivery';
  if not found or v_fee is null or v_fee < 0 then raise exception 'Choose an available delivery area.'; end if;
  if nullif(btrim(p_promo_code),'') is not null then
    v_promo := public.get_checkout_promo_discount(p_promo_code,v_subtotal,v_fee,'registry_delivery');
    v_discount := (v_promo->>'discount_amount')::numeric;
  end if;
  return jsonb_build_object('shipping_tier',p_shipping_tier,'shipping_label',v_label,'shipping_fee',v_fee,
    'shipping_address',v_address,'items',v_items,'subtotal',v_subtotal,'total',v_fee-v_discount,'promo_code',v_promo->>'code','discount_amount',v_discount);
end;
$$;
revoke all on function public.get_registry_delivery_quote(uuid,uuid,text,text) from public;
grant execute on function public.get_registry_delivery_quote(uuid,uuid,text,text) to service_role;


notify pgrst, 'reload schema';
