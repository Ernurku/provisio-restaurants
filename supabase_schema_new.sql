-- ============================================
-- PROVISIO: Secure Supabase Schema (v8)
-- ============================================
-- Goal: Clean slate, Native Supabase Auth, Row Level Security (RLS) enabled.
-- ============================================

-- 0. CLEANUP (WARNING: Wipes everything)
DROP TABLE IF EXISTS storage_logs CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS applications CASCADE;
DROP TABLE IF EXISTS team_members CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS menu_items CASCADE;
DROP TABLE IF EXISTS recipes CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS ingredients CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS (Profiles linked to Supabase Auth)
-- We map auth.users to our public.users table automatically via a trigger
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'owner',
    venue_name TEXT DEFAULT '',
    venue_type TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to create a user profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 2. TEAM MEMBERS (For Invites and Access Control)
CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    email TEXT,
    avatar_url TEXT,
    color TEXT DEFAULT 'var(--chocolate-light)',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Helper Function: Get the owner ID for the current user.
-- If the user is an owner, it returns their own ID.
-- If the user is a team member, it returns their owner's ID.
CREATE OR REPLACE FUNCTION get_tenant_id() RETURNS UUID AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  -- Check if user is a team member
  SELECT owner_id INTO v_owner_id FROM team_members WHERE email = (auth.jwt() ->> 'email') AND status = 'active' LIMIT 1;
  IF v_owner_id IS NOT NULL THEN
    RETURN v_owner_id;
  END IF;
  -- Otherwise, user is the owner
  RETURN auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. INGREDIENTS
CREATE TABLE ingredients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID DEFAULT get_tenant_id() NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT,
    base_unit TEXT DEFAULT 'kg',
    edible_portion_pc NUMERIC DEFAULT 100, 
    density NUMERIC DEFAULT 1.0,
    nutrition JSONB DEFAULT '{"kcal":0, "protein":0, "fat":0, "carbs":0}',
    conversions JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name, user_id)
);

-- 4. INVENTORY
CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID DEFAULT get_tenant_id() NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ingredient_id UUID REFERENCES ingredients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT,
    quantity NUMERIC DEFAULT 0,
    unit TEXT DEFAULT 'kg',
    min_stock NUMERIC DEFAULT 0,
    price NUMERIC DEFAULT 0,
    expiry DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. SUPPLIERS
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID DEFAULT get_tenant_id() NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    notes TEXT,
    groups JSONB DEFAULT '[]',
    prices JSONB DEFAULT '[]',
    schedule JSONB DEFAULT '[]',
    delivery_days JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. RECIPES
CREATE TABLE recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID DEFAULT get_tenant_id() NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT,
    finished_weight NUMERIC DEFAULT 0,
    sale_price NUMERIC DEFAULT 0,
    calculated_cost NUMERIC DEFAULT 0,
    yield_quantity NUMERIC DEFAULT 1,
    yield_unit TEXT DEFAULT 'порция',
    ingredients JSONB DEFAULT '[]',
    labor JSONB DEFAULT '[]',
    sub_recipes JSONB DEFAULT '[]',
    nutrition JSONB DEFAULT '{}',
    instructions TEXT DEFAULT '',
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. MENU ITEMS
CREATE TABLE menu_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID DEFAULT get_tenant_id() NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT,
    price NUMERIC DEFAULT 0,
    cost NUMERIC DEFAULT 0,
    margin NUMERIC DEFAULT 0,
    profit NUMERIC DEFAULT 0,
    recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. USER SETTINGS
CREATE TABLE user_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE DEFAULT get_tenant_id() NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    venue_name TEXT,
    venue_type TEXT,
    address TEXT,
    phone TEXT,
    currency TEXT DEFAULT '$',
    language TEXT DEFAULT 'ru',
    unit_system TEXT DEFAULT 'metric',
    timezone TEXT DEFAULT 'UTC+3',
    notifications JSONB DEFAULT '[]',
    inventory_categories JSONB DEFAULT '["Молочные","Мясо","Сухие","Овощи","Яйца","Специи","Напитки"]',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. ORDERS
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID DEFAULT get_tenant_id() NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_number TEXT NOT NULL,
    type TEXT DEFAULT 'purchase',
    status TEXT DEFAULT 'pending',
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    total_amount NUMERIC DEFAULT 0,
    items JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. APPLICATIONS (Integrations)
CREATE TABLE applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID DEFAULT get_tenant_id() NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    api_key TEXT,
    webhook_url TEXT,
    status TEXT DEFAULT 'disconnected',
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. AUDIT LOGS
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID DEFAULT get_tenant_id() NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_name TEXT,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. STORAGE LOGS (Inventory History)
CREATE TABLE storage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID DEFAULT get_tenant_id() NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ingredient_id UUID REFERENCES ingredients(id) ON DELETE CASCADE,
    change_qty NUMERIC NOT NULL,
    reason TEXT,
    ref_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_logs ENABLE ROW LEVEL SECURITY;

-- Policies for Users table
CREATE POLICY "Users can view their own profile" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON users FOR UPDATE USING (auth.uid() = id);

-- Policies for Team Members
CREATE POLICY "Owners can manage team members" ON team_members FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Team members can view team" ON team_members FOR SELECT USING (email = (auth.jwt() ->> 'email'));

-- Reusable Policy Template: Users can only access data belonging to their tenant (owner)
CREATE POLICY "Tenant isolation for ingredients" ON ingredients FOR ALL USING (user_id = get_tenant_id());
CREATE POLICY "Tenant isolation for inventory" ON inventory FOR ALL USING (user_id = get_tenant_id());
CREATE POLICY "Tenant isolation for suppliers" ON suppliers FOR ALL USING (user_id = get_tenant_id());
CREATE POLICY "Tenant isolation for recipes" ON recipes FOR ALL USING (user_id = get_tenant_id());
CREATE POLICY "Tenant isolation for menu_items" ON menu_items FOR ALL USING (user_id = get_tenant_id());
CREATE POLICY "Tenant isolation for user_settings" ON user_settings FOR ALL USING (user_id = get_tenant_id());
CREATE POLICY "Tenant isolation for orders" ON orders FOR ALL USING (user_id = get_tenant_id());
CREATE POLICY "Tenant isolation for applications" ON applications FOR ALL USING (user_id = get_tenant_id());
CREATE POLICY "Tenant isolation for audit_logs" ON audit_logs FOR ALL USING (user_id = get_tenant_id());
CREATE POLICY "Tenant isolation for storage_logs" ON storage_logs FOR ALL USING (user_id = get_tenant_id());
