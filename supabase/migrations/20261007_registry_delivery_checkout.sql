-- Apply after 20261006_registry_gift_balance.sql.
create table if not exists public.registry_delivery_orders (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null references public.registries(id),
  user_id uuid not null references public.user_profiles(id),
  previous_registry_status text not null,
  shipping_tier text not null,
  shipping_label text not null,
  shipping_fee numeric(14,2) not null check(shipping_fee>=0),
  shipping_address jsonb not null,
  items jsonb not null,
  total numeric(14,2) not null check(total>=0),
  promo_code text,
  discount_amount numeric(14,2) not null default 0,
  status text not null default 'awaiting_payment' check(status in ('awaiting_payment','paid','cancelled')),
  payment_reference text not null unique,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists registry_one_active_delivery on public.registry_delivery_orders(registry_id) where status in ('awaiting_payment','paid');
alter table public.registry_delivery_orders enable row level security;
revoke all on public.registry_delivery_orders from public,anon,authenticated;
grant all on public.registry_delivery_orders to service_role;

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

create or replace function public.complete_registry_delivery_payment(p_reference text,p_paid_amount_kobo bigint)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_order public.registry_delivery_orders%rowtype;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Delivery payment must be verified by the server.'; end if;
  perform 1 from public.registries where id=(select registry_id from public.registry_delivery_orders where payment_reference=p_reference) for update;
  select * into v_order from public.registry_delivery_orders where payment_reference=p_reference for update;
  if not found then raise exception 'Delivery payment not found.'; end if;
  if p_paid_amount_kobo is null or p_paid_amount_kobo <> round(v_order.total*100)::bigint then raise exception 'Verified payment does not match this delivery.'; end if;
  if v_order.status='paid' then return v_order.id; end if;
  if v_order.status <> 'awaiting_payment' then raise exception 'Delivery payment is no longer available.'; end if;
  -- Freeze funding before marking the collected products ready for dispatch.
  if exists(select 1 from public.registry_items where registry_id=v_order.registry_id and funded_amount > round(purchased_quantity*unit_price_snapshot*1000,2)) then
    raise exception 'Complete partially funded products before requesting delivery.';
  end if;
  if (select coalesce(sum(amount),0) from public.registry_contributions where registry_id=v_order.registry_id and status='paid') >
    (select coalesce(sum(amount),0) from public.registry_cash_allocations where registry_id=v_order.registry_id) then
    raise exception 'Apply the available gift balance before requesting delivery.';
  end if;
  update public.registry_delivery_orders set status='paid',paid_at=now() where id=v_order.id;
  update public.registries set fulfillment_status='ready_for_shipping',status='closed',ready_for_shipping_at=now(),
    closed_at=now(),closed_note='Ready for delivery',fulfillment_updated_at=now(),fulfillment_updated_by=v_order.user_id
  where id=v_order.registry_id;
  update public.registry_orders set shipping_address=v_order.shipping_address where registry_id=v_order.registry_id and status='paid';
  return v_order.id;
end;
$$;
revoke all on function public.complete_registry_delivery_payment(text,bigint) from public;
grant execute on function public.complete_registry_delivery_payment(text,bigint) to service_role;

create or replace function public.create_registry_delivery_checkout(p_registry_id uuid,p_actor_id uuid,p_shipping_tier text,p_promo_code text,p_reference text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_quote jsonb; v_id uuid; v_existing public.registry_delivery_orders%rowtype;
begin
  perform public.get_registry_cash_balance(p_registry_id,p_actor_id);
  perform 1 from public.registries where id=p_registry_id for update;
  select * into v_existing from public.registry_delivery_orders where registry_id=p_registry_id and status in ('paid','awaiting_payment');
  if found then
    if v_existing.status='paid' then raise exception 'Registry delivery has already been paid.'; end if;
    return jsonb_build_object('id',v_existing.id,'reference',v_existing.payment_reference,'total',v_existing.total,'amountKobo',round(v_existing.total*100)::bigint,'paid',false,
      'shipping_label',v_existing.shipping_label,'shipping_fee',v_existing.shipping_fee,'discount_amount',v_existing.discount_amount);
  end if;
  if coalesce(btrim(p_reference),'')='' then raise exception 'Delivery reference is required.'; end if;
  v_quote := public.get_registry_delivery_quote(p_registry_id,p_actor_id,p_shipping_tier,p_promo_code);
  insert into public.registry_delivery_orders(registry_id,user_id,previous_registry_status,shipping_tier,shipping_label,shipping_fee,shipping_address,items,total,promo_code,discount_amount,payment_reference)
  values(p_registry_id,p_actor_id,(select status from public.registries where id=p_registry_id),v_quote->>'shipping_tier',v_quote->>'shipping_label',(v_quote->>'shipping_fee')::numeric,v_quote->'shipping_address',v_quote->'items',
    (v_quote->>'total')::numeric,v_quote->>'promo_code',(v_quote->>'discount_amount')::numeric,p_reference) returning id into v_id;
  update public.registries set status='closed' where id=p_registry_id;
  if (v_quote->>'total')::numeric=0 then perform public.complete_registry_delivery_payment(p_reference,0); end if;
  return v_quote || jsonb_build_object('id',v_id,'reference',p_reference,'amountKobo',round((v_quote->>'total')::numeric*100)::bigint,'paid',(v_quote->>'total')::numeric=0);
end;
$$;
revoke all on function public.create_registry_delivery_checkout(uuid,uuid,text,text,text) from public;
grant execute on function public.create_registry_delivery_checkout(uuid,uuid,text,text,text) to service_role;

create or replace function public.cancel_registry_delivery_checkout(p_registry_id uuid,p_actor_id uuid,p_reference text)
returns void language plpgsql security definer set search_path=public as $$
declare v_order public.registry_delivery_orders%rowtype;
begin
  perform public.get_registry_cash_balance(p_registry_id,p_actor_id);
  perform 1 from public.registries where id=p_registry_id for update;
  select * into v_order from public.registry_delivery_orders where registry_id=p_registry_id and payment_reference=p_reference for update;
  if not found then raise exception 'Delivery checkout not found.'; end if;
  if v_order.status <> 'awaiting_payment' then return; end if;
  update public.registry_delivery_orders set status='cancelled' where id=v_order.id;
  update public.registries set status=v_order.previous_registry_status where id=p_registry_id;
end;
$$;
revoke all on function public.cancel_registry_delivery_checkout(uuid,uuid,text) from public;
grant execute on function public.cancel_registry_delivery_checkout(uuid,uuid,text) to service_role;

create or replace function public.guard_registry_delivery_funding()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_registry_id uuid;
begin
  if TG_TABLE_NAME='registries' then
    if new.status <> 'closed' and exists(select 1 from public.registry_delivery_orders where registry_id=old.id and status='paid') then
      raise exception 'Registry delivery is already paid; collection is closed.';
    end if;
    if new.status <> 'closed' and exists(select 1 from public.registry_delivery_orders where registry_id=old.id and status in ('awaiting_payment','paid')) then
      raise exception 'Cancel the pending delivery payment before reopening this registry.';
    end if;
    return new;
  end if;
  v_registry_id := case when TG_OP='DELETE' then old.registry_id else new.registry_id end;
  if TG_OP='UPDATE' and new.registry_id is distinct from old.registry_id then raise exception 'Registry products cannot be moved between registries.'; end if;
  if TG_OP <> 'DELETE' and coalesce(new.funded_amount,0) > round(new.requested_quantity*new.unit_price_snapshot*1000,2) then
    raise exception 'The product quantity cannot be reduced below its funded value.';
  end if;
  if exists(select 1 from public.registry_delivery_orders where registry_id=v_registry_id and status in ('awaiting_payment','paid')) then
    raise exception 'Registry products are locked for delivery.';
  end if;
  if coalesce(auth.role(),'') <> 'service_role' then
    if TG_OP='INSERT' and (coalesce(new.funded_amount,0)<>0 or coalesce(new.purchased_quantity,0)<>0) then
      raise exception 'Product funding is managed by the server.';
    end if;
    if TG_OP='UPDATE' and (new.funded_amount is distinct from old.funded_amount or new.purchased_quantity is distinct from old.purchased_quantity or new.unit_price_snapshot is distinct from old.unit_price_snapshot) then
      raise exception 'Product funding is managed by the server.';
    end if;
  end if;
  if TG_OP='DELETE' and old.funded_amount>0 then raise exception 'Funded products cannot be removed.'; end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists registry_delivery_collection_guard on public.registries;
create trigger registry_delivery_collection_guard before update on public.registries for each row execute function public.guard_registry_delivery_funding();
drop trigger if exists registry_delivery_items_guard on public.registry_items;
create trigger registry_delivery_items_guard before insert or update or delete on public.registry_items for each row execute function public.guard_registry_delivery_funding();

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
  if p_context is null or p_context not in ('store','registry','registry_delivery') then raise exception 'Invalid checkout.'; end if;
  if p_subtotal is null or p_subtotal < 0 or p_subtotal::text in ('NaN','Infinity','-Infinity')
    or p_shipping_fee is null or p_shipping_fee < 0 or p_shipping_fee::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Invalid checkout amount.';
  end if;
  select * into v_promo from public.store_promos
  where code = upper(btrim(p_code)) and is_active = true
    and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now());
  if not found then raise exception 'This promo code is invalid, inactive, or outside its valid dates.'; end if;
  if (p_context = 'store' and not v_promo.applies_to_store)
    or (p_context in ('registry','registry_delivery') and not v_promo.applies_to_registry) then
    raise exception 'This promo code is not enabled for this checkout.';
  end if;
  if p_subtotal < v_promo.minimum_purchase_amount then
    raise exception 'This promo code requires at least NGN % worth of products, excluding delivery.',
      to_char(v_promo.minimum_purchase_amount, 'FM999,999,999,999,990.00');
  end if;
  if v_promo.promo_type <> 'products' and (p_context = 'registry' or p_shipping_fee <= 0) then
    raise exception 'This promo code requires a checkout with a delivery fee.';
  end if;
  if p_context='registry_delivery' and v_promo.promo_type='products' then raise exception 'Use a delivery promo for the delivery fee.'; end if;
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


notify pgrst, 'reload schema';
