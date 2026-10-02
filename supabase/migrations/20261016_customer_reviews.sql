-- Customer-submitted reviews. They are collected privately for admins, who can
-- add or remove them from the live review sections.
create table if not exists public.customer_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.user_profiles(id) on delete set null,
  reviewer_name text not null,
  reviewer_email text,
  reviewer_phone text,
  rating integer not null default 5 check (rating between 1 and 5),
  review_text text not null,
  source text not null default 'web' check (source in ('web', 'qr')),
  store_slug text,
  published_section text check (published_section in ('homepage', 'registry')),
  published_review_id uuid,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_reviews enable row level security;

-- Submissions hold contact details and are never public. Only admins read them;
-- the public form submits through the server using the service role.
drop policy if exists "Admins can manage customer reviews" on public.customer_reviews;
create policy "Admins can manage customer reviews" on public.customer_reviews
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

revoke all on public.customer_reviews from anon, authenticated;
grant select, insert, update, delete on public.customer_reviews to authenticated;
grant all on public.customer_reviews to service_role;

create index if not exists idx_customer_reviews_created_at
  on public.customer_reviews (created_at desc);

create index if not exists idx_customer_reviews_published_section
  on public.customer_reviews (published_section);

create index if not exists idx_customer_reviews_store_slug
  on public.customer_reviews (store_slug);

notify pgrst, 'reload schema';
