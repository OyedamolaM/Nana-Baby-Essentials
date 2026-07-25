-- Step 6: keep products.image synchronized with each gallery's primary thumbnail.
-- Safe to apply more than once after 20260725_product_gallery_variants.sql.

create or replace function public.ensure_product_image_primary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_primary then
    update public.product_images
    set is_primary = false
    where product_id = new.product_id
      and id is distinct from new.id
      and is_primary;
  end if;

  return new;
end;
$$;

create or replace function public.sync_product_primary_thumbnail(target_product_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  primary_image public.product_images%rowtype;
  next_image_id uuid;
  next_thumbnail_url text;
begin
  if target_product_id is null then
    return;
  end if;

  select *
  into primary_image
  from public.product_images
  where product_id = target_product_id
    and is_primary
  order by sort_order asc, created_at asc, id asc
  limit 1;

  if not found then
    select id
    into next_image_id
    from public.product_images
    where product_id = target_product_id
    order by sort_order asc, created_at asc, id asc
    limit 1;

    if found then
      update public.product_images
      set is_primary = true
      where id = next_image_id;

      select *
      into primary_image
      from public.product_images
      where id = next_image_id;
    end if;
  end if;

  next_thumbnail_url := coalesce(
    nullif(btrim(primary_image.thumbnail_url), ''),
    nullif(btrim(primary_image.url), '')
  );

  update public.products
  set image = next_thumbnail_url
  where id = target_product_id
    and image is distinct from next_thumbnail_url;
end;
$$;

create or replace function public.handle_product_image_primary_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Updates issued by the synchronization function itself do not need another
  -- pass and would otherwise create noisy nested trigger work.
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.sync_product_primary_thumbnail(old.product_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.product_id is distinct from new.product_id then
    perform public.sync_product_primary_thumbnail(old.product_id);
  end if;

  perform public.sync_product_primary_thumbnail(new.product_id);
  return new;
end;
$$;

revoke all on function public.ensure_product_image_primary() from public;
revoke all on function public.sync_product_primary_thumbnail(bigint) from public;
revoke all on function public.handle_product_image_primary_change() from public;

drop trigger if exists product_images_ensure_one_primary on public.product_images;
create trigger product_images_ensure_one_primary
  before insert or update of product_id, is_primary
  on public.product_images
  for each row
  execute function public.ensure_product_image_primary();

drop trigger if exists product_images_sync_after_insert on public.product_images;
create trigger product_images_sync_after_insert
  after insert
  on public.product_images
  for each row
  execute function public.handle_product_image_primary_change();

drop trigger if exists product_images_sync_after_update on public.product_images;
create trigger product_images_sync_after_update
  after update of product_id, is_primary, sort_order, url, thumbnail_url
  on public.product_images
  for each row
  execute function public.handle_product_image_primary_change();

drop trigger if exists product_images_sync_after_delete on public.product_images;
create trigger product_images_sync_after_delete
  after delete
  on public.product_images
  for each row
  execute function public.handle_product_image_primary_change();
