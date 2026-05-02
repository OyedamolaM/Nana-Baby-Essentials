# Database Setup Instructions

## Run these SQL commands in your Supabase SQL Editor

Go to: https://supabase.com/dashboard/project/wvaquxifumwjphlvdbgb/sql/new

### 1. Create Products Table

```sql
CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  category TEXT NOT NULL,
  image TEXT NOT NULL,
  description TEXT NOT NULL,
  in_stock BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Everyone can read products
CREATE POLICY "Products are viewable by everyone" ON products
  FOR SELECT USING (true);

-- Only admins can insert/update/delete products
CREATE POLICY "Admins can insert products" ON products
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

CREATE POLICY "Admins can update products" ON products
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

CREATE POLICY "Admins can delete products" ON products
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );
```

### 2. Create User Profiles Table

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  is_admin BOOLEAN DEFAULT false,
  shipping_address JSONB,
  billing_address JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles" ON user_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### 3. Create Orders Table

```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  total DECIMAL(10, 2) NOT NULL,
  status TEXT DEFAULT 'pending',
  shipping_address JSONB NOT NULL,
  billing_address JSONB NOT NULL,
  items JSONB NOT NULL,
  payment_reference TEXT,
  shipping_tier TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Users can view their own orders
CREATE POLICY "Users can view own orders" ON orders
  FOR SELECT USING (auth.uid() = user_id);

-- Users can create their own orders
CREATE POLICY "Users can create own orders" ON orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins can view all orders
CREATE POLICY "Admins can view all orders" ON orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Admins can update orders
CREATE POLICY "Admins can update orders" ON orders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );
```

### 4. Create Wishlists Table

```sql
CREATE TABLE wishlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- Enable RLS
ALTER TABLE wishlists ENABLE ROW LEVEL SECURITY;

-- Users can manage their own wishlist
CREATE POLICY "Users can view own wishlist" ON wishlists
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can add to own wishlist" ON wishlists
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete from own wishlist" ON wishlists
  FOR DELETE USING (auth.uid() = user_id);
```

### 5. Create Registries Tables

```sql
CREATE TABLE registries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  event_date DATE,
  share_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE registries ENABLE ROW LEVEL SECURITY;

-- Users can view their own registries
CREATE POLICY "Users can view own registries" ON registries
  FOR SELECT USING (auth.uid() = user_id);

-- Anyone can view registries by share code (for public viewing)
CREATE POLICY "Anyone can view registries by share code" ON registries
  FOR SELECT USING (true);

-- Users can create their own registries
CREATE POLICY "Users can create own registries" ON registries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own registries
CREATE POLICY "Users can update own registries" ON registries
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own registries
CREATE POLICY "Users can delete own registries" ON registries
  FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE registry_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_id UUID REFERENCES registries(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id) ON DELETE CASCADE,
  purchased BOOLEAN DEFAULT false,
  purchased_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(registry_id, product_id)
);

-- Enable RLS
ALTER TABLE registry_items ENABLE ROW LEVEL SECURITY;

-- Registry owners can manage items
CREATE POLICY "Registry owners can view items" ON registry_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM registries
      WHERE id = registry_id AND user_id = auth.uid()
    )
  );

-- Anyone can view registry items (for public viewing)
CREATE POLICY "Anyone can view registry items" ON registry_items
  FOR SELECT USING (true);

CREATE POLICY "Registry owners can add items" ON registry_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM registries
      WHERE id = registry_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Registry owners can update items" ON registry_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM registries
      WHERE id = registry_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Registry owners can delete items" ON registry_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM registries
      WHERE id = registry_id AND user_id = auth.uid()
    )
  );
```

### 6. Insert Sample Products

```sql
INSERT INTO products (name, price, category, image, description, in_stock) VALUES
('Soft Plush Teddy Bear', 24.99, 'Toys', 'https://images.unsplash.com/photo-1684577753340-de97c66fa6fd?w=1080', 'Ultra-soft and cuddly teddy bear, perfect for bedtime snuggles', true),
('Organic Cotton Onesie', 18.99, 'Clothing', 'https://images.unsplash.com/photo-1622290291165-d341f1938b8a?w=1080', '100% organic cotton onesie, gentle on baby''s sensitive skin', true),
('Colorful Building Blocks', 29.99, 'Toys', 'https://images.unsplash.com/photo-1655087751207-1020c89f7eee?w=1080', 'Safe, colorful blocks for developing motor skills and creativity', true),
('Rainbow Baby Dresses', 34.99, 'Clothing', 'https://images.unsplash.com/photo-1560506840-ec148e82a604?w=1080', 'Beautiful collection of colorful dresses for special occasions', true),
('Baby Blue Romper', 22.99, 'Clothing', 'https://images.unsplash.com/photo-1622290319146-7b63df48a635?w=1080', 'Comfortable and stylish blue romper for everyday wear', true),
('Colorful Baby Socks Set', 12.99, 'Accessories', 'https://images.unsplash.com/photo-1542355581-caf7454785ca?w=1080', 'Pack of 5 adorable colorful socks to keep tiny feet warm', true),
('Activity Play Mat', 49.99, 'Toys', 'https://images.unsplash.com/photo-1593793373220-2e51e1c31385?w=1080', 'Interactive play mat with textures and colors for sensory development', true),
('Stuffed Animal Collection', 39.99, 'Toys', 'https://images.unsplash.com/photo-1724703171978-bbe9c2ab70c4?w=1080', 'Set of adorable stuffed animals for imaginative play', true),
('White Dress & Shoes Set', 44.99, 'Clothing', 'https://images.unsplash.com/photo-1684244160171-97f5dac39204?w=1080', 'Elegant white dress with matching shoes for special events', false),
('Colorful Onesie Pack', 32.99, 'Clothing', 'https://images.unsplash.com/photo-1569974641446-22542de88536?w=1080', 'Set of 3 colorful onesies for everyday comfort', true),
('Baby Gift Hamper', 89.99, 'Accessories', 'https://images.unsplash.com/photo-1635874714425-c342060a4c58?w=1080', 'Complete gift set with essentials for new parents', true),
('Educational Toy Set', 36.99, 'Toys', 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=1080', 'Age-appropriate educational toys for early learning', true);
```

### 7. Create Admin User (Replace with your email)

```sql
-- After signing up with your account, run this to make yourself admin:
UPDATE user_profiles SET is_admin = true WHERE email = 'your-email@example.com';
```

## Next Steps

1. Run all the SQL commands above in order
2. Enable Google OAuth in Supabase Authentication settings
3. Configure email templates for welcome and order confirmations in Supabase
4. Set up Paystack API keys as environment variables
