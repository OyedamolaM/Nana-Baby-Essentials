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

## Newsletter Mail Settings

To send newsletters from the admin dashboard, add these environment variables where Next.js runs:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=your-email@gmail.com
SMTP_FROM_NAME=Nana's Baby Essentials
SMTP_REPLY_TO=your-email@gmail.com
```

If you use Gmail, create an App Password and use that value as `SMTP_PASSWORD`.

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
