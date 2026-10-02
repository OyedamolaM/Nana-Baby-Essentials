-- Repair deletion on databases where optional gift-balance tables are absent.
create or replace function public.delete_unfunded_registry(p_registry_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Registry deletion requires admin access.';
  end if;
  perform 1 from public.registries where id = p_registry_id for update;
  if not found then raise exception 'Registry not found.'; end if;
  if to_regclass('public.registry_cash_allocations') is not null then
    execute 'delete from public.registry_cash_allocations where registry_id = $1' using p_registry_id;
  end if;
  if to_regclass('public.registry_delivery_orders') is not null then
    execute 'delete from public.registry_delivery_orders where registry_id = $1' using p_registry_id;
  end if;
  delete from public.registry_order_items where registry_order_id in
    (select id from public.registry_orders where registry_id = p_registry_id);
  delete from public.registry_orders where registry_id = p_registry_id;
  delete from public.registry_contributions where registry_id = p_registry_id;
  -- Clear funding after removing delivery locks, before the item deletion guard.
  update public.registry_items set funded_amount = 0, purchased_quantity = 0
  where registry_id = p_registry_id;
  delete from public.registry_items where registry_id = p_registry_id;
  delete from public.registries where id = p_registry_id;
end;
$$;
revoke all on function public.delete_unfunded_registry(uuid) from public, anon, authenticated;
grant execute on function public.delete_unfunded_registry(uuid) to service_role;
notify pgrst, 'reload schema';
