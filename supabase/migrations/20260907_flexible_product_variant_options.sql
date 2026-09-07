-- Flexible option combinations for product variants (Size, Colour, Age, Sex, etc.).
-- Legacy size and color values remain supported while existing products are migrated.
alter table public.product_variants
  add column if not exists options jsonb not null default '{}'::jsonb;

update public.product_variants
set options = jsonb_strip_nulls(
  jsonb_build_object(
    'Size', nullif(btrim(size), ''),
    'Colour', nullif(btrim(color), '')
  )
)
where options = '{}'::jsonb;

-- The old unique key only covered two attributes. The JSON representation identifies
-- any number of attributes, so it must be unique per product instead.
drop index if exists public.product_variants_product_size_color_unique;
create unique index if not exists product_variants_product_options_unique
  on public.product_variants (product_id, (options::text));
