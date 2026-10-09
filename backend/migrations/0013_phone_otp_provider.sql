-- =============================================================================
-- Migration 0013: Phone & OTP Authentication Support
-- Allows phone/otp provider in public.users and adds index on phone
-- =============================================================================

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_provider_check;
ALTER TABLE public.users ADD CONSTRAINT users_provider_check CHECK (provider IN ('google', 'apple', 'email', 'phone', 'otp'));

CREATE INDEX IF NOT EXISTS idx_users_phone ON public.users (phone);
