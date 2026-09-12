-- =============================================================================
-- Migration 0006: Tenant Details (Address, Contact Phone, Logo URL)
-- =============================================================================

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(64);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN public.tenants.address IS 'العنوان والمقر الجغرافي للمخزن';
COMMENT ON COLUMN public.tenants.contact_phone IS 'رقم هاتف الدعم الفني والتواصل للعملاء عند وجود مشاكل في الربط';
COMMENT ON COLUMN public.tenants.logo_url IS 'رابط أو مسار صورة شعار/لوجو المخزن';
