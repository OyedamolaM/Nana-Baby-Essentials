-- Step 12: a variant can now have several of its own photos (to slide
-- through), not just a single image. Photos for a variant are stored as
-- normal product_images rows tagged with variant_id, and still marked
-- is_variant_only so they never leak into the main product gallery.
-- The old single product_variants.image_id column is left in place
-- (unused going forward) so existing data isn't destroyed.
-- Safe to re-run.

alter table public.product_images
  add column if not exists variant_id uuid references public.product_variants(id) on delete cascade;

create index if not exists product_images_variant_id_idx
  on public.product_images (variant_id);

notify pgrst, 'reload schema';
