drop policy if exists "Users can create own registries" on public.registries;
create policy "Users can create own registries" on public.registries
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.user_profiles
      where id = auth.uid()
        and deleted_at is null
        and coalesce(account_status, 'active') = 'active'
    )
  );

drop policy if exists "Users can update own registries" on public.registries;
create policy "Users can update own registries" on public.registries
  for update using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.user_profiles
      where id = auth.uid()
        and deleted_at is null
        and coalesce(account_status, 'active') = 'active'
    )
  );

drop policy if exists "Users can delete own registries" on public.registries;
create policy "Users can delete own registries" on public.registries
  for delete using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.user_profiles
      where id = auth.uid()
        and deleted_at is null
        and coalesce(account_status, 'active') = 'active'
    )
  );

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
  v_profile public.user_profiles%rowtype;
  v_customer_name text;
  v_customer_email text;
  v_customer_phone text;
  v_shipping_name text;
  v_shipping_phone text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to create an order.';
  end if;

  select *
  into v_profile
  from public.user_profiles
  where id = auth.uid();

  if v_profile.id is null
    or v_profile.deleted_at is not null
    or coalesce(v_profile.account_status, 'active') <> 'active' then
    raise exception 'Your account is not available for checkout.';
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

  if not exists (
    select 1
    from public.shipping_tiers
    where code = btrim(p_shipping_tier)
      and is_active = true
  ) then
    raise exception 'Selected shipping tier is not available.';
  end if;

  v_shipping_name := nullif(btrim(coalesce(p_shipping_address->>'name', '')), '');
  v_shipping_phone := nullif(btrim(coalesce(p_shipping_address->>'phone', '')), '');

  v_customer_name := coalesce(
    nullif(btrim(v_profile.full_name), ''),
    v_shipping_name,
    'Customer'
  );
  v_customer_email := coalesce(nullif(btrim(v_profile.email), ''), '');
  v_customer_phone := coalesce(
    nullif(btrim(v_profile.phone), ''),
    v_shipping_phone
  );

  if v_customer_phone is null then
    raise exception 'Phone number is required to complete checkout.';
  end if;

  update public.user_profiles
  set
    full_name = coalesce(nullif(btrim(full_name), ''), v_shipping_name, v_customer_name),
    phone = coalesce(nullif(btrim(phone), ''), v_customer_phone),
    shipping_address = jsonb_build_object(
      'name', coalesce(v_shipping_name, v_customer_name),
      'phone', v_customer_phone,
      'address', coalesce(nullif(btrim(p_shipping_address->>'address'), ''), ''),
      'city', coalesce(nullif(btrim(p_shipping_address->>'city'), ''), ''),
      'state', coalesce(nullif(btrim(p_shipping_address->>'state'), ''), '')
    )
  where id = auth.uid();

  insert into public.orders (
    user_id,
    total,
    status,
    shipping_address,
    billing_address,
    items,
    payment_reference,
    shipping_tier,
    customer_name,
    customer_email,
    customer_phone
  )
  values (
    auth.uid(),
    round(p_total::numeric, 2),
    'pending',
    p_shipping_address,
    p_billing_address,
    p_items,
    null,
    btrim(p_shipping_tier),
    v_customer_name,
    v_customer_email,
    v_customer_phone
  )
  returning id into v_order_id;

  return v_order_id;
end;
$$;

revoke all on function public.create_store_order(numeric, jsonb, jsonb, jsonb, text) from public;
grant execute on function public.create_store_order(numeric, jsonb, jsonb, jsonb, text) to authenticated, service_role;
