-- Apply after 20261005_promo_delivery_caps_and_registry.sql.
create table if not exists public.registry_cash_allocations (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null references public.registries(id) on delete restrict,
  registry_item_id uuid not null references public.registry_items(id) on delete restrict,
  actor_id uuid not null references public.user_profiles(id),
  request_id uuid not null,
  amount numeric(14,2) not null check (amount > 0 and amount::text not in ('NaN','Infinity','-Infinity')),
  created_at timestamptz not null default now(),
  unique(registry_id,request_id,registry_item_id)
);
alter table public.registry_cash_allocations enable row level security;
revoke all on public.registry_cash_allocations from public,anon,authenticated;
grant all on public.registry_cash_allocations to service_role;

create or replace function public.get_registry_cash_balance(p_registry_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_received numeric;
  v_allocated numeric;
  v_history jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Registry balance must be accessed through the server.'; end if;
  if not exists (
    select 1 from public.registries r join public.user_profiles p on p.id=p_actor_id
    where r.id=p_registry_id and (r.user_id=p_actor_id or coalesce(p.is_admin,false))
      and p.deleted_at is null and coalesce(p.account_status,'active')='active'
  ) then raise exception 'You cannot access this registry balance.'; end if;
  select coalesce(sum(amount),0) into v_received from public.registry_contributions where registry_id=p_registry_id and status='paid';
  select coalesce(sum(amount),0) into v_allocated from public.registry_cash_allocations where registry_id=p_registry_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'registry_item_id',a.registry_item_id,'amount',a.amount,'created_at',a.created_at) order by a.created_at desc,a.id),'[]')
    into v_history from public.registry_cash_allocations a where registry_id=p_registry_id;
  return jsonb_build_object('available',greatest(v_received-v_allocated,0),'received',v_received,'allocated',v_allocated,'allocations',v_history);
end;
$$;
revoke all on function public.get_registry_cash_balance(uuid,uuid) from public;
grant execute on function public.get_registry_cash_balance(uuid,uuid) to service_role;

create or replace function public.allocate_registry_cash_balance(p_registry_id uuid,p_actor_id uuid,p_request_id uuid,p_allocations jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_balance jsonb;
  v_entry jsonb;
  v_item public.registry_items%rowtype;
  v_amount numeric;
  v_total numeric := 0;
begin
  v_balance := public.get_registry_cash_balance(p_registry_id,p_actor_id);
  perform 1 from public.registries where id=p_registry_id for update;
  if exists (select 1 from public.registry_cash_allocations where registry_id=p_registry_id and request_id=p_request_id) then
    return public.get_registry_cash_balance(p_registry_id,p_actor_id);
  end if;
  if p_request_id is null then raise exception 'Allocation reference is required.'; end if;
  if not exists(select 1 from public.registries where id=p_registry_id and status <> 'closed' and coalesce(fulfillment_status,'collecting')='collecting') then
    raise exception 'This registry is no longer accepting allocations.';
  end if;
  if coalesce(jsonb_typeof(p_allocations),'null') <> 'array' then raise exception 'Select products and amounts.'; end if;
  if jsonb_array_length(p_allocations)=0 then raise exception 'Select products and amounts.'; end if;
  for v_entry in select value from jsonb_array_elements(p_allocations) loop
    if jsonb_typeof(v_entry) <> 'object' or coalesce(v_entry->>'amount','') !~ '^[0-9]+(\.[0-9]{1,2})?$'
      or coalesce(v_entry->>'registry_item_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Enter valid product amounts, with no more than two decimal places.';
    end if;
    v_amount := (v_entry->>'amount')::numeric;
    if v_amount <= 0 then raise exception 'Allocation amounts must be greater than zero.'; end if;
    v_total := v_total + v_amount;
  end loop;
  if (select count(distinct value->>'registry_item_id') from jsonb_array_elements(p_allocations)) <> jsonb_array_length(p_allocations) then
    raise exception 'Select each product once.';
  end if;
  v_balance := public.get_registry_cash_balance(p_registry_id,p_actor_id);
  if v_total > (v_balance->>'available')::numeric then raise exception 'This exceeds your available gift balance.'; end if;
  for v_entry in select value from jsonb_array_elements(p_allocations) order by value->>'registry_item_id' loop
    select * into v_item from public.registry_items where id=(v_entry->>'registry_item_id')::uuid and registry_id=p_registry_id for update;
    if not found then raise exception 'This product is not in the registry.'; end if;
    v_amount := (v_entry->>'amount')::numeric;
    if v_amount > public.calculate_registry_item_remaining_amount(v_item.requested_quantity,v_item.unit_price_snapshot,v_item.funded_amount) then
      raise exception 'This exceeds the amount remaining for the selected product.';
    end if;
    insert into public.registry_cash_allocations(registry_id,registry_item_id,actor_id,request_id,amount)
    values(p_registry_id,v_item.id,p_actor_id,p_request_id,v_amount);
    update public.registry_items set funded_amount=funded_amount+v_amount,
      purchased_quantity=public.calculate_registry_item_purchased_quantity(requested_quantity,unit_price_snapshot,funded_amount+v_amount)
    where id=v_item.id;
  end loop;
  return public.get_registry_cash_balance(p_registry_id,p_actor_id);
end;
$$;
revoke all on function public.allocate_registry_cash_balance(uuid,uuid,uuid,jsonb) from public;
grant execute on function public.allocate_registry_cash_balance(uuid,uuid,uuid,jsonb) to service_role;

create or replace function public.rebuild_registry_cash_item_funding(p_registry_item_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.registry_items%rowtype; v_total numeric;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Funding must be updated through the server.'; end if;
  perform 1 from public.registries where id=(select registry_id from public.registry_items where id=p_registry_item_id) for update;
  select * into v_item from public.registry_items where id=p_registry_item_id for update;
  if not found then return; end if;
  select coalesce(sum(i.amount),0) into v_total from public.registry_order_items i
    join public.registry_orders o on o.id=i.registry_order_id where i.registry_item_id=p_registry_item_id and o.status='paid';
  select v_total + coalesce(sum(amount),0) into v_total from public.registry_cash_allocations where registry_item_id=p_registry_item_id;
  v_total := least(v_total,round(v_item.requested_quantity*v_item.unit_price_snapshot*1000,2));
  update public.registry_items set funded_amount=v_total,
    purchased_quantity=public.calculate_registry_item_purchased_quantity(requested_quantity,unit_price_snapshot,v_total) where id=p_registry_item_id;
end;
$$;
revoke all on function public.rebuild_registry_cash_item_funding(uuid) from public,anon,authenticated;
grant execute on function public.rebuild_registry_cash_item_funding(uuid) to service_role;

-- Keep the existing registry-scoped function's parameter name and semantics.
create or replace function public.rebuild_registry_item_funding(p_registry_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Funding must be updated through the server.'; end if;
  perform 1 from public.registries where id=p_registry_id for update;
  for v_id in select id from public.registry_items where registry_id=p_registry_id order by id loop
    perform public.rebuild_registry_cash_item_funding(v_id);
  end loop;
end;
$$;
revoke all on function public.rebuild_registry_item_funding(uuid) from public,anon,authenticated;
grant execute on function public.rebuild_registry_item_funding(uuid) to service_role;

create or replace function public.create_registry_checkout_internal_20260805(
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
  v_payment_amount numeric(10, 2) := 0;
  v_selection_total numeric(10, 2) := 0;
  v_remaining_registry_total numeric(10, 2) := 0;
  v_paid_contribution_total numeric(10, 2) := 0;
  v_available_registry_value numeric(10, 2) := 0;
  v_payment_cap numeric(10, 2) := 0;
  v_checkout_type text := 'cash';
  v_single_item_id uuid := null;
  v_normalized_reference text := null;
  v_owner_shipping_address jsonb;
begin
  perform 1 from public.registries where id=p_registry_id for update;
  if exists(select 1 from public.registries where id=p_registry_id and status='closed') then raise exception 'This registry is closed to new gifts.'; end if;
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

  v_payment_amount := round(coalesce(p_cash_amount, 0)::numeric, 2);
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
    (coalesce(sum(amount), 0) - (select coalesce(sum(amount),0) from public.registry_cash_allocations where registry_id=p_registry_id))::numeric(10, 2)
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
      min(id::text)::uuid
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
      paystack_reference,
      shipping_address
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
  perform 1 from public.registries where id=(select registry_id from public.registry_orders where paystack_reference=btrim(p_paystack_reference) union all select registry_id from public.registry_contributions where paystack_reference=btrim(p_paystack_reference) limit 1) for update;
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
    (coalesce(sum(amount), 0) - (select coalesce(sum(amount),0) from public.registry_cash_allocations where registry_id=v_registry_id))::numeric(10, 2)
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



notify pgrst, 'reload schema';
