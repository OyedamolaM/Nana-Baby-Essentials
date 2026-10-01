-- Optional minimum products subtotal for percentage promo codes (in naira).
-- Apply after 20261003_promos_and_package_purchase_limits.sql.
alter table public.store_promos
  add column if not exists minimum_purchase_amount numeric(14,2) not null default 0
  check (minimum_purchase_amount >= 0 and minimum_purchase_amount::text not in ('NaN', 'Infinity', '-Infinity'));

create or replace function public.get_store_promo_discount(p_code text, p_subtotal numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_promo public.store_promos%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in to use a promo code.'; end if;
  if p_subtotal is null or p_subtotal < 0 or p_subtotal::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Invalid subtotal.';
  end if;
  select * into v_promo from public.store_promos
  where code = upper(btrim(p_code)) and is_active = true
    and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now());
  if not found then raise exception 'This promo code is invalid, inactive, or outside its valid dates.'; end if;
  if p_subtotal < v_promo.minimum_purchase_amount then
    raise exception 'This promo code requires at least NGN % worth of products, excluding delivery.',
      to_char(v_promo.minimum_purchase_amount, 'FM999,999,999,999,990.00');
  end if;
  return jsonb_build_object(
    'code', v_promo.code,
    'percentage', v_promo.percentage,
    'minimum_purchase_amount', v_promo.minimum_purchase_amount,
    'discount_amount', round(p_subtotal * v_promo.percentage / 100, 2)
  );
end;
$$;
revoke all on function public.get_store_promo_discount(text,numeric) from public;
grant execute on function public.get_store_promo_discount(text,numeric) to authenticated;
notify pgrst, 'reload schema';
