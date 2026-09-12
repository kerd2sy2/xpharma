-- =============================================================================
-- Migration 0007: Tenant Category (مخزن أدوية / مخزن إكسسوارات ومستلزمات)
-- =============================================================================

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS category VARCHAR(64) DEFAULT 'مخزن أدوية';

COMMENT ON COLUMN public.tenants.category IS 'تصنيف المخزن: مخزن أدوية أو مخزن إكسسوارات ومستلزمات';
