-- =============================================================================
-- Migration 0011: Complete Subscription & SaaS Column Setup
-- =============================================================================

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_type_check;
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE public.subscriptions ALTER COLUMN end_date DROP NOT NULL;

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS user_phone VARCHAR(64);
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS currency VARCHAR(16) DEFAULT 'EGP';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(64) DEFAULT 'kashier';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS order_id VARCHAR(128);
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(128);
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS card_brand VARCHAR(32);
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS masked_card VARCHAR(32);
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS receipt_ref VARCHAR(128);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_subscription_active BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS subscription_plan INT DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

GRANT ALL ON TABLE public.subscriptions TO xpharma_user;
GRANT ALL ON TABLE public.users TO xpharma_user;

DO $$
BEGIN
  BEGIN
    ALTER TABLE public.subscriptions OWNER TO xpharma_user;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not change table owner: %', SQLERRM;
  END;
  BEGIN
    ALTER TABLE public.users OWNER TO xpharma_user;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not change table owner: %', SQLERRM;
  END;
END $$;
