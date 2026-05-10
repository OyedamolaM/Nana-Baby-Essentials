alter table public.user_profiles
  add column if not exists account_status text not null default 'active'
    check (account_status in ('active', 'disabled')),
  add column if not exists deleted_at timestamptz;

update public.user_profiles
set account_status = 'active'
where account_status is null;

create index if not exists idx_user_profiles_account_status
  on public.user_profiles (account_status, deleted_at, created_at desc);

alter table public.products
  add column if not exists slug text,
  add column if not exists is_featured boolean not null default false,
  add column if not exists featured_sort_order integer not null default 0;

with normalized as (
  select
    id,
    trim(both '-' from regexp_replace(lower(coalesce(name, '')), '[^a-z0-9]+', '-', 'g')) as base_slug
  from public.products
),
resolved as (
  select
    id,
    case
      when coalesce(base_slug, '') = '' then 'product-' || id::text
      when row_number() over (partition by base_slug order by id) = 1 then base_slug
      else base_slug || '-' || id::text
    end as next_slug
  from normalized
)
update public.products product
set slug = resolved.next_slug
from resolved
where product.id = resolved.id
  and (product.slug is null or btrim(product.slug) = '');

update public.products product
set is_featured = true
where exists (
  select 1
  from public.collection_products collection_product
  where collection_product.product_id = product.id
);

create unique index if not exists idx_products_slug_unique
  on public.products (slug);

create index if not exists idx_products_featured_category
  on public.products (is_featured, featured_sort_order, category, created_at desc);

create table if not exists public.shipping_tiers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  fee numeric(10, 2) not null check (fee >= 0),
  eta text,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shipping_tiers enable row level security;

drop policy if exists "Shipping tiers are viewable by everyone" on public.shipping_tiers;
create policy "Shipping tiers are viewable by everyone" on public.shipping_tiers
  for select using (true);

drop policy if exists "Admins can insert shipping tiers" on public.shipping_tiers;
create policy "Admins can insert shipping tiers" on public.shipping_tiers
  for insert with check (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid()
        and is_admin = true
        and coalesce(account_status, 'active') = 'active'
        and deleted_at is null
    )
  );

drop policy if exists "Admins can update shipping tiers" on public.shipping_tiers;
create policy "Admins can update shipping tiers" on public.shipping_tiers
  for update using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid()
        and is_admin = true
        and coalesce(account_status, 'active') = 'active'
        and deleted_at is null
    )
  );

drop policy if exists "Admins can delete shipping tiers" on public.shipping_tiers;
create policy "Admins can delete shipping tiers" on public.shipping_tiers
  for delete using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid()
        and is_admin = true
        and coalesce(account_status, 'active') = 'active'
        and deleted_at is null
    )
  );

insert into public.shipping_tiers (code, label, fee, eta, description, sort_order)
values
  ('lagos', 'Lagos', 2000, '2-3 days', 'Fast delivery within Lagos.', 0),
  ('southwest', 'South West', 3500, '3-5 days', 'Delivery across South West states.', 1),
  ('southeast', 'South East', 4000, '4-6 days', 'Delivery across South East states.', 2),
  ('southsouth', 'South South', 4000, '4-6 days', 'Delivery across South South states.', 3),
  ('northcentral', 'North Central', 4500, '4-6 days', 'Delivery across North Central states.', 4),
  ('northeast', 'North East', 5000, '5-7 days', 'Delivery across North East states.', 5),
  ('northwest', 'North West', 5000, '5-7 days', 'Delivery across North West states.', 6)
on conflict (code) do update
set
  label = excluded.label,
  fee = excluded.fee,
  eta = excluded.eta,
  description = excluded.description,
  sort_order = excluded.sort_order;

alter table public.orders
  add column if not exists customer_name text,
  add column if not exists customer_email text,
  add column if not exists customer_phone text;

update public.orders "order"
set
  customer_name = coalesce("order".customer_name, "order".shipping_address->>'name'),
  customer_email = coalesce("order".customer_email, profile.email),
  customer_phone = coalesce("order".customer_phone, "order".shipping_address->>'phone', profile.phone)
from public.user_profiles profile
where profile.id = "order".user_id;

alter table public.registry_orders
  add column if not exists shipping_address jsonb;

update public.registry_orders registry_order
set shipping_address = profile.shipping_address
from public.registries registry
join public.user_profiles profile
  on profile.id = registry.user_id
where registry.id = registry_order.registry_id
  and registry_order.shipping_address is null;

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
        and coalesce(btrim(phone), '') <> ''
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
        and coalesce(btrim(phone), '') <> ''
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
        and coalesce(btrim(phone), '') <> ''
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

  if coalesce(btrim(v_profile.phone), '') = '' then
    raise exception 'Add your phone number before checkout.';
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

  v_customer_name := coalesce(
    nullif(btrim(v_profile.full_name), ''),
    nullif(btrim(p_shipping_address->>'name'), ''),
    'Customer'
  );
  v_customer_email := coalesce(nullif(btrim(v_profile.email), ''), '');
  v_customer_phone := coalesce(
    nullif(btrim(v_profile.phone), ''),
    nullif(btrim(p_shipping_address->>'phone'), '')
  );

  update public.user_profiles
  set
    full_name = coalesce(nullif(btrim(full_name), ''), nullif(btrim(p_shipping_address->>'name'), ''), v_customer_name),
    phone = coalesce(nullif(btrim(phone), ''), nullif(btrim(p_shipping_address->>'phone'), ''), v_customer_phone),
    shipping_address = jsonb_build_object(
      'name', coalesce(nullif(btrim(p_shipping_address->>'name'), ''), v_customer_name),
      'phone', coalesce(nullif(btrim(p_shipping_address->>'phone'), ''), v_customer_phone),
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

drop function if exists public.rebuild_registry_item_funding(uuid);

create or replace function public.rebuild_registry_item_funding(
  p_registry_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.registry_items registry_item
  set
    funded_amount = coalesce((
      select least(
        round(
          greatest(registry_item.requested_quantity, 0)::numeric *
          coalesce(registry_item.unit_price_snapshot, 0)::numeric * 1000,
          2
        ),
        coalesce(sum(order_item.amount), 0)::numeric(10, 2)
      )
      from public.registry_order_items order_item
      join public.registry_orders registry_order
        on registry_order.id = order_item.registry_order_id
      where order_item.registry_item_id = registry_item.id
        and registry_order.status = 'paid'
    ), 0),
    purchased_quantity = public.calculate_registry_item_purchased_quantity(
      registry_item.requested_quantity,
      coalesce(registry_item.unit_price_snapshot, 0),
      coalesce((
        select least(
          round(
            greatest(registry_item.requested_quantity, 0)::numeric *
            coalesce(registry_item.unit_price_snapshot, 0)::numeric * 1000,
            2
          ),
          coalesce(sum(order_item.amount), 0)::numeric(10, 2)
        )
        from public.registry_order_items order_item
        join public.registry_orders registry_order
          on registry_order.id = order_item.registry_order_id
        where order_item.registry_item_id = registry_item.id
          and registry_order.status = 'paid'
      ), 0)
    )
  where registry_item.registry_id = p_registry_id;
end;
$$;

grant execute on function public.rebuild_registry_item_funding(uuid)
  to authenticated, service_role;

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
