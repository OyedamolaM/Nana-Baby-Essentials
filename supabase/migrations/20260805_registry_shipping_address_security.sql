alter function public.create_registry_checkout(uuid, text, text, text, text, jsonb, numeric, text)
  rename to create_registry_checkout_internal_20260805;

revoke all on function public.create_registry_checkout_internal_20260805(uuid, text, text, text, text, jsonb, numeric, text)
  from public;
grant execute on function public.create_registry_checkout_internal_20260805(uuid, text, text, text, text, jsonb, numeric, text)
  to service_role;

create function public.create_registry_checkout(
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
  v_owner_shipping_address jsonb;
begin
  select profile.shipping_address
  into v_owner_shipping_address
  from public.registries registry
  join public.user_profiles profile
    on profile.id = registry.user_id
  where registry.id = p_registry_id;

  if coalesce(jsonb_typeof(v_owner_shipping_address), 'null') <> 'object'
    or coalesce(btrim(v_owner_shipping_address->>'name'), '') = ''
    or coalesce(btrim(v_owner_shipping_address->>'phone'), '') = ''
    or coalesce(btrim(v_owner_shipping_address->>'address'), '') = ''
    or coalesce(btrim(v_owner_shipping_address->>'city'), '') = ''
    or coalesce(btrim(v_owner_shipping_address->>'state'), '') = ''
  then
    raise exception 'This registry cannot accept gifts until the owner saves a complete shipping address.';
  end if;

  return public.create_registry_checkout_internal_20260805(
    p_registry_id,
    p_buyer_name,
    p_buyer_email,
    p_buyer_phone,
    p_buyer_message,
    p_selected_items,
    p_cash_amount,
    p_paystack_reference
  );
end;
$$;

revoke all on function public.create_registry_checkout(uuid, text, text, text, text, jsonb, numeric, text)
  from public;
grant execute on function public.create_registry_checkout(uuid, text, text, text, text, jsonb, numeric, text)
  to service_role;
