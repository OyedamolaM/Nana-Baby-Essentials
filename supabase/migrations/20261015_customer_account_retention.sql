-- Remove login credentials after three months; retain all historical identities.
alter table public.user_profiles add column if not exists permanently_deleted_at timestamptz;

-- Existing access tokens must not retain access after an account is disabled.
create or replace function public.customer_account_is_active()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_profiles where id = auth.uid()
    and account_status = 'active' and deleted_at is null and permanently_deleted_at is null);
$$;
revoke all on function public.customer_account_is_active() from public, anon;
grant execute on function public.customer_account_is_active() to authenticated;
do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname = 'public'
    and tablename <> 'user_profiles'
  loop
    execute format('drop policy if exists active_customer_account on public.%I',r.tablename);
    execute format('create policy active_customer_account on public.%I as restrictive for all to authenticated using (public.customer_account_is_active()) with check (public.customer_account_is_active())',r.tablename);
  end loop;
end $$;

-- History belongs to the retained profile, not the disposable auth account.
do $$
declare r record; v_columns text;
begin
  for r in select c.*, n.nspname, t.relname from pg_constraint c
    join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and n.nspname = 'public'
  loop
    select string_agg(quote_ident(a.attname), ', ' order by k.ordinality) into v_columns
    from unnest(r.conkey) with ordinality k(attnum, ordinality)
    join pg_attribute a on a.attrelid = r.conrelid and a.attnum = k.attnum;
    execute format('alter table %I.%I drop constraint %I', r.nspname, r.relname, r.conname);
    if r.relname <> 'user_profiles' then
      execute format('alter table %I.%I add constraint %I foreign key (%s) references public.user_profiles(id) on delete restrict not valid', r.nspname, r.relname, r.conname, v_columns);
    end if;
  end loop;
end $$;

create table if not exists public.customer_account_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.user_profiles(id) on delete restrict,
  actor_id uuid,
  action text not null check (action in ('delete','disable','restore','purge')),
  created_at timestamptz not null default now()
);
alter table public.customer_account_events enable row level security;
revoke all on public.customer_account_events from public, anon, authenticated;
grant select on public.customer_account_events to service_role;

create or replace function public.guard_customer_account_retention()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Customer history must be retained.'; end if;
  if current_user in ('authenticated','anon') and (
    new.account_status is distinct from old.account_status or
    new.deleted_at is distinct from old.deleted_at or
    new.permanently_deleted_at is distinct from old.permanently_deleted_at or
    new.is_admin is distinct from old.is_admin
  ) then raise exception 'Account access can only be changed by an administrator.'; end if;
  return new;
end $$;
drop trigger if exists customer_account_retention on public.user_profiles;
create trigger customer_account_retention before update or delete on public.user_profiles
for each row execute function public.guard_customer_account_retention();

create or replace function public.change_customer_account(p_customer_id uuid, p_action text, p_actor_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_profile public.user_profiles%rowtype;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Admin access required.'; end if;
  if p_action not in ('delete','disable','restore') or p_action is null then raise exception 'Invalid account action.'; end if;
  select * into v_profile from public.user_profiles where id = p_customer_id for update;
  if not found then raise exception 'Customer not found.'; end if;
  if v_profile.is_admin then raise exception 'Use staff management for administrator accounts.'; end if;
  if v_profile.permanently_deleted_at is not null then raise exception 'This login was permanently deleted.'; end if;
  if p_action = 'restore' and v_profile.deleted_at <= now() - interval '3 months' then
    raise exception 'The restoration period has ended.';
  end if;
  update public.user_profiles set account_status = case when p_action = 'restore' then 'active' else 'disabled' end,
    deleted_at = case when p_action = 'delete' then coalesce(deleted_at,now()) when p_action = 'restore' then null else deleted_at end
    where id = p_customer_id;
  update auth.users set banned_until = case when p_action = 'restore' then null else 'infinity'::timestamptz end where id = p_customer_id;
  if p_action <> 'restore' then delete from auth.sessions where user_id = p_customer_id; end if;
  insert into public.customer_account_events(customer_id,actor_id,action) values (p_customer_id,p_actor_id,p_action);
end $$;
revoke all on function public.change_customer_account(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.change_customer_account(uuid,text,uuid) to service_role;

create or replace function public.delete_user()
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid := auth.uid();
begin
  if v_id is null then raise exception 'Sign in to delete your account.'; end if;
  perform 1 from public.user_profiles where id = v_id and not coalesce(is_admin,false) and account_status = 'active' and deleted_at is null for update;
  if not found then raise exception 'Account is unavailable.'; end if;
  update public.user_profiles set account_status = 'disabled', deleted_at = now() where id = v_id;
  update auth.users set banned_until = 'infinity'::timestamptz where id = v_id;
  delete from auth.sessions where user_id = v_id;
  insert into public.customer_account_events(customer_id,actor_id,action) values (v_id,v_id,'delete');
end $$;
revoke all on function public.delete_user() from public, anon;
grant execute on function public.delete_user() to authenticated;

create or replace function public.purge_deleted_customer_logins()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; v_count integer := 0;
begin
  for r in select id from public.user_profiles where deleted_at <= now() - interval '3 months'
    and permanently_deleted_at is null and not coalesce(is_admin,false) for update skip locked
  loop
    delete from auth.users where id = r.id;
    update public.user_profiles set permanently_deleted_at = now(), account_status = 'disabled' where id = r.id;
    insert into public.customer_account_events(customer_id,action) values (r.id,'purge');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.purge_deleted_customer_logins() from public, anon, authenticated;
grant execute on function public.purge_deleted_customer_logins() to service_role;

-- Supabase Cron must be enabled. Re-running updates the same named job.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('purge-deleted-customer-logins','17 2 * * *','select public.purge_deleted_customer_logins();');
  else
    raise notice 'Enable Supabase Cron and re-run this migration to schedule account purging.';
  end if;
end $$;
notify pgrst, 'reload schema';
