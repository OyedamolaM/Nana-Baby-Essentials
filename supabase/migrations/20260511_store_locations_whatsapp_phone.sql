alter table public.store_locations
  add column if not exists whatsapp_phone text;

update public.store_locations
set whatsapp_phone = contact_phone
where coalesce(btrim(whatsapp_phone), '') = ''
  and coalesce(btrim(contact_phone), '') <> '';

notify pgrst, 'reload schema';
