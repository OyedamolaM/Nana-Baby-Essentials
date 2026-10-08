-- Store checkout calls create_store_order directly, so enforce contact details
-- in the database as well as in the checkout form.
create or replace function public.validate_store_checkout_contact()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_phone text := btrim(coalesce(new.shipping_address->>'phone', ''));
  v_email text := btrim(coalesce(new.customer_email, ''));
begin
  if v_phone = '' then
    raise exception 'Phone number is required.';
  end if;
  if v_phone !~ '^[0-9]{11}$' then
    raise exception 'Enter a valid 11-digit phone number.';
  end if;
  if v_email = '' then
    raise exception 'Email is required.';
  end if;
  if length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address.';
  end if;

  -- Record the validated checkout number rather than an older profile number.
  new.customer_phone := v_phone;
  new.customer_email := v_email;
  new.shipping_address := jsonb_set(new.shipping_address, '{phone}', to_jsonb(v_phone));
  return new;
end;
$$;

revoke all on function public.validate_store_checkout_contact() from public;
drop trigger if exists validate_store_checkout_contact on public.orders;
create trigger validate_store_checkout_contact
before insert on public.orders
for each row when (new.payment_method = 'paystack')
execute function public.validate_store_checkout_contact();

notify pgrst, 'reload schema';
