-- Payment notifications are committed atomically with the paid ledger.
-- No historical bulk backfill: recovery explicitly queues its original reference.
create table if not exists public.payment_email_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('store_customer','store_support','registry_giver','registry_owner','delivery_giver','delivery_owner','delivery_receipt')),
  source_id uuid not null,
  payment_reference text not null,
  recipient_email text,
  status text not null default 'pending' check (status in ('pending','processing','accepted','delivered','failed','review','sandbox')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lock_token uuid,
  locked_until timestamptz,
  send_started_at timestamptz,
  uncertain_since timestamptz,
  message_ids text[] not null default '{}',
  last_error text,
  delivery_event text,
  delivery_event_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(kind,payment_reference)
);
create index if not exists payment_email_outbox_due on public.payment_email_outbox(next_attempt_at) where status in ('pending','processing');
alter table public.payment_email_outbox enable row level security;
revoke all on public.payment_email_outbox from public,anon,authenticated;
grant all on public.payment_email_outbox to service_role;

create or replace function public.enqueue_payment_emails(p_reference text)
returns void language plpgsql security definer set search_path=public as $$
declare v record; v_owner text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service role required.'; end if;
  if coalesce(btrim(p_reference),'')='' then return; end if;
  for v in select o.id, coalesce(nullif(btrim(o.customer_email),''),p.email,u.email) as email
    from public.orders o left join public.user_profiles p on p.id=o.user_id left join auth.users u on u.id=o.user_id
    where o.status='paid' and coalesce(o.payment_reference,'order:'||o.id::text)=p_reference
  loop
    insert into public.payment_email_outbox(kind,source_id,payment_reference,recipient_email)
    values ('store_customer',v.id,p_reference,v.email),('store_support',v.id,p_reference,null)
    on conflict(kind,payment_reference) do nothing;
  end loop;
  for v in
    select registry_id as id,buyer_email as email from public.registry_orders where status='paid' and paystack_reference=p_reference
    union
    select registry_id,buyer_email from public.registry_contributions where status='paid' and paystack_reference=p_reference
  loop
    select coalesce(nullif(btrim(p.email),''),u.email) into v_owner from public.registries r
      left join public.user_profiles p on p.id=r.user_id left join auth.users u on u.id=r.user_id where r.id=v.id;
    insert into public.payment_email_outbox(kind,source_id,payment_reference,recipient_email)
    values ('registry_giver',v.id,p_reference,v.email),('registry_owner',v.id,p_reference,v_owner)
    on conflict(kind,payment_reference) do nothing;
  end loop;
  for v in select registry_id as id,buyer_email as email from public.registry_delivery_gifts where status='paid' and payment_reference=p_reference
  loop
    select coalesce(nullif(btrim(p.email),''),u.email) into v_owner from public.registries r
      left join public.user_profiles p on p.id=r.user_id left join auth.users u on u.id=r.user_id where r.id=v.id;
    insert into public.payment_email_outbox(kind,source_id,payment_reference,recipient_email)
    values ('delivery_giver',v.id,p_reference,v.email),('delivery_owner',v.id,p_reference,v_owner)
    on conflict(kind,payment_reference) do nothing;
  end loop;
  for v in select d.id,coalesce(nullif(btrim(p.email),''),u.email) as email
    from public.registry_delivery_orders d left join public.user_profiles p on p.id=d.user_id left join auth.users u on u.id=d.user_id
    where d.status='paid' and d.payment_reference=p_reference
  loop
    insert into public.payment_email_outbox(kind,source_id,payment_reference,recipient_email)
    values ('delivery_receipt',v.id,p_reference,v.email) on conflict(kind,payment_reference) do nothing;
  end loop;
end; $$;

create or replace function public.queue_paid_payment_emails()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_reference text;
begin
  -- Ordinary edits to an old paid order must not generate historical receipts.
  if tg_op='UPDATE' and old.status='paid' then return new; end if;
  -- Called only for paid rows. Reading the ledger includes mixed item/cash gifts.
  if tg_table_name in ('registry_orders','registry_contributions') then v_reference:=new.paystack_reference;
  elsif tg_table_name='orders' then v_reference:=coalesce(new.payment_reference,'order:'||new.id::text);
  else v_reference:=new.payment_reference; end if;
  perform public.enqueue_payment_emails(v_reference);
  return new;
end; $$;

do $$ declare t text; begin
  foreach t in array array['orders','registry_orders','registry_contributions','registry_delivery_gifts','registry_delivery_orders'] loop
    execute format('drop trigger if exists queue_paid_payment_emails on public.%I',t);
    execute format('create trigger queue_paid_payment_emails after insert or update on public.%I for each row when (new.status = ''paid'') execute function public.queue_paid_payment_emails()',t);
  end loop;
end; $$;

create or replace function public.claim_payment_email(p_reference text default null)
returns setof public.payment_email_outbox language plpgsql security definer set search_path=public as $$
declare v public.payment_email_outbox%rowtype;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service role required.'; end if;
  loop
  select * into v from public.payment_email_outbox
    where (p_reference is null or payment_reference=p_reference) and
    ((status='pending' and next_attempt_at<=now()) or (status='processing' and locked_until<now()))
    order by next_attempt_at,id for update skip locked limit 1;
  if not found then return; end if;
  if v.delivery_event='delivered' or v.delivery_event in ('hard_bounce','blocked','invalid_email','error','spam') then
    update public.payment_email_outbox set status=case when v.delivery_event='delivered' then 'delivered' else 'failed' end,
      lock_token=null,locked_until=null where id=v.id;
    continue;
  end if;
  -- An interrupted HTTP send may already have been accepted. Only retry inside
  -- Brevo's 30-minute idempotency window; beyond it require review, not a resend.
  if v.status='processing' then v.uncertain_since:=coalesce(v.uncertain_since,v.send_started_at); end if;
  if v.uncertain_since is not null and v.uncertain_since < now()-interval '25 minutes' then
    update public.payment_email_outbox set status='review',last_error='Email acceptance is uncertain; check Brevo before resending.',lock_token=null,locked_until=null where id=v.id;
    continue;
  end if;
  exit;
  end loop;
  update public.payment_email_outbox set status='processing',attempts=attempts+1,
    lock_token=gen_random_uuid(),locked_until=now()+interval '2 minutes',send_started_at=null,uncertain_since=v.uncertain_since
    where id=v.id returning * into v;
  return next v;
end; $$;

create or replace function public.start_payment_email_send(p_id uuid,p_token uuid,p_recipient text)
returns timestamptz language plpgsql security definer set search_path=public as $$
declare v_started timestamptz;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service role required.'; end if;
  update public.payment_email_outbox set send_started_at=clock_timestamp(),recipient_email=p_recipient
    where id=p_id and status='processing' and lock_token=p_token and locked_until>now()
    returning send_started_at into v_started;
  if v_started is null then raise exception 'Email lease expired.'; end if;
  return v_started;
end; $$;

create or replace function public.record_payment_email_event(p_id uuid,p_message_id text,p_recipient text,p_event text,p_event_at timestamptz)
returns void language plpgsql security definer set search_path=public as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service role required.'; end if;
  if p_event not in ('delivered','hard_bounce','soft_bounce','blocked','invalid_email','error','spam','deferred') or p_event_at is null then return; end if;
  update public.payment_email_outbox o set delivery_event=p_event,delivery_event_at=p_event_at,
    status=case when status='processing' then status when p_event='delivered' then 'delivered'
      when p_event in ('hard_bounce','blocked','invalid_email','error','spam') then 'failed' else status end,
    uncertain_since=case when p_event='delivered' then null else uncertain_since end
  where ((p_id is not null and o.id=p_id) or (p_id is null and exists(select 1 from unnest(o.message_ids) m where btrim(m,'<>')=btrim(p_message_id,'<>'))))
    and lower(o.recipient_email)=lower(p_recipient)
    and (delivery_event_at is null or p_event_at>=delivery_event_at)
    -- A deferred event must not erase an established delivery or rejection.
    and (delivery_event is null or delivery_event not in ('delivered','hard_bounce','blocked','invalid_email','error','spam')
      or p_event in ('delivered','hard_bounce','blocked','invalid_email','error','spam'));
end; $$;

create or replace function public.finish_payment_email(p_id uuid,p_token uuid,p_status text,p_message_ids text[] default '{}',p_error text default null,p_uncertain_since timestamptz default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service role required.'; end if;
  if p_status not in ('pending','accepted','failed','sandbox') then raise exception 'Invalid email status.'; end if;
  update public.payment_email_outbox set status=case when delivery_event='delivered' then 'delivered'
      when delivery_event in ('hard_bounce','blocked','invalid_email','error','spam') then 'failed'
      when p_status='pending' and attempts>=8 and p_uncertain_since is null then 'failed' else p_status end,
    message_ids=case when cardinality(p_message_ids)>0 then p_message_ids else message_ids end,
    last_error=left(p_error,1000),uncertain_since=p_uncertain_since,
    accepted_at=case when p_status='accepted' then now() else accepted_at end,
    next_attempt_at=now()+least(3600,60*power(2,least(attempts-1,6))) * interval '1 second',
    lock_token=null,locked_until=null where id=p_id and lock_token=p_token and status='processing';
  if not found then raise exception 'Email lease no longer owned.'; end if;
end; $$;

revoke all on function public.enqueue_payment_emails(text),public.queue_paid_payment_emails(),public.claim_payment_email(text),public.start_payment_email_send(uuid,uuid,text),public.finish_payment_email(uuid,uuid,text,text[],text,timestamptz),public.record_payment_email_event(uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.enqueue_payment_emails(text),public.claim_payment_email(text),public.start_payment_email_send(uuid,uuid,text),public.finish_payment_email(uuid,uuid,text,text[],text,timestamptz),public.record_payment_email_event(uuid,text,text,text,timestamptz) to service_role;
notify pgrst,'reload schema';
