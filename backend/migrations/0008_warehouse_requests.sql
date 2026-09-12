-- 0008_warehouse_requests.sql
-- Table for capturing warehouse onboarding requests submitted by pharmacists

CREATE TABLE IF NOT EXISTS public.warehouse_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_name VARCHAR(255) NOT NULL,
    warehouse_phone VARCHAR(50) NOT NULL,
    notes TEXT,
    requested_by_user_id VARCHAR(100),
    requested_by_email VARCHAR(255),
    requested_by_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warehouse_requests_status ON public.warehouse_requests(status);
CREATE INDEX IF NOT EXISTS idx_warehouse_requests_created ON public.warehouse_requests(created_at DESC);
