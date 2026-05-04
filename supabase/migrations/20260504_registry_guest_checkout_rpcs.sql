drop policy if exists "Anyone can insert registry orders" on public.registry_orders;
drop policy if exists "Admins can insert registry orders" on public.registry_orders;
create policy "Admins can insert registry orders" on public.registry_orders
  for insert with check (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Anyone can update registry orders" on public.registry_orders;
drop policy if exists "Admins can update registry orders" on public.registry_orders;
create policy "Admins can update registry orders" on public.registry_orders
  for update using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Anyone can insert registry order items" on public.registry_order_items;
drop policy if exists "Admins can insert registry order items" on public.registry_order_items;
create policy "Admins can insert registry order items" on public.registry_order_items
  for insert with check (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop function if exists public.create_registry_order(uuid, text, text, text, text, numeric, text);
drop function if exists public.create_registry_order(uuid, text, text, text, text, numeric, text, jsonb);

create or replace function public.create_registry_order(
  p_registry_id uuid,
  p_buyer_name text,
  p_buyer_email text,
  p_buyer_phone text default null,
  p_buyer_message text default null,
  p_total numeric default 0,
  p_contribution_type text default 'cash',
  p_selected_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_payload_item_count integer := 0;
  v_invalid_quantity_count integer := 0;
  v_locked_item_count integer := 0;
  v_item_total numeric(10, 2) := 0;
  v_total numeric(10, 2) := 0;
  v_cash_component numeric(10, 2) := 0;
  v_resolved_contribution_type text := 'cash';
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
    coalesce(sum(unit_price_snapshot * quantity), 0)::numeric(10, 2)
  into v_locked_item_count, v_item_total
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
    where quantity > greatest(requested_quantity - purchased_quantity, 0)
  ) then
    raise exception 'Some registry items are no longer available in the requested quantity.';
  end if;

  v_total := round(coalesce(p_total, 0)::numeric, 2);

  if v_total <= 0 then
    raise exception 'Order total must be greater than zero.';
  end if;

  if v_total < v_item_total then
    raise exception 'Order total cannot be less than the selected registry items total.';
  end if;

  v_cash_component := (v_total - v_item_total)::numeric(10, 2);

  if v_payload_item_count > 0 and v_cash_component > 0 then
    v_resolved_contribution_type := 'mixed';
  elsif v_payload_item_count > 0 then
    v_resolved_contribution_type := 'items';
  else
    v_resolved_contribution_type := 'cash';
  end if;

  insert into public.registry_orders (
    registry_id,
    buyer_name,
    buyer_email,
    buyer_phone,
    buyer_message,
    total_amount,
    contribution_type,
    status
  )
  values (
    p_registry_id,
    btrim(p_buyer_name),
    btrim(p_buyer_email),
    nullif(btrim(coalesce(p_buyer_phone, '')), ''),
    nullif(btrim(coalesce(p_buyer_message, '')), ''),
    v_total,
    v_resolved_contribution_type,
    'awaiting_payment'
  )
  returning id into v_order_id;

  if v_payload_item_count > 0 then
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
      (locked_items.unit_price_snapshot * locked_items.quantity)::numeric(10, 2)
    from locked_items;
  end if;

  return v_order_id;
end;
$$;

drop function if exists public.complete_registry_order_payment(uuid, text);

create or replace function public.complete_registry_order_payment(
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
begin
  if coalesce(btrim(p_paystack_reference), '') = '' then
    raise exception 'Paystack reference is required.';
  end if;

  select status, paystack_reference
  into v_status, v_existing_reference
  from public.registry_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Registry order not found.';
  end if;

  if v_status = 'paid' then
    if v_existing_reference is not null
      and v_existing_reference <> p_paystack_reference then
      raise exception 'Registry order is already marked as paid with a different payment reference.';
    end if;

    return p_order_id;
  end if;

  if v_status <> 'awaiting_payment' then
    raise exception 'Registry order can no longer be completed.';
  end if;

  perform 1
  from public.registry_order_items order_item
  join public.registry_items registry_item
    on registry_item.id = order_item.registry_item_id
  where order_item.registry_order_id = p_order_id
  for update of registry_item;

  if exists (
    select 1
    from public.registry_order_items order_item
    join public.registry_items registry_item
      on registry_item.id = order_item.registry_item_id
    where order_item.registry_order_id = p_order_id
      and order_item.quantity > greatest(registry_item.requested_quantity - registry_item.purchased_quantity, 0)
  ) then
    raise exception 'Some registry items are no longer available in the requested quantity.';
  end if;

  update public.registry_items registry_item
  set purchased_quantity = registry_item.purchased_quantity + order_item.quantity
  from public.registry_order_items order_item
  where order_item.registry_order_id = p_order_id
    and order_item.registry_item_id = registry_item.id;

  update public.registry_orders
  set
    status = 'paid',
    paystack_reference = p_paystack_reference
  where id = p_order_id;

  return p_order_id;
end;
$$;

drop function if exists public.cancel_registry_order(uuid);

create or replace function public.cancel_registry_order(
  p_order_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status
  into v_status
  from public.registry_orders
  where id = p_order_id
  for update;

  if not found then
    return p_order_id;
  end if;

  if v_status = 'awaiting_payment' then
    update public.registry_orders
    set status = 'cancelled'
    where id = p_order_id;
  end if;

  return p_order_id;
end;
$$;

drop function if exists public.process_registry_payment(uuid, text, text, text, text, numeric, text, jsonb, text);

create or replace function public.process_registry_payment(
  p_registry_id uuid,
  p_buyer_name text,
  p_buyer_email text,
  p_buyer_phone text default null,
  p_buyer_message text default null,
  p_total numeric default 0,
  p_contribution_type text default 'cash',
  p_selected_items jsonb default '[]'::jsonb,
  p_paystack_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  v_order_id := public.create_registry_order(
    p_registry_id,
    p_buyer_name,
    p_buyer_email,
    p_buyer_phone,
    p_buyer_message,
    p_total,
    p_contribution_type,
    p_selected_items
  );

  perform public.complete_registry_order_payment(
    v_order_id,
    p_paystack_reference
  );

  return v_order_id;
end;
$$;

revoke all on function public.create_registry_order(uuid, text, text, text, text, numeric, text, jsonb) from public;
grant execute on function public.create_registry_order(uuid, text, text, text, text, numeric, text, jsonb) to anon, authenticated, service_role;

revoke all on function public.complete_registry_order_payment(uuid, text) from public;
grant execute on function public.complete_registry_order_payment(uuid, text) to anon, authenticated, service_role;

revoke all on function public.cancel_registry_order(uuid) from public;
grant execute on function public.cancel_registry_order(uuid) to anon, authenticated, service_role;

revoke all on function public.process_registry_payment(uuid, text, text, text, text, numeric, text, jsonb, text) from public;
grant execute on function public.process_registry_payment(uuid, text, text, text, text, numeric, text, jsonb, text) to anon, authenticated, service_role;
