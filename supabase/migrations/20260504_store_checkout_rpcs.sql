drop function if exists public.create_store_order(numeric, jsonb, jsonb, jsonb, text);

create or replace function public.create_store_order(
  p_total numeric,
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
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to create an order.';
  end if;

  if p_total is null or p_total <= 0 then
    raise exception 'Order total must be greater than zero.';
  end if;

  if coalesce(jsonb_typeof(p_shipping_address), 'null') <> 'object' then
    raise exception 'Shipping address is required.';
  end if;

  if coalesce(jsonb_typeof(p_billing_address), 'null') <> 'object' then
    raise exception 'Billing address is required.';
  end if;

  if coalesce(jsonb_typeof(p_items), 'null') <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception 'Order items are required.';
  end if;

  if coalesce(btrim(p_shipping_tier), '') = '' then
    raise exception 'Shipping tier is required.';
  end if;

  insert into public.orders (
    user_id,
    total,
    status,
    shipping_address,
    billing_address,
    items,
    shipping_tier
  )
  values (
    auth.uid(),
    p_total,
    'awaiting_payment',
    p_shipping_address,
    p_billing_address,
    p_items,
    p_shipping_tier
  )
  returning id into v_order_id;

  return v_order_id;
end;
$$;

drop function if exists public.complete_store_order_payment(uuid, text);

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
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to complete an order payment.';
  end if;

  if coalesce(btrim(p_paystack_reference), '') = '' then
    raise exception 'Paystack reference is required.';
  end if;

  select status, payment_reference, user_id
  into v_status, v_existing_reference, v_user_id
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_user_id <> auth.uid() then
    raise exception 'You do not have access to this order.';
  end if;

  if v_status = 'paid' then
    if v_existing_reference is not null
      and v_existing_reference <> p_paystack_reference then
      raise exception 'Order is already marked as paid with a different payment reference.';
    end if;

    return p_order_id;
  end if;

  if v_status <> 'awaiting_payment' then
    raise exception 'Order can no longer be completed.';
  end if;

  update public.orders
  set
    status = 'paid',
    payment_reference = p_paystack_reference
  where id = p_order_id;

  return p_order_id;
end;
$$;

drop function if exists public.cancel_store_order(uuid);

create or replace function public.cancel_store_order(
  p_order_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to cancel an order.';
  end if;

  select status, user_id
  into v_status, v_user_id
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return p_order_id;
  end if;

  if v_user_id <> auth.uid() then
    raise exception 'You do not have access to this order.';
  end if;

  if v_status = 'awaiting_payment' then
    update public.orders
    set status = 'cancelled'
    where id = p_order_id;
  end if;

  return p_order_id;
end;
$$;

revoke all on function public.create_store_order(numeric, jsonb, jsonb, jsonb, text) from public;
grant execute on function public.create_store_order(numeric, jsonb, jsonb, jsonb, text) to authenticated, service_role;

revoke all on function public.complete_store_order_payment(uuid, text) from public;
grant execute on function public.complete_store_order_payment(uuid, text) to authenticated, service_role;

revoke all on function public.cancel_store_order(uuid) from public;
grant execute on function public.cancel_store_order(uuid) to authenticated, service_role;
