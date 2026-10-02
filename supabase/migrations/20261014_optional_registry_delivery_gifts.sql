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


alter table public.registries add column if not exists delivery_funding_enabled boolean not null default false,
  add column if not exists delivery_funding_tier text,
  add column if not exists delivery_funding_target numeric(14,2) not null default 0 check(delivery_funding_target>=0);
alter table public.registry_delivery_orders add column if not exists funded_amount numeric(14,2) not null default 0;
create table if not exists public.registry_delivery_gifts (
 id uuid primary key default gen_random_uuid(), registry_id uuid not null references public.registries(id),
 buyer_name text not null,buyer_email text not null,buyer_phone text not null,buyer_message text,
 amount numeric(14,2) not null check(amount>0),status text not null default 'awaiting_payment' check(status in ('awaiting_payment','paid','cancelled')),
 payment_reference text not null unique,paid_at timestamptz,created_at timestamptz not null default now());
alter table public.registry_delivery_gifts enable row level security;
revoke all on public.registry_delivery_gifts from public,anon,authenticated;
grant all on public.registry_delivery_gifts to service_role;
create or replace function public.configure_registry_delivery_funding(p_registry_id uuid,p_actor_id uuid,p_enabled boolean,p_tier text)
returns void language plpgsql security definer set search_path=public as $$
declare v_registry public.registries%rowtype;v_fee numeric;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Use the delivery controls.'; end if;
 select * into v_registry from public.registries where id=p_registry_id for update;
 if not found or v_registry.user_id<>p_actor_id then raise exception 'Only the registry owner can change delivery funding.'; end if;
 if v_registry.status='closed' or v_registry.fulfillment_status<>'collecting' then raise exception 'Delivery funding is closed.'; end if;
 if exists(select 1 from public.registry_delivery_gifts where registry_id=p_registry_id and status in ('paid','awaiting_payment')) then raise exception 'Delivery funding is locked because gifting has started.'; end if;
 if p_enabled then
 select fee into v_fee from public.shipping_tiers where code=p_tier and is_active and fulfillment_type='delivery';
 if not found or v_fee<=0 then raise exception 'Choose a delivery area with a delivery fee.'; end if;
 end if;
 update public.registries set delivery_funding_enabled=p_enabled,delivery_funding_tier=case when p_enabled then p_tier else null end,delivery_funding_target=case when p_enabled then v_fee else 0 end where id=p_registry_id;
end;
$$;
create or replace function public.get_registry_delivery_funding(p_registry_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_r public.registries%rowtype;v_paid numeric;v_pending numeric;
begin
 select * into v_r from public.registries where id=p_registry_id;
 if not found then raise exception 'Registry not found.'; end if;
 select coalesce(sum(amount) filter(where status='paid'),0),coalesce(sum(amount) filter(where status='awaiting_payment'),0) into v_paid,v_pending from public.registry_delivery_gifts where registry_id=p_registry_id;
 return jsonb_build_object('enabled',v_r.delivery_funding_enabled,'tier',v_r.delivery_funding_tier,'target',v_r.delivery_funding_target,'funded',v_paid,'remaining',greatest(v_r.delivery_funding_target-v_paid-v_pending,0),'locked',v_paid+v_pending>0,'open',v_r.status<>'closed' and v_r.fulfillment_status='collecting');
end;
$$;
create or replace function public.create_registry_delivery_gift(p_registry_id uuid,p_name text,p_email text,p_phone text,p_message text,p_amount numeric,p_reference text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_info jsonb;v_id uuid;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Use the delivery gift checkout.'; end if;
 perform 1 from public.registries where id=p_registry_id for update;
 v_info:=public.get_registry_delivery_funding(p_registry_id);
 if not (v_info->>'enabled')::boolean or not (v_info->>'open')::boolean then raise exception 'Delivery gifts are not available.'; end if;
 if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<=0 or round(p_amount,2)<>p_amount or p_amount>(v_info->>'remaining')::numeric then raise exception 'Enter an amount within the remaining delivery fee.'; end if;
 if coalesce(btrim(p_name),'')='' or coalesce(btrim(p_email),'')='' or coalesce(btrim(p_phone),'')='' or coalesce(btrim(p_reference),'')='' then raise exception 'Enter your name, email and phone.'; end if;
 insert into public.registry_delivery_gifts(registry_id,buyer_name,buyer_email,buyer_phone,buyer_message,amount,payment_reference) values(p_registry_id,btrim(p_name),btrim(p_email),btrim(p_phone),p_message,p_amount,p_reference) returning id into v_id;
 return jsonb_build_object('id',v_id,'reference',p_reference,'amountKobo',round(p_amount*100)::bigint,'currency','NGN','checkoutType','delivery','metadata',jsonb_build_object('registry_id',p_registry_id,'registry_delivery_gift_id',v_id));
end;
$$;
create or replace function public.complete_registry_delivery_gift(p_reference text,p_paid_amount_kobo bigint)
returns void language plpgsql security definer set search_path=public as $$
declare v_gift public.registry_delivery_gifts%rowtype;v_paid numeric;v_target numeric;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Payment must be verified by the server.'; end if;
 select delivery_funding_target into v_target from public.registries where id=(select registry_id from public.registry_delivery_gifts where payment_reference=p_reference) for update;
 select * into v_gift from public.registry_delivery_gifts where payment_reference=p_reference for update;
 if not found then raise exception 'Delivery gift not found.'; end if;
 if p_paid_amount_kobo is null or p_paid_amount_kobo<>round(v_gift.amount*100)::bigint then raise exception 'Payment does not match the delivery gift.'; end if;
 if v_gift.status='paid' then return; end if;
 select coalesce(sum(amount),0) into v_paid from public.registry_delivery_gifts where registry_id=v_gift.registry_id and status='paid';
 if v_paid+v_gift.amount>v_target then raise exception 'Delivery funding exceeds its target.'; end if;
 update public.registry_delivery_gifts set status='paid',paid_at=now() where id=v_gift.id;
end;
$$;
create or replace function public.cancel_registry_delivery_gift(p_reference text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Use the delivery gift checkout.'; end if;
 perform 1 from public.registries where id=(select registry_id from public.registry_delivery_gifts where payment_reference=p_reference) for update;
 update public.registry_delivery_gifts set status='cancelled' where payment_reference=p_reference and status='awaiting_payment';
end;
$$;
revoke all on function public.configure_registry_delivery_funding(uuid,uuid,boolean,text), public.get_registry_delivery_funding(uuid), public.create_registry_delivery_gift(uuid,text,text,text,text,numeric,text), public.complete_registry_delivery_gift(text,bigint),public.cancel_registry_delivery_gift(text) from public,anon,authenticated;
grant execute on function public.configure_registry_delivery_funding(uuid,uuid,boolean,text), public.get_registry_delivery_funding(uuid), public.create_registry_delivery_gift(uuid,text,text,text,text,numeric,text), public.complete_registry_delivery_gift(text,bigint),public.cancel_registry_delivery_gift(text) to service_role;
create or replace function public.guard_registry_delivery_funding_settings()
returns trigger language plpgsql set search_path=public as $$
begin
 if TG_OP='INSERT' then
  if coalesce(auth.role(),'')<>'service_role' and (new.delivery_funding_enabled or new.delivery_funding_tier is not null or new.delivery_funding_target<>0) then raise exception 'Use the delivery controls.'; end if;
  return new;
 end if;
 if coalesce(auth.role(),'')<>'service_role' and (new.delivery_funding_enabled is distinct from old.delivery_funding_enabled or new.delivery_funding_tier is distinct from old.delivery_funding_tier or new.delivery_funding_target is distinct from old.delivery_funding_target) then raise exception 'Use the delivery controls.'; end if;
 return new;
end;
$$;
drop trigger if exists registry_delivery_funding_settings_guard on public.registries;
create trigger registry_delivery_funding_settings_guard before insert or update on public.registries for each row execute function public.guard_registry_delivery_funding_settings();

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
  v_funded numeric := 0;
begin
  if nullif(btrim(p_promo_code),'') is not null and exists(select 1 from public.registries where id=p_registry_id and product_promo_code is not null) then perform public.assert_store_promos_combinable((select product_promo_code from public.registries where id=p_registry_id)||','||p_promo_code); end if;
  perform public.get_registry_cash_balance(p_registry_id,p_actor_id);
  if exists(select 1 from public.registry_delivery_gifts where registry_id=p_registry_id and status='awaiting_payment') then raise exception 'A delivery gift payment is still pending.'; end if;
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
  if v_registry.delivery_funding_enabled then
    if p_shipping_tier<>v_registry.delivery_funding_tier then raise exception 'Choose the delivery area set for gifting.'; end if;
    v_fee:=v_registry.delivery_funding_target;
  end if;
  select coalesce(sum(amount),0) into v_funded from public.registry_delivery_gifts where registry_id=p_registry_id and status='paid';
  if v_funded>0 and nullif(btrim(p_promo_code),'') is not null then raise exception 'Delivery gifts have started; a delivery promo cannot change the funded fee.'; end if;
  if nullif(btrim(p_promo_code),'') is not null then
    v_promo := public.get_checkout_promo_discount(p_promo_code,v_subtotal,v_fee,'registry_delivery');
    v_discount := (v_promo->>'discount_amount')::numeric;
  end if;
  return jsonb_build_object('shipping_tier',p_shipping_tier,'shipping_label',v_label,'shipping_fee',v_fee,
    'shipping_address',v_address,'items',v_items,'subtotal',v_subtotal,'funded_amount',v_funded,'total',greatest(v_fee-v_discount-v_funded,0),'promo_code',v_promo->>'code','discount_amount',v_discount);
end;
$$;
revoke all on function public.get_registry_delivery_quote(uuid,uuid,text,text) from public;
grant execute on function public.get_registry_delivery_quote(uuid,uuid,text,text) to service_role;


notify pgrst, 'reload schema';

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
  insert into public.registry_delivery_orders(registry_id,user_id,previous_registry_status,shipping_tier,shipping_label,shipping_fee,shipping_address,items,total,promo_code,discount_amount,payment_reference,funded_amount)
  values(p_registry_id,p_actor_id,(select status from public.registries where id=p_registry_id),v_quote->>'shipping_tier',v_quote->>'shipping_label',(v_quote->>'shipping_fee')::numeric,v_quote->'shipping_address',v_quote->'items',
    (v_quote->>'total')::numeric,v_quote->>'promo_code',(v_quote->>'discount_amount')::numeric,p_reference,(v_quote->>'funded_amount')::numeric) returning id into v_id;
  update public.registries set status='closed' where id=p_registry_id;
  if (v_quote->>'total')::numeric=0 then perform public.complete_registry_delivery_payment(p_reference,0); end if;
  return v_quote || jsonb_build_object('id',v_id,'reference',p_reference,'amountKobo',round((v_quote->>'total')::numeric*100)::bigint,'paid',(v_quote->>'total')::numeric=0);
end;
$$;
revoke all on function public.create_registry_delivery_checkout(uuid,uuid,text,text,text) from public;
grant execute on function public.create_registry_delivery_checkout(uuid,uuid,text,text,text) to service_role;


notify pgrst,'reload schema';
