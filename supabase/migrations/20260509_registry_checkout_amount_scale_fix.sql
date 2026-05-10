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
    coalesce(sum((round(unit_price_snapshot * 1000, 2)) * quantity), 0)::numeric(10, 2),
    min(id::text)::uuid
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
        round(coalesce(unit_price_snapshot, 0)::numeric * 1000, 2) *
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
      (round(locked_items.unit_price_snapshot * 1000, 2) * locked_items.quantity)::numeric(10, 2)
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

revoke all on function public.create_registry_checkout(uuid, text, text, text, text, jsonb, numeric, text) from public;
grant execute on function public.create_registry_checkout(uuid, text, text, text, text, jsonb, numeric, text) to service_role;

notify pgrst, 'reload schema';
