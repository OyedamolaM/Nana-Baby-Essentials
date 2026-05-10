create table if not exists public.site_content_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.site_content_settings enable row level security;

drop policy if exists "Site content is viewable by everyone" on public.site_content_settings;
create policy "Site content is viewable by everyone" on public.site_content_settings
  for select using (true);

drop policy if exists "Admins can manage site content" on public.site_content_settings;
create policy "Admins can manage site content" on public.site_content_settings
  for all
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

create table if not exists public.homepage_reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_name text not null,
  reviewer_role text,
  review_text text not null,
  rating integer not null default 5 check (rating between 1 and 5),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.homepage_reviews enable row level security;

drop policy if exists "Homepage reviews are viewable by everyone" on public.homepage_reviews;
create policy "Homepage reviews are viewable by everyone" on public.homepage_reviews
  for select using (true);

drop policy if exists "Admins can manage homepage reviews" on public.homepage_reviews;
create policy "Admins can manage homepage reviews" on public.homepage_reviews
  for all
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

create index if not exists idx_homepage_reviews_active_sort_order
  on public.homepage_reviews (is_active, sort_order, created_at desc);

insert into public.site_content_settings (key, value)
values
  (
    'hero_image',
    jsonb_build_object(
      'image',
      'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxMHx8YmFieSUyMHByb2R1Y3RzJTIwdG95c3xlbnwxfHx8fDE3Nzc1MzA0OTl8MA&ixlib=rb-4.1.0&q=80&w=1080',
      'alt',
      'Happy baby with toys'
    )
  ),
  (
    'about_images',
    jsonb_build_array(
      jsonb_build_object(
        'image',
        'https://images.unsplash.com/photo-1522771930-78848d9293e8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHw2fHxiYWJ5JTIwY2xvdGhlc3xlbnwxfHx8fDE3Nzc1MzA0OTl8MA&ixlib=rb-4.1.0&q=80&w=1080',
        'alt',
        'Baby with parent'
      ),
      jsonb_build_object(
        'image',
        'https://images.unsplash.com/photo-1647687663833-fcc91fd99792?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwyfHxiYWJ5JTIwcHJvZHVjdHMlMjB0b3lzfGVufDF8fHx8MTc3NzUzMDQ5OHww&ixlib=rb-4.1.0&q=80&w=1080',
        'alt',
        'Baby playing'
      ),
      jsonb_build_object(
        'image',
        'https://images.unsplash.com/photo-1709380830070-2c0da9348126?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwzfHxiYWJ5JTIwcHJvZHVjdHMlMjB0b3lzfGVufDF8fHx8MTc3NzUzMDQ5OHww&ixlib=rb-4.1.0&q=80&w=1080',
        'alt',
        'Baby with toys'
      ),
      jsonb_build_object(
        'image',
        'https://images.unsplash.com/photo-1560506840-ec148e82a604?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwyfHxiYWJ5JTIwY2xvdGhlc3xlbnwxfHx8fDE3Nzc1MzA0OTl8MA&ixlib=rb-4.1.0&q=80&w=1080',
        'alt',
        'Baby clothes'
      )
    )
  )
on conflict (key) do nothing;

insert into public.homepage_reviews (
  reviewer_name,
  reviewer_role,
  review_text,
  rating,
  sort_order,
  is_active
)
values
  (
    'Amaka O.',
    'First-time mum in Lagos',
    'Shopping from Nana''s Baby Essentials felt easy from start to finish. The delivery was quick, the items matched the photos, and the quality was exactly what I wanted for my baby.',
    5,
    0,
    true
  ),
  (
    'Tolu A.',
    'Registry owner',
    'The baby registry made it simple for family and friends to support us. I especially liked that people could contribute toward the exact items we still needed.',
    5,
    1,
    true
  ),
  (
    'Chioma E.',
    'Returning customer',
    'I keep coming back because the store feels dependable. The product selection is thoughtful, customer support responds quickly, and the whole experience feels built for real parents.',
    5,
    2,
    true
  )
on conflict do nothing;

notify pgrst, 'reload schema';
