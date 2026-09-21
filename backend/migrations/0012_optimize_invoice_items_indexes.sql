-- =============================================================================
-- Migration 0012: Ensure High-Performance Indexes for Invoices & Invoice Items
-- Ensures all tenant schemas have B-Tree indexes on invoice_id, remote_id, and invoice_number
-- =============================================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Ensure indexes in tenant_template first
    CREATE INDEX IF NOT EXISTS idx_template_items_invoice ON tenant_template.invoice_items (invoice_id);
    CREATE INDEX IF NOT EXISTS idx_template_items_code ON tenant_template.invoice_items (item_code);
    CREATE INDEX IF NOT EXISTS idx_template_invoices_remote ON tenant_template.invoices (remote_id);
    CREATE INDEX IF NOT EXISTS idx_template_invoices_number ON tenant_template.invoices (invoice_number);
    CREATE INDEX IF NOT EXISTS idx_template_invoices_pharma_date ON tenant_template.invoices (pharmacy_code, invoice_date DESC);

    -- Loop over all active tenant schemas
    FOR r IN 
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name LIKE 'tenant_%' AND schema_name <> 'tenant_template'
    LOOP
        -- 1. Index on invoice_items(invoice_id) for instant sub-millisecond line items fetching
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_invoice_items_invoice_id ON %I.invoice_items (invoice_id)', 
            replace(r.schema_name, 'tenant_', ''), r.schema_name);
            
        -- 2. Index on invoices(remote_id)
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_invoices_remote_id ON %I.invoices (remote_id)', 
            replace(r.schema_name, 'tenant_', ''), r.schema_name);

        -- 3. Index on invoices(invoice_number)
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_invoices_invoice_number ON %I.invoices (invoice_number)', 
            replace(r.schema_name, 'tenant_', ''), r.schema_name);

        -- 4. Index on invoices(pharmacy_code, invoice_date DESC)
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_invoices_pharma_date ON %I.invoices (pharmacy_code, invoice_date DESC)', 
            replace(r.schema_name, 'tenant_', ''), r.schema_name);

        -- 5. Index on returns(remote_id) and returns(return_number)
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_returns_remote_id ON %I.returns (remote_id)', 
            replace(r.schema_name, 'tenant_', ''), r.schema_name);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_returns_number ON %I.returns (return_number)', 
            replace(r.schema_name, 'tenant_', ''), r.schema_name);
    END LOOP;
END $$;
