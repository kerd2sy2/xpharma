-- 0009_user_device_and_trial.sql
-- Bind email to device ID and enforce 7-day trial per email

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS device_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS device_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS subscription_plan INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_device_id ON public.users(device_id);
