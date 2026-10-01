-- Apply after 20261004_promo_minimum_purchase_amount.sql.
alter table public.store_promos
  add column if not exists promo_type text not null default 'products' check (promo_type in ('products','delivery_discount','free_delivery')),
  add column if not exists maximum_discount_amount numeric(14,2) check (maximum_discount_amount > 0 and maximum_discount_amount::text not in ('NaN','Infinity','-Infinity')),
  add column if not exists applies_to_store boolean not null default true,
  add column if not exists applies_to_registry boolean not null default false;

alter table public.orders
  add column if not exists promo_type text,
  add column if not exists maximum_discount_amount numeric(14,2),
  add column if not exists shipping_discount_amount numeric not null default 0;

alter table public.registry_orders
  add column if not exists promo_code text,
  add column if not exists maximum_discount_amount numeric(14,2),
  add column if not exists discount_percentage numeric not null default 0,
  add column if not exists discount_amount numeric not null default 0;

create or replace function public.get_checkout_promo_discount(
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
  if p_context is null or p_context not in ('store','registry') then raise exception 'Invalid checkout.'; end if;
  if p_subtotal is null or p_subtotal < 0 or p_subtotal::text in ('NaN','Infinity','-Infinity')
    or p_shipping_fee is null or p_shipping_fee < 0 or p_shipping_fee::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Invalid checkout amount.';
  end if;
  select * into v_promo from public.store_promos
  where code = upper(btrim(p_code)) and is_active = true
    and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now());
  if not found then raise exception 'This promo code is invalid, inactive, or outside its valid dates.'; end if;
  if (p_context = 'store' and not v_promo.applies_to_store)
    or (p_context = 'registry' and not v_promo.applies_to_registry) then
    raise exception 'This promo code is not enabled for this checkout.';
  end if;
  if p_subtotal < v_promo.minimum_purchase_amount then
    raise exception 'This promo code requires at least NGN % worth of products, excluding delivery.',
      to_char(v_promo.minimum_purchase_amount, 'FM999,999,999,999,990.00');
  end if;
  if v_promo.promo_type <> 'products' and (p_context = 'registry' or p_shipping_fee <= 0) then
    raise exception 'This promo code requires a checkout with a delivery fee.';
  end if;
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
revoke all on function public.get_checkout_promo_discount(text,numeric,numeric,text) from public;
grant execute on function public.get_checkout_promo_discount(text,numeric,numeric,text) to authenticated,service_role;

-- Preserve the existing product promo preview API.
create or replace function public.get_store_promo_discount(p_code text,p_subtotal numeric)
returns jsonb language sql security definer set search_path = public as $$
  select public.get_checkout_promo_discount(p_code,p_subtotal,0,'store');
$$;

-- Registry item funding records the full gift value; payment records the net
-- amount after the business-funded discount. Cash gifts are not discountable.
create or replace function public.create_registry_checkout_with_promo(
  p_registry_id uuid, p_buyer_name text, p_buyer_email text, p_buyer_phone text,
  p_buyer_message text, p_selected_items jsonb, p_cash_amount numeric,
  p_paystack_reference text, p_promo_code text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_checkout jsonb;
  v_promo jsonb;
  v_order_id uuid;
  v_gross numeric;
  v_net numeric;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Registry checkout must be started by the server.'; end if;
  v_checkout := public.create_registry_checkout(p_registry_id,p_buyer_name,p_buyer_email,p_buyer_phone,p_buyer_message,p_selected_items,p_cash_amount,p_paystack_reference);
  if nullif(btrim(p_promo_code),'') is null then return v_checkout; end if;
  if v_checkout->>'checkout_type' <> 'item' then raise exception 'Promo codes apply to registry product gifts, not cash contributions.'; end if;
  v_order_id := (v_checkout->>'registry_order_id')::uuid;
  v_gross := (v_checkout->>'payment_amount')::numeric;
  v_promo := public.get_checkout_promo_discount(p_promo_code,v_gross,0,'registry');
  v_net := v_gross - (v_promo->>'discount_amount')::numeric;
  if v_net <= 0 then raise exception 'The discounted payment must be greater than zero.'; end if;
  update public.registry_orders set
    total_amount = v_net, promo_code = v_promo->>'code',
    discount_percentage = (v_promo->>'percentage')::numeric,
    maximum_discount_amount = (v_promo->>'maximum_discount_amount')::numeric,
    discount_amount = (v_promo->>'discount_amount')::numeric
  where id = v_order_id;
  return v_checkout || jsonb_build_object('payment_amount',v_net,'amount_kobo',round(v_net*100)::bigint,'promo',v_promo);
end;
$$;
revoke all on function public.create_registry_checkout_with_promo(uuid,text,text,text,text,jsonb,numeric,text,text) from public;
grant execute on function public.create_registry_checkout_with_promo(uuid,text,text,text,text,jsonb,numeric,text,text) to service_role;

-- The completion function below is copied from the latest registry funding
-- migration, with capacity checks using the gross gift value, while payment
-- verification continues to use the actual discounted amount.

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

    if v_selection_total <= 0 or (v_order.total_amount + v_order.discount_amount) > v_selection_total then
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

  if v_order.id is not null and (v_order.total_amount + v_order.discount_amount) > v_available_registry_value then
    raise exception 'This registry payment exceeds the remaining fundable balance.';
  end if;

  if v_contribution.id is not null then
    if v_contribution.amount > greatest(
      v_available_registry_value - coalesce(v_order.total_amount + v_order.discount_amount, 0),
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

  insert into public.orders (user_id, total, status, shipping_address, billing_address, items, payment_method, shipping_tier, customer_name, customer_email, customer_phone, shipping_label, promo_code, discount_percentage, discount_amount, promo_type, maximum_discount_amount, shipping_discount_amount)
  values (
    auth.uid(), round(v_subtotal - v_discount + v_shipping_fee, 2), 'pending', p_shipping_address, p_billing_address, v_order_items,
    'paystack', btrim(p_shipping_tier), coalesce(nullif(btrim(v_profile.full_name), ''), nullif(btrim(p_shipping_address->>'name'), ''), 'Customer'),
    coalesce(nullif(btrim(v_profile.email), ''), ''), coalesce(nullif(btrim(v_profile.phone), ''), nullif(p_shipping_address->>'phone', '')),
    v_shipping_label, v_promo->>'code', coalesce((v_promo->>'percentage')::numeric, 0), v_discount, v_promo->>'promo_type', (v_promo->>'maximum_discount_amount')::numeric, coalesce((v_promo->>'shipping_discount_amount')::numeric, 0)
  ) returning id into v_order_id;

  return v_order_id;
end;
$$;


notify pgrst, 'reload schema';
