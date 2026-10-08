-- The admin API verifies the transaction with Paystack before invoking this RPC.
-- Reopen cancelled checkouts inside the same transaction as completion, so a
-- failed amount or balance check leaves the original cancelled status intact.
create or replace function public.recover_registry_checkout_payment(
  p_paystack_reference text,
  p_paid_amount_kobo bigint,
  p_paystack_transaction_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reference text := btrim(coalesce(p_paystack_reference, ''));
  v_registry_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Payment recovery must run through the server.';
  end if;
  if v_reference = '' or coalesce(p_paid_amount_kobo, 0) <= 0
    or coalesce(p_paystack_transaction_id, 0) <= 0 then
    raise exception 'A verified payment reference, amount and transaction id are required.';
  end if;

  select registry_id into v_registry_id from (
    select registry_id from public.registry_orders where paystack_reference = v_reference
    union all
    select registry_id from public.registry_contributions where paystack_reference = v_reference
  ) checkout limit 1;
  if v_registry_id is null then raise exception 'Registry checkout not found.'; end if;

  -- Match the completion function's lock order to serialize concurrent gifts.
  perform 1 from public.registries where id = v_registry_id for update;
  perform 1 from public.registry_orders where paystack_reference = v_reference for update;
  perform 1 from public.registry_contributions where paystack_reference = v_reference for update;

  update public.registry_orders set status = 'awaiting_payment'
  where paystack_reference = v_reference and status = 'cancelled';
  update public.registry_contributions set status = 'awaiting_payment'
  where paystack_reference = v_reference and status = 'cancelled';

  return public.complete_registry_checkout_payment(
    v_reference, p_paid_amount_kobo, p_paystack_transaction_id
  );
end;
$$;

revoke all on function public.recover_registry_checkout_payment(text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.recover_registry_checkout_payment(text, bigint, bigint) to service_role;
notify pgrst, 'reload schema';
