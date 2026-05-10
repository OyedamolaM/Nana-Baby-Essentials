create table if not exists public.registry_reviews (
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

alter table public.registry_reviews enable row level security;

drop policy if exists "Registry reviews are viewable by everyone" on public.registry_reviews;
create policy "Registry reviews are viewable by everyone" on public.registry_reviews
  for select using (true);

drop policy if exists "Admins can manage registry reviews" on public.registry_reviews;
create policy "Admins can manage registry reviews" on public.registry_reviews
  for all
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

create index if not exists idx_registry_reviews_active_sort_order
  on public.registry_reviews (is_active, sort_order, created_at desc);

insert into public.registry_reviews (
  reviewer_name,
  reviewer_role,
  review_text,
  rating,
  sort_order,
  is_active
)
values
  (
    'Ada N.',
    'Mum-to-be building her first registry',
    'The registry page made it easy to keep everything in one place. I could share one link, track what had been covered, and still update my list when priorities changed.',
    5,
    0,
    true
  ),
  (
    'Bola A.',
    'Family gift contributor',
    'I liked that I could contribute toward exactly what the parents still needed without guessing. The registry felt clear, organized, and easy to use on my phone.',
    5,
    1,
    true
  ),
  (
    'Kemi O.',
    'Returning registry owner',
    'Being able to mix everyday essentials, bundles, and larger packages in one registry saved me a lot of time. It felt practical, not overwhelming.',
    5,
    2,
    true
  )
on conflict do nothing;

notify pgrst, 'reload schema';
