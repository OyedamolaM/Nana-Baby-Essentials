create table if not exists public.registry_contributions (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null references public.registries(id) on delete cascade,
  buyer_name text not null,
  buyer_email text not null,
  buyer_phone text,
  buyer_message text,
  amount numeric(10, 2) not null check (amount > 0),
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment', 'paid', 'cancelled', 'failed')),
  paystack_reference text,
  paystack_transaction_id bigint,
  paid_at timestamptz,
  created_at timestamptz default now()
);

alter table public.registry_orders
  add column if not exists paystack_transaction_id bigint,
  add column if not exists paid_at timestamptz;

alter table public.registry_contributions enable row level security;

drop policy if exists "Registry owners and admins can view registry contributions" on public.registry_contributions;
create policy "Registry owners and admins can view registry contributions" on public.registry_contributions
  for select using (
    exists (
      select 1
      from public.registries
      where id = registry_id and user_id = auth.uid()
    )
    or exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can insert registry contributions" on public.registry_contributions;
create policy "Admins can insert registry contributions" on public.registry_contributions
  for insert with check (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins can update registry contributions" on public.registry_contributions;
create policy "Admins can update registry contributions" on public.registry_contributions
  for update using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid() and is_admin = true
    )
  );

create unique index if not exists idx_registry_orders_paystack_reference_unique
  on public.registry_orders (paystack_reference)
  where paystack_reference is not null;

create unique index if not exists idx_registry_contributions_paystack_reference_unique
  on public.registry_contributions (paystack_reference)
  where paystack_reference is not null;

create index if not exists idx_registry_contributions_registry_id_created_at
  on public.registry_contributions (registry_id, created_at desc);

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
    coalesce(sum(unit_price_snapshot * quantity), 0)::numeric(10, 2),
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
        coalesce(unit_price_snapshot, 0)::numeric(10, 2) *
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
      paystack_reference
    )
    values (
      p_registry_id,
      btrim(p_buyer_name),
      btrim(p_buyer_email),
      nullif(btrim(coalesce(p_buyer_phone, '')), ''),
      nullif(btrim(coalesce(p_buyer_message, '')), ''),
      v_item_total,
      v_order_contribution_type,
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
      nullif(btrim(coalesce(p_buyer_phone, '')), ''),
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
  v_item_total numeric(10, 2) := 0;
  v_outstanding_registry_value numeric(10, 2) := 0;
  v_paid_contribution_total numeric(10, 2) := 0;
  v_available_cash_amount numeric(10, 2) := 0;
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
    v_item_total := coalesce(v_order.total_amount, 0)::numeric(10, 2);

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
        and greatest(registry_item.requested_quantity - registry_item.purchased_quantity, 0) = 0
    ) then
      raise exception 'One or more selected registry items are already fully purchased.';
    end if;

    if exists (
      select 1
      from public.registry_order_items order_item
      join public.registry_items registry_item
        on registry_item.id = order_item.registry_item_id
      where order_item.registry_order_id = v_order.id
        and order_item.quantity > greatest(registry_item.requested_quantity - registry_item.purchased_quantity, 0)
    ) then
      raise exception 'Some registry items are no longer available in the requested quantity.';
    end if;
  end if;

  if v_order.id is not null or v_contribution.id is not null then
    perform 1
    from public.registry_items
    where registry_id = v_registry_id
    for update;

    select
      coalesce(
        sum(
          coalesce(unit_price_snapshot, 0)::numeric(10, 2) *
          greatest(requested_quantity - purchased_quantity, 0)
        ),
        0
      )::numeric(10, 2)
    into v_outstanding_registry_value
    from public.registry_items
    where registry_id = v_registry_id;

    select
      coalesce(sum(amount), 0)::numeric(10, 2)
    into v_paid_contribution_total
    from public.registry_contributions
    where registry_id = v_registry_id
      and status = 'paid'
      and paystack_reference <> btrim(p_paystack_reference);

    v_available_registry_value := greatest(
      v_outstanding_registry_value - v_paid_contribution_total,
      0
    )::numeric(10, 2);

    if v_order.id is not null and v_item_total > v_available_registry_value then
      raise exception 'Selected items exceed the remaining unfunded registry total.';
    end if;

    if v_contribution.id is not null then
      v_available_cash_amount := greatest(
        v_available_registry_value - v_item_total,
        0
      )::numeric(10, 2);

      if v_contribution.amount > v_available_cash_amount then
        raise exception 'Contribution exceeds remaining registry total.';
      end if;
    end if;
  end if;

  if v_order.id is not null and v_order.status <> 'paid' then
    update public.registry_items registry_item
    set purchased_quantity = registry_item.purchased_quantity + order_item.quantity
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

drop function if exists public.cancel_registry_checkout(text);

create or replace function public.cancel_registry_checkout(
  p_paystack_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_contribution_id uuid;
begin
  if coalesce(btrim(p_paystack_reference), '') = '' then
    raise exception 'Paystack reference is required.';
  end if;

  update public.registry_orders
  set status = 'cancelled'
  where paystack_reference = btrim(p_paystack_reference)
    and status = 'awaiting_payment'
  returning id into v_order_id;

  update public.registry_contributions
  set status = 'cancelled'
  where paystack_reference = btrim(p_paystack_reference)
    and status = 'awaiting_payment'
  returning id into v_contribution_id;

  return jsonb_build_object(
    'paystack_reference', btrim(p_paystack_reference),
    'registry_contribution_id', v_contribution_id,
    'registry_order_id', v_order_id,
    'status', 'cancelled'
  );
end;
$$;

revoke all on function public.create_registry_checkout(uuid, text, text, text, text, jsonb, numeric, text) from public;
grant execute on function public.create_registry_checkout(uuid, text, text, text, text, jsonb, numeric, text) to service_role;

revoke all on function public.complete_registry_checkout_payment(text, bigint, bigint) from public;
grant execute on function public.complete_registry_checkout_payment(text, bigint, bigint) to service_role;

revoke all on function public.cancel_registry_checkout(text) from public;
grant execute on function public.cancel_registry_checkout(text) to service_role;

revoke all on function public.create_registry_order(uuid, text, text, text, text, numeric, text, jsonb) from public;
grant execute on function public.create_registry_order(uuid, text, text, text, text, numeric, text, jsonb) to service_role;

revoke all on function public.complete_registry_order_payment(uuid, text) from public;
grant execute on function public.complete_registry_order_payment(uuid, text) to service_role;

revoke all on function public.cancel_registry_order(uuid) from public;
grant execute on function public.cancel_registry_order(uuid) to service_role;

revoke all on function public.process_registry_payment(uuid, text, text, text, text, numeric, text, jsonb, text) from public;
grant execute on function public.process_registry_payment(uuid, text, text, text, text, numeric, text, jsonb, text) to service_role;
