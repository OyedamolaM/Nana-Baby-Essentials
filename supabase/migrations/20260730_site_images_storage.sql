-- Public site imagery with admin-only write access.
-- Safe to apply more than once.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-images',
  'site-images',
  true,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view site images" on storage.objects;
create policy "Public can view site images"
  on storage.objects
  for select
  using (bucket_id = 'site-images');

drop policy if exists "Admins can upload site images" on storage.objects;
create policy "Admins can upload site images"
  on storage.objects
  for insert
  with check (
    bucket_id = 'site-images'
    and public.is_current_user_admin()
  );

drop policy if exists "Admins can update site images" on storage.objects;
create policy "Admins can update site images"
  on storage.objects
  for update
  using (
    bucket_id = 'site-images'
    and public.is_current_user_admin()
  )
  with check (
    bucket_id = 'site-images'
    and public.is_current_user_admin()
  );

drop policy if exists "Admins can delete site images" on storage.objects;
create policy "Admins can delete site images"
  on storage.objects
  for delete
  using (
    bucket_id = 'site-images'
    and public.is_current_user_admin()
  );
