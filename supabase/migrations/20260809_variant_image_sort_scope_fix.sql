drop index if exists public.product_images_product_sort_order_unique;

create unique index if not exists product_images_gallery_sort_order_unique
  on public.product_images (product_id, sort_order)
  where is_variant_only = false and variant_id is null;

create unique index if not exists product_images_variant_sort_order_unique
  on public.product_images (variant_id, sort_order)
  where variant_id is not null;

notify pgrst, 'reload schema';
