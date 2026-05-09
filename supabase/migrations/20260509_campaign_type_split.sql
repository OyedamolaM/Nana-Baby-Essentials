alter table if exists public.newsletter_campaigns
  add column if not exists campaign_type text not null default 'newsletter';

alter table if exists public.newsletter_campaigns
  drop constraint if exists newsletter_campaigns_campaign_type_check;

alter table if exists public.newsletter_campaigns
  add constraint newsletter_campaigns_campaign_type_check
  check (campaign_type in ('newsletter', 'customer'));

update public.newsletter_campaigns
set campaign_type = 'newsletter'
where campaign_type is null;

create index if not exists idx_newsletter_campaigns_type_created_at
  on public.newsletter_campaigns (campaign_type, created_at desc);
