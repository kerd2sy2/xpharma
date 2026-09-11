-- =============================================================================
-- Migration 0003: Tenant Provisioning Function
-- Dynamically creates a new schema and clones all tables from tenant_template
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_tenant_schema(p_schema_name TEXT)
RETURNS VOID AS $$
BEGIN
    -- Validate schema name (must be alphanumeric and underscores only)
    IF p_schema_name !~ '^[a-zA-Z0-9_]+$' THEN
        RAISE EXCEPTION 'Invalid schema name: %', p_schema_name;
    END IF;

    -- Create schema
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', p_schema_name);

    -- 1. Invoices
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.invoices (
            LIKE tenant_template.invoices INCLUDING ALL
        )
    ', p_schema_name);

    -- 2. Invoice Items (references invoices in the same tenant schema)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.invoice_items (
            LIKE tenant_template.invoice_items INCLUDING ALL
        )
    ', p_schema_name);
    
    -- Ensure foreign key points to tenant schema invoices
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

END;
$$ LANGUAGE plpgsql;
