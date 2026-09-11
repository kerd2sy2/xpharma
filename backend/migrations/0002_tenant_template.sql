-- =============================================================================
-- Migration 0002: Tenant Template Schema (tenant_template)
-- Isolated tables: invoices, invoice_items, returns, cash_receipts, ledger_entries
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS tenant_template;

-- 1. Invoices Table (فواتير المبيعات)
CREATE TABLE IF NOT EXISTS tenant_template.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    remote_id VARCHAR(64) NOT NULL,
    invoice_number VARCHAR(64) NOT NULL,
    pharmacy_code VARCHAR(64) NOT NULL,
    invoice_date TIMESTAMPTZ NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    remaining_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(32) NOT NULL DEFAULT 'closed',
    raw_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_invoices_remote UNIQUE (remote_id)
);

CREATE INDEX IF NOT EXISTS idx_invoices_pharmacy_date ON tenant_template.invoices (pharmacy_code, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON tenant_template.invoices (invoice_number);

-- 2. Invoice Items Table (بنود وأصناف الفواتير)
CREATE TABLE IF NOT EXISTS tenant_template.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES tenant_template.invoices(id) ON DELETE CASCADE,
    remote_item_id VARCHAR(64),
    item_code VARCHAR(64),
    item_name VARCHAR(255) NOT NULL,
    unit VARCHAR(32),
    quantity NUMERIC(10, 2) NOT NULL,
    bonus_quantity NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    unit_price NUMERIC(12, 2) NOT NULL,
    discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    total_price NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_items_invoice ON tenant_template.invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_items_code ON tenant_template.invoice_items (item_code);

-- 3. Returns Table (المرتجعات)
CREATE TABLE IF NOT EXISTS tenant_template.returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    remote_id VARCHAR(64) NOT NULL,
    return_number VARCHAR(64) NOT NULL,
    pharmacy_code VARCHAR(64) NOT NULL,
    return_date TIMESTAMPTZ NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(32) NOT NULL DEFAULT 'approved',
    reason TEXT,
    raw_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_returns_remote UNIQUE (remote_id)
);

CREATE INDEX IF NOT EXISTS idx_returns_pharmacy_date ON tenant_template.returns (pharmacy_code, return_date DESC);
CREATE INDEX IF NOT EXISTS idx_returns_number ON tenant_template.returns (return_number);

-- 4. Cash Receipts Table (إيصالات وسندات القبض النقدية)
CREATE TABLE IF NOT EXISTS tenant_template.cash_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    remote_id VARCHAR(64) NOT NULL,
    receipt_number VARCHAR(64) NOT NULL,
    pharmacy_code VARCHAR(64) NOT NULL,
    receipt_date TIMESTAMPTZ NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    payment_method VARCHAR(32) NOT NULL DEFAULT 'cash',
    collector_name VARCHAR(128),
    notes TEXT,
    raw_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_receipts_remote UNIQUE (remote_id)
);

CREATE INDEX IF NOT EXISTS idx_receipts_pharmacy_date ON tenant_template.cash_receipts (pharmacy_code, receipt_date DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_number ON tenant_template.cash_receipts (receipt_number);

-- 5. Ledger Entries Table (كشف الحساب التراكمي)
CREATE TABLE IF NOT EXISTS tenant_template.ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    remote_id VARCHAR(64) NOT NULL,
    pharmacy_code VARCHAR(64) NOT NULL,
    entry_date TIMESTAMPTZ NOT NULL,
    doc_type VARCHAR(32) NOT NULL,
    doc_number VARCHAR(64),
    debit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    credit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ledger_remote UNIQUE (remote_id)
);

CREATE INDEX IF NOT EXISTS idx_ledger_pharmacy_date ON tenant_template.ledger_entries (pharmacy_code, entry_date ASC, id ASC);
