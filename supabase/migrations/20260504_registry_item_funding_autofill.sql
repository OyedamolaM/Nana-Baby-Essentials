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
