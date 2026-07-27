-- Step 10: variant photos are their own upload, not a pick from the main
-- product gallery. Mark images uploaded specifically for a variant so they
-- never show up in the main product photo carousel/manager.
-- Safe to re-run.

alter table public.product_images
  add column if not exists is_variant_only boolean not null default false;

create index if not exists product_images_is_variant_only_idx
  on public.product_images (product_id, is_variant_only);

notify pgrst, 'reload schema';
