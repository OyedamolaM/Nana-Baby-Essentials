alter table public.registry_items
  add column if not exists product_name_snapshot text,
  add column if not exists product_image_snapshot text,
  add column if not exists product_description_snapshot text;

update public.registry_items registry_item
set
  product_name_snapshot = coalesce(registry_item.product_name_snapshot, product.name),
  product_image_snapshot = coalesce(registry_item.product_image_snapshot, product.image),
  product_description_snapshot = coalesce(
    registry_item.product_description_snapshot,
    product.description
  )
from public.products product
where product.id = registry_item.product_id;

create or replace function public.capture_registry_item_product_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  product_record public.products%rowtype;
begin
  if new.product_id is null then
    return new;
  end if;

  select *
  into product_record
  from public.products
  where id = new.product_id;

  if found then
    new.product_name_snapshot := coalesce(new.product_name_snapshot, product_record.name);
    new.product_image_snapshot := coalesce(new.product_image_snapshot, product_record.image);
    new.product_description_snapshot := coalesce(
      new.product_description_snapshot,
      product_record.description
    );
  end if;

  return new;
end;
$$;

drop trigger if exists capture_registry_item_product_snapshot on public.registry_items;
create trigger capture_registry_item_product_snapshot
before insert or update of product_id on public.registry_items
for each row execute function public.capture_registry_item_product_snapshot();

alter table public.registry_items
  drop constraint if exists registry_items_registry_id_product_id_key;

create or replace function public.reprice_unpaid_registry_item_quantities()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  registry_item_record public.registry_items%rowtype;
  remaining_quantity integer;
  previous_unit_amount numeric(12, 2);
  next_unit_price numeric(12, 4);
  next_unit_amount numeric(12, 2);
  locked_funded_amount numeric(12, 2);
  partial_funded_amount numeric(12, 2);
begin
  next_unit_price := greatest(coalesce(new.selling_price, new.price, 0), 0);
  next_unit_amount := round(next_unit_price * 1000, 2);

  if next_unit_amount <= 0 then
    return new;
  end if;

  for registry_item_record in
    select registry_item.*
    from public.registry_items registry_item
    where registry_item.product_id = new.id
      and registry_item.requested_quantity > registry_item.purchased_quantity
    order by registry_item.created_at, registry_item.id
    for update
  loop
    previous_unit_amount := round(
      greatest(coalesce(registry_item_record.unit_price_snapshot, 0), 0) * 1000,
      2
    );

    if next_unit_amount = previous_unit_amount then
      continue;
    end if;

    remaining_quantity := greatest(
      registry_item_record.requested_quantity - registry_item_record.purchased_quantity,
      0
    );
    locked_funded_amount := least(
      greatest(coalesce(registry_item_record.funded_amount, 0), 0),
      registry_item_record.purchased_quantity::numeric * previous_unit_amount
    );
    partial_funded_amount := greatest(
      coalesce(registry_item_record.funded_amount, 0) - locked_funded_amount,
      0
    );

    if next_unit_amount < previous_unit_amount and partial_funded_amount > 0 then
      continue;
    end if;

    if registry_item_record.purchased_quantity <= 0 then
      update public.registry_items
      set unit_price_snapshot = next_unit_price
      where id = registry_item_record.id;
    else
      update public.registry_items
      set
        requested_quantity = registry_item_record.purchased_quantity,
        funded_amount = locked_funded_amount
      where id = registry_item_record.id;

      insert into public.registry_items (
        registry_id,
        product_id,
        product_name_snapshot,
        product_image_snapshot,
        product_description_snapshot,
        requested_quantity,
        purchased_quantity,
        funded_amount,
        unit_price_snapshot,
        note
      )
      values (
        registry_item_record.registry_id,
        registry_item_record.product_id,
        coalesce(registry_item_record.product_name_snapshot, new.name),
        coalesce(registry_item_record.product_image_snapshot, new.image),
        coalesce(registry_item_record.product_description_snapshot, new.description),
        remaining_quantity,
        0,
        partial_funded_amount,
        next_unit_price,
        registry_item_record.note
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists reprice_unpaid_registry_item_quantities on public.products;
create trigger reprice_unpaid_registry_item_quantities
after update of price, selling_price on public.products
for each row
when (
  coalesce(old.selling_price, old.price, 0)
  is distinct from
  coalesce(new.selling_price, new.price, 0)
)
execute function public.reprice_unpaid_registry_item_quantities();

alter table public.registry_items
  drop constraint if exists registry_items_product_id_fkey;

alter table public.registry_items
  alter column product_id drop not null;

alter table public.registry_items
  add constraint registry_items_product_id_fkey
  foreign key (product_id)
  references public.products(id)
  on delete set null;

alter table public.registry_order_items
  drop constraint if exists registry_order_items_registry_item_id_fkey;

alter table public.registry_order_items
  add constraint registry_order_items_registry_item_id_fkey
  foreign key (registry_item_id)
  references public.registry_items(id)
  on delete set null;
