# Database Setup

Use the SQL files in `supabase/` as the source of truth.

## Which file should you run?

- Fresh Supabase project: run [`supabase/setup.sql`](supabase/setup.sql)
- Existing project that was set up from the older `DATABASE_SETUP.md`: run [`supabase/migrations/20260503_schema_recovery.sql`](supabase/migrations/20260503_schema_recovery.sql)

Both files are idempotent, so they are safe to run more than once.

## How to run it in Supabase

1. Open your Supabase project SQL Editor.
2. Open the SQL file from this repo.
3. Copy the full contents of the file.
4. Paste it into the SQL Editor and run it.
5. Refresh the app after the query completes.

## What the current SQL creates or fixes

- Core commerce tables: `products`, `orders`, `wishlists`
- Auth and admin tables: `user_profiles`
- Registry tables: `registries`, `registry_items`, `registry_orders`, `registry_order_items`
- Store cart tables: `shopping_carts`, `shopping_cart_items`
- Homepage content tables: `homepage_deals`, `collections`, `collection_products`, `blog_posts`
- Newsletter tables: `newsletter_subscribers`, `newsletter_campaigns`
- Product pricing columns: `cost_price` and `selling_price`
- Profile backfill for existing auth users, so admin can see customers created before the trigger existed

## Brevo Mail Settings

To send registry-created emails, store order confirmations, and newsletters from the app, add these environment variables where Next.js runs:

```env
BREVO_API_KEY=your-brevo-api-key
BREVO_SENDER_EMAIL=your-verified-sender@example.com
BREVO_SENDER_NAME=Nana's Baby Essentials
BREVO_REPLY_TO=your-verified-sender@example.com
BREVO_ORDER_SENDER_EMAIL=orders@yourdomain.example
BREVO_ORDER_SENDER_NAME=Nana's Orders
BREVO_ORDER_REPLY_TO=orders@yourdomain.example
BREVO_SANDBOX_MODE=true
```

Set `BREVO_SANDBOX_MODE=true` while you validate the three email flows without delivering to real inboxes. Remove it or set it to `false` for live sends.

`BREVO_SENDER_*` is used for registry-created emails and newsletters. `BREVO_ORDER_*` is used only for store order confirmations and falls back to the default sender if you leave it unset.

## Make Your Account Admin

After you sign in with your own account, run:

```sql
update public.user_profiles
set is_admin = true
where email = 'your-email@example.com';
```

## Quick Verification

Run these checks after the migration:

```sql
select tablename
from pg_tables
where schemaname = 'public'
  and tablename in (
    'collections',
    'homepage_deals',
    'newsletter_campaigns',
    'newsletter_subscribers',
    'shopping_carts',
    'shopping_cart_items',
    'blog_posts'
  )
order by tablename;
```

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'products'
  and column_name in ('price', 'cost_price', 'selling_price')
order by column_name;
```

```sql
select count(*) as profile_count
from public.user_profiles;
```
