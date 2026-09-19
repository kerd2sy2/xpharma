-- =============================================================================
-- Migration 0010: Kashier Payment & Multi-Pharmacy Billing Support
-- =============================================================================

-- 1. Make tenant_id nullable in public.subscriptions so mobile users can subscribe before/across warehouses
ALTER TABLE public.subscriptions ALTER COLUMN tenant_id DROP NOT NULL;

-- 2. Drop restrictive check constraints on plan_type and status if present
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_type_check;
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;

-- 3. Add rich billing fields to public.subscriptions
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS user_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS user_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS user_phone VARCHAR(64),
ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS currency VARCHAR(16) DEFAULT 'EGP',
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(64) DEFAULT 'kashier',
ADD COLUMN IF NOT EXISTS order_id VARCHAR(128),
ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(128),
ADD COLUMN IF NOT EXISTS card_brand VARCHAR(32),
ADD COLUMN IF NOT EXISTS masked_card VARCHAR(32);

-- 4. Create indexes for fast lookup in admin dashboard
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_email ON public.subscriptions (user_email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_payment_method ON public.subscriptions (payment_method);
CREATE INDEX IF NOT EXISTS idx_subscriptions_order_id ON public.subscriptions (order_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_created_at ON public.subscriptions (created_at DESC);

-- 5. Grant permissions to xpharma_user
GRANT ALL ON TABLE public.subscriptions TO xpharma_user;
