-- =============================================================================
-- Migration 0004: Tenant Products & Recent Stock
-- Supports recent products / offers (أصناف حديثة) as extracted from Firebird STOCK_STOCK & PRODUCTS
-- =============================================================================

-- 1. Create table in tenant_template
CREATE TABLE IF NOT EXISTS tenant_template.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    remote_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    date_in TIMESTAMPTZ,
    raw_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_products_remote UNIQUE (remote_id)
);

CREATE INDEX IF NOT EXISTS idx_products_date_in ON tenant_template.products (date_in DESC);
CREATE INDEX IF NOT EXISTS idx_products_name ON tenant_template.products (name);

-- 2. Update create_tenant_schema function to include products table
CREATE OR REPLACE FUNCTION public.create_tenant_schema(p_schema_name TEXT)
RETURNS VOID AS $$
BEGIN
    IF p_schema_name !~ '^[a-zA-Z0-9_]+$' THEN
        RAISE EXCEPTION 'Invalid schema name: %', p_schema_name;
    END IF;

    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', p_schema_name);

    -- 1. Invoices
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.invoices (
            LIKE tenant_template.invoices INCLUDING ALL
        )
    ', p_schema_name);

    -- 2. Invoice Items
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.invoice_items (
            LIKE tenant_template.invoice_items INCLUDING ALL
        )
    ', p_schema_name);
    
    EXECUTE format('
        DO $fk$ 
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints 
                WHERE constraint_name = ''fk_invoice_items_invoice'' 
                AND table_schema = %L
            ) THEN
                ALTER TABLE %I.invoice_items 
                ADD CONSTRAINT fk_invoice_items_invoice 
                FOREIGN KEY (invoice_id) REFERENCES %I.invoices(id) ON DELETE CASCADE;
            END IF;
        END $fk$;
    ', p_schema_name, p_schema_name, p_schema_name);

    -- 3. Returns
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.returns (
            LIKE tenant_template.returns INCLUDING ALL
        )
    ', p_schema_name);

    -- 4. Cash Receipts
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.cash_receipts (
            LIKE tenant_template.cash_receipts INCLUDING ALL
        )
    ', p_schema_name);

    -- 5. Ledger Entries
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.ledger_entries (
            LIKE tenant_template.ledger_entries INCLUDING ALL
        )
    ', p_schema_name);

    -- 6. Products & Recent Stock (الأصناف والوارد الحديث)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.products (
            LIKE tenant_template.products INCLUDING ALL
        )
    ', p_schema_name);

END;
$$ LANGUAGE plpgsql;
