-- One owner-applied product promo for the entire registry, before gifting.
alter table public.registries
  add column if not exists product_promo_code text,
  add column if not exists product_promo_subtotal numeric not null default 0,
  add column if not exists product_promo_discount numeric not null default 0;
alter table public.registry_items
  alter column unit_price_snapshot type numeric(18,8),
  add column if not exists original_unit_price_snapshot numeric(18,8);

create or replace function public.registry_promo_is_locked(p_registry_id uuid)
returns boolean language sql security definer set search_path=public as $$
  select exists(select 1 from public.registry_orders where registry_id=p_registry_id and status in ('paid','pending','awaiting_payment'))
    or exists(select 1 from public.registry_contributions where registry_id=p_registry_id and status in ('paid','pending','awaiting_payment'))
    or exists(select 1 from public.registry_delivery_orders where registry_id=p_registry_id and status in ('paid','awaiting_payment'))
    or exists(select 1 from public.registry_items where registry_id=p_registry_id and funded_amount>0);
$$;
revoke all on function public.registry_promo_is_locked(uuid) from public,anon,authenticated;
grant execute on function public.registry_promo_is_locked(uuid) to service_role;

create or replace function public.set_registry_product_promo(p_registry_id uuid,p_actor_id uuid,p_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_registry public.registries%rowtype; v_total numeric; v_quote jsonb; v_discount numeric; v_net numeric;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Use the registry promo controls.'; end if;
  perform public.get_registry_cash_balance(p_registry_id,p_actor_id);
  select * into v_registry from public.registries where id=p_registry_id for update;
  if v_registry.user_id <> p_actor_id then raise exception 'Only the registry owner can apply a promo.'; end if;
  if public.registry_promo_is_locked(p_registry_id) then raise exception 'The registry promo is locked because gifting has started.'; end if;
  if v_registry.status='closed' then raise exception 'This registry is closed.'; end if;
  perform 1 from public.registry_items where registry_id=p_registry_id order by id for update;
  perform set_config('registry.applying_promo',p_registry_id::text,true);
  update public.registry_items set unit_price_snapshot=coalesce(original_unit_price_snapshot,unit_price_snapshot),original_unit_price_snapshot=null where registry_id=p_registry_id;
  if nullif(btrim(p_code),'') is null then
    update public.registries set product_promo_code=null,product_promo_subtotal=0,product_promo_discount=0 where id=p_registry_id;
    return jsonb_build_object('code',null,'discount',0,'locked',false);
  end if;
  select coalesce(sum(requested_quantity*round(unit_price_snapshot*1000,2)),0) into v_total from public.registry_items where registry_id=p_registry_id;
  if v_total<=0 then raise exception 'Add products before applying a promo.'; end if;
  v_quote:=public.get_checkout_promo_discount(p_code,v_total,0,'registry');
  v_discount:=(v_quote->>'discount_amount')::numeric;
  update public.registry_items set original_unit_price_snapshot=unit_price_snapshot,
    unit_price_snapshot=(ceil(round(unit_price_snapshot*1000,2)*(1-v_discount/v_total)*100)/100)/1000
    where registry_id=p_registry_id;
  select sum(requested_quantity*round(unit_price_snapshot*1000,2)) into v_net from public.registry_items where registry_id=p_registry_id;
  update public.registries set product_promo_code=v_quote->>'code',product_promo_subtotal=v_total,product_promo_discount=v_total-v_net where id=p_registry_id;
  return jsonb_build_object('code',v_quote->>'code','subtotal',v_total,'discount',v_total-v_net,'total',v_net,'locked',false);
end;
$$;
revoke all on function public.set_registry_product_promo(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.set_registry_product_promo(uuid,uuid,text) to service_role;

create or replace function public.guard_registry_product_promo()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if TG_TABLE_NAME='registries' then
    if TG_OP='INSERT' then
      if coalesce(auth.role(),'') <> 'service_role' and (new.product_promo_code is not null or new.product_promo_subtotal<>0 or new.product_promo_discount<>0) then raise exception 'Use the registry promo controls.'; end if;
      return new;
    end if;
    if coalesce(auth.role(),'') <> 'service_role' and (new.product_promo_code is distinct from old.product_promo_code or new.product_promo_subtotal is distinct from old.product_promo_subtotal or new.product_promo_discount is distinct from old.product_promo_discount) then raise exception 'Use the registry promo controls.'; end if;
    return new;
  end if;
  v_id:=case when TG_OP='DELETE' then old.registry_id else new.registry_id end;
  perform 1 from public.registries where id=v_id for update;
  if coalesce(auth.role(),'')='service_role' and current_setting('registry.applying_promo',true)=v_id::text then return new; end if;
  if exists(select 1 from public.registries where id=v_id and product_promo_code is not null) then
    if TG_OP='DELETE' and coalesce(auth.role(),'')='service_role' then return old; end if;
    if TG_OP in ('INSERT','DELETE') then raise exception 'Remove the registry promo before changing products.'; end if;
    if new.requested_quantity is distinct from old.requested_quantity or new.unit_price_snapshot is distinct from old.unit_price_snapshot or new.product_id is distinct from old.product_id or new.registry_id is distinct from old.registry_id or new.original_unit_price_snapshot is distinct from old.original_unit_price_snapshot then raise exception 'Registry products are fixed while a promo is applied.'; end if;
  elsif coalesce(auth.role(),'')<>'service_role' and (TG_OP='INSERT' and new.original_unit_price_snapshot is not null or TG_OP='UPDATE' and new.original_unit_price_snapshot is distinct from old.original_unit_price_snapshot) then raise exception 'Use the registry promo controls.';
  end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists registry_product_promo_fields_guard on public.registries;
create trigger registry_product_promo_fields_guard before insert or update on public.registries for each row execute function public.guard_registry_product_promo();
drop trigger if exists registry_product_promo_items_guard on public.registry_items;
create trigger registry_product_promo_items_guard before insert or update or delete on public.registry_items for each row execute function public.guard_registry_product_promo();

create or replace function public.create_registry_checkout_with_promo(
 p_registry_id uuid,p_buyer_name text,p_buyer_email text,p_buyer_phone text,p_buyer_message text,p_selected_items jsonb,p_cash_amount numeric,p_paystack_reference text,p_promo_code text
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if nullif(btrim(p_promo_code),'') is not null then raise exception 'Registry promos are applied by the owner before gifting.'; end if;
 return public.create_registry_checkout(p_registry_id,p_buyer_name,p_buyer_email,p_buyer_phone,p_buyer_message,p_selected_items,p_cash_amount,p_paystack_reference);
end;
$$;
revoke all on function public.create_registry_checkout_with_promo(uuid,text,text,text,text,jsonb,numeric,text,text) from public,anon,authenticated;
grant execute on function public.create_registry_checkout_with_promo(uuid,text,text,text,text,jsonb,numeric,text,text) to service_role;

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
  -- Validate expiry until the first successful gift; then honor the locked snapshot.
  if exists(select 1 from public.registries where id=p_registry_id and product_promo_code is not null)
    and not exists(select 1 from public.registry_orders where registry_id=p_registry_id and status='paid')
    and not exists(select 1 from public.registry_contributions where registry_id=p_registry_id and status='paid') then
    perform public.get_checkout_promo_discount(
      (select product_promo_code from public.registries where id=p_registry_id),
      (select product_promo_subtotal from public.registries where id=p_registry_id),0,'registry');
  end if;
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
        coalesce(registry_item.unit_price_snapshot, 0)::numeric(18,8) as unit_price_snapshot,
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
          coalesce(registry_item.unit_price_snapshot, 0)::numeric(18,8) as unit_price_snapshot,
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

create or replace function public.reprice_unpaid_registry_item_quantities()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  registry_item_record public.registry_items%rowtype;
  remaining_quantity integer;
  previous_unit_amount numeric(12, 2);
  next_unit_price numeric(12, 4);
  next_unit_amount numeric(12, 2);
  locked_funded_amount numeric(12, 2);
  partial_funded_amount numeric(12, 2);
begin
  next_unit_price := greatest(coalesce(new.selling_price, new.price, 0), 0);
  next_unit_amount := round(next_unit_price * 1000, 2);

  if next_unit_amount <= 0 then
    return new;
  end if;

  for registry_item_record in
    select registry_item.*
    from public.registry_items registry_item
    where registry_item.product_id = new.id
      and not exists(select 1 from public.registries r where r.id=registry_item.registry_id and r.product_promo_code is not null)
      and registry_item.requested_quantity > registry_item.purchased_quantity
    order by registry_item.created_at, registry_item.id
    for update
  loop
    previous_unit_amount := round(
      greatest(coalesce(registry_item_record.unit_price_snapshot, 0), 0) * 1000,
      2
    );

    if next_unit_amount = previous_unit_amount then
      continue;
    end if;

    remaining_quantity := greatest(
      registry_item_record.requested_quantity - registry_item_record.purchased_quantity,
      0
    );
    locked_funded_amount := least(
      greatest(coalesce(registry_item_record.funded_amount, 0), 0),
      registry_item_record.purchased_quantity::numeric * previous_unit_amount
    );
    partial_funded_amount := greatest(
      coalesce(registry_item_record.funded_amount, 0) - locked_funded_amount,
      0
    );

    if next_unit_amount < previous_unit_amount and partial_funded_amount > 0 then
      continue;
    end if;

    if registry_item_record.purchased_quantity <= 0 then
      update public.registry_items
      set unit_price_snapshot = next_unit_price
      where id = registry_item_record.id;
    else
      update public.registry_items
      set
        requested_quantity = registry_item_record.purchased_quantity,
        funded_amount = locked_funded_amount
      where id = registry_item_record.id;

      insert into public.registry_items (
        registry_id,
        product_id,
        product_name_snapshot,
        product_image_snapshot,
        product_description_snapshot,
        requested_quantity,
        purchased_quantity,
        funded_amount,
        unit_price_snapshot,
        note
      )
      values (
        registry_item_record.registry_id,
        registry_item_record.product_id,
        coalesce(registry_item_record.product_name_snapshot, new.name),
        coalesce(registry_item_record.product_image_snapshot, new.image),
        coalesce(registry_item_record.product_description_snapshot, new.description),
        remaining_quantity,
        0,
        partial_funded_amount,
        next_unit_price,
        registry_item_record.note
      );
    end if;
  end loop;

  return new;
end;
$$;


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
  if nullif(btrim(p_promo_code),'') is not null and exists(select 1 from public.registries where id=p_registry_id and product_promo_code is not null) then raise exception 'Only one promo code can apply to a registry.'; end if;
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
