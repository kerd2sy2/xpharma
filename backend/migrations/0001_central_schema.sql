-- =============================================================================
-- Migration 0001: Central Schema (public)
-- Core tables: tenants, pharmacies, subscriptions, tenant_sync_states
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Tenants Table (Warehouses / المخازن)
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    schema_name VARCHAR(64) UNIQUE NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending')),
    api_key_hash VARCHAR(255),
    last_heartbeat_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants (status);
CREATE INDEX IF NOT EXISTS idx_tenants_schema ON public.tenants (schema_name);

-- 2. Pharmacies Table (الصيدليات التابعة للمخزن)
CREATE TABLE IF NOT EXISTS public.pharmacies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    code VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(32),
    address TEXT,
    link_code VARCHAR(32) UNIQUE,
    linked_user_id VARCHAR(128),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_pharmacy_code UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_pharmacies_tenant ON public.pharmacies (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pharmacies_link_code ON public.pharmacies (link_code);
CREATE INDEX IF NOT EXISTS idx_pharmacies_linked_user ON public.pharmacies (linked_user_id);

-- 3. Subscriptions Table (الاشتراكات والفوترة)
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    pharmacy_id UUID REFERENCES public.pharmacies(id) ON DELETE SET NULL,
    plan_type VARCHAR(32) NOT NULL DEFAULT 'monthly' CHECK (plan_type IN ('monthly', 'quarterly', 'yearly')),
    status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending_approval', 'expired', 'rejected')),
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE NOT NULL,
    receipt_url TEXT,
    receipt_ref VARCHAR(128),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON public.subscriptions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_end_date ON public.subscriptions (end_date);

-- 4. Tenant Sync States (حالة ومؤشرات المزامنة للوكيل)
CREATE TABLE IF NOT EXISTS public.tenant_sync_states (
    tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    last_sync_at TIMESTAMPTZ,
    last_invoice_cursor VARCHAR(128),
    last_return_cursor VARCHAR(128),
    last_receipt_cursor VARCHAR(128),
    last_ledger_cursor VARCHAR(128),
    sync_status VARCHAR(32) NOT NULL DEFAULT 'idle' CHECK (sync_status IN ('idle', 'in_progress', 'error', 'lagging')),
    last_error TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
