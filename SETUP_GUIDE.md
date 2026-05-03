# Nana's Baby Essentials - Setup Guide

## 🎉 Overview

You now have a fully functional e-commerce baby store with:
- ✅ User authentication (email/password + Google sign-in)
- ✅ Product browsing with categories and search
- ✅ Shopping cart and wishlist
- ✅ Checkout with Paystack payment integration
- ✅ Baby registry system with shareable links
- ✅ User dashboard (orders, profile, addresses)
- ✅ Admin dashboard (products, orders, customers, sales)
- ✅ Email notifications (welcome, order confirmation)

## 📋 Setup Steps

### 1. Database Setup

1. Go to your Supabase SQL Editor: https://supabase.com/dashboard/project/wvaquxifumwjphlvdbgb/sql/new
2. For a brand-new project, open `supabase/setup.sql`
3. If your project was already initialized from the older setup guide, open `supabase/migrations/20260503_schema_recovery.sql`
4. Copy the full contents of the correct file into the SQL Editor and run it
5. After creating your account through the app, run the admin update query from `DATABASE_SETUP.md`

### 2. Enable Google OAuth

1. Go to: https://supabase.com/dashboard/project/wvaquxifumwjphlvdbgb/auth/providers
2. Enable Google provider
3. Follow Supabase's instructions to set up Google OAuth credentials
4. Add your authorized redirect URLs

### 3. Set up Paystack

1. Create a Paystack account at: https://paystack.com
2. Get your public key from your Paystack dashboard
3. Open `/src/components/checkout/CheckoutModal.tsx`
4. Replace `'pk_test_xxxx'` with your actual Paystack public key (line ~99)
5. For production, use your live key instead of test key

### 4. Configure Email Templates (Optional)

1. Go to: https://supabase.com/dashboard/project/wvaquxifumwjphlvdbgb/auth/templates
2. Customize these email templates:
   - **Confirm signup**: Welcome email
   - **Reset password**: Password reset email
3. For order confirmation emails, you'll need to set up a Supabase Edge Function (see below)

### 5. Deploy Edge Function for Payment Verification (Optional but Recommended)

Create a new edge function to verify Paystack payments:

```typescript
// supabase/functions/verify-payment/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const { reference } = await req.json()
  
  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${reference}`,
    {
      headers: {
        Authorization: `Bearer YOUR_PAYSTACK_SECRET_KEY`
      }
    }
  )
  
  const data = await response.json()
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  })
})
```

Deploy with: `supabase functions deploy verify-payment`

## 🔐 Security Notes

**IMPORTANT**: This implementation stores PII (personally identifiable information) in Supabase. For production use:

1. ✅ Row Level Security (RLS) is enabled on all tables
2. ✅ Users can only access their own data
3. ✅ Admin routes are protected
4. ⚠️ For production, consider additional security measures:
   - Add rate limiting
   - Implement CAPTCHA on signup
   - Add two-factor authentication
   - Use environment variables for API keys
   - Enable Supabase's additional security features

## 🚀 Features Guide

### For Customers

1. **Browse Products**: Filter by category, search by name
2. **Product Details**: Click any product to see full details
3. **Shopping Cart**: Add items, adjust quantities
4. **Checkout**: Choose shipping zone, enter address, pay with Paystack
5. **Wishlist**: Save favorites for later
6. **Baby Registry**: Create a registry, add products, share with family/friends
7. **Dashboard**: View orders, update profile, manage addresses, change password

### For Admins

1. Access admin dashboard via user menu (after setting is_admin = true in database)
2. **Manage Products**: Add, edit, delete products
3. **View Orders**: See all orders, filter by status
4. **Customer Management**: View all registered customers
5. **Sales Analytics**: Monthly revenue and order counts

## 🎨 Customization

### Branding

The store name "Nana's Baby Essentials" appears in:
- `/src/app/components/Header.tsx` (line 75)
- `/src/app/components/Footer.tsx` (line 14)
- `/src/components/auth/AuthModal.tsx` (line 50)

### Shipping Zones

Edit shipping tiers in `/src/components/checkout/CheckoutModal.tsx` (lines 18-25)

### Product Categories

Edit categories in `/src/app/App.tsx` (search for `CATEGORIES`)

## 📧 Email System

Supabase handles:
- Welcome emails (when users sign up)
- Password reset emails

For order confirmation emails, you can:
1. Use Supabase Edge Functions with Resend/SendGrid
2. Set up a webhook from Paystack to trigger emails
3. Use the Supabase email templates

## 🧪 Testing

1. **Test Mode**: Use Paystack test card numbers:
   - Card: 4084 0840 8408 4081
   - CVV: 408
   - Expiry: Any future date
   - PIN: 0000
   - OTP: 123456

2. **Test Users**: Create test accounts to test the flow
3. **Admin Testing**: Make your account admin and test the admin dashboard

## 📱 Mobile Optimization

The app is fully responsive and works on:
- Desktop (1024px+)
- Tablet (768px - 1023px)
- Mobile (< 768px)

## 🐛 Troubleshooting

**Issue**: Can't see products
- **Solution**: Run `supabase/setup.sql`. If the project already used the older setup guide, run `supabase/migrations/20260503_schema_recovery.sql` instead.

**Issue**: Console shows `PGRST205` for `collections`, `homepage_deals`, `shopping_carts`, or `blog_posts`
- **Solution**: Your database is missing newer tables. Run `supabase/migrations/20260503_schema_recovery.sql`, then refresh the app.

**Issue**: Google sign-in not working
- **Solution**: Configure Google OAuth in Supabase auth settings

**Issue**: Payment failing
- **Solution**: Check Paystack public key is correct and you're using test credentials

**Issue**: Not receiving emails
- **Solution**: Check Supabase email settings and templates

**Issue**: Admin dashboard showing "Access denied"
- **Solution**: Run SQL to set your user as admin: `UPDATE user_profiles SET is_admin = true WHERE email = 'your@email.com'`

**Issue**: Admin dashboard does not show customers
- **Solution**: Run the latest SQL so existing `auth.users` are backfilled into `public.user_profiles`

## 🚢 Deployment

For production deployment:
1. Use your Paystack live keys (not test keys)
2. Configure custom domain in Supabase
3. Set up proper SSL certificates
4. Enable Supabase's production features
5. Consider hosting on Vercel, Netlify, or similar platform

## 📞 Support

For issues with:
- **Supabase**: Check docs at supabase.com/docs
- **Paystack**: Visit paystack.com/docs
- **General**: Review the code comments and component documentation

---

🎊 Your baby store is ready to launch! Happy selling!
