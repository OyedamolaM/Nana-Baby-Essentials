drop function public.create_registry_checkout(
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  numeric,
  text
);

alter function public.create_registry_checkout_internal_20260805(
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  numeric,
  text
)
  rename to create_registry_checkout;

revoke all on function public.create_registry_checkout(
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  numeric,
  text
)
  from public;
grant execute on function public.create_registry_checkout(
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  numeric,
  text
)
  to service_role;

update public.user_profiles
set shipping_address = '{}'::jsonb
where shipping_address is null;

alter table public.user_profiles
  alter column shipping_address set default '{}'::jsonb,
  alter column shipping_address set not null;
