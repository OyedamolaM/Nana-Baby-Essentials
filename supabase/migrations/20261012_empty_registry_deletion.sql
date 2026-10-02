-- Only empty registries may be deleted. Financial history also makes a registry nonempty.
create or replace function public.delete_empty_registry(p_registry_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_has_rows boolean; v_table text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Registry deletion requires admin access.'; end if;
  perform 1 from public.registries where id=p_registry_id for update;
  if not found then raise exception 'Registry not found.'; end if;
  foreach v_table in array array['registry_items','registry_orders','registry_contributions','registry_cash_allocations','registry_delivery_orders','registry_delivery_gifts'] loop
    if to_regclass('public.'||v_table) is not null then
      execute format('select exists(select 1 from public.%I where registry_id=$1)',v_table) into v_has_rows using p_registry_id;
      if v_has_rows then raise exception 'Only empty registries can be deleted.'; end if;
    end if;
  end loop;
  delete from public.registries where id=p_registry_id;
end;
$$;
revoke all on function public.delete_empty_registry(uuid) from public,anon,authenticated;
grant execute on function public.delete_empty_registry(uuid) to service_role;
create or replace function public.delete_unfunded_registry(p_registry_id uuid)
returns void language sql security definer set search_path=public as $$
  select public.delete_empty_registry(p_registry_id);
$$;
revoke all on function public.delete_unfunded_registry(uuid) from public,anon,authenticated;
grant execute on function public.delete_unfunded_registry(uuid) to service_role;
notify pgrst,'reload schema';
