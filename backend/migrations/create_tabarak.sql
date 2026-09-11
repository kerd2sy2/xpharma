DO $$
DECLARE
    v_tenant_id UUID;
    v_raw_key TEXT := 'xph_agt_tabarak_live_2026_sec9981';
    v_hash TEXT;
BEGIN
    v_hash := encode(digest(v_raw_key, 'sha256'), 'hex');
    
    INSERT INTO public.tenants (name, slug, schema_name, status, api_key_hash)
    VALUES ('مستودع تبارك للأدوية', 'tabarak', 'tenant_tabarak', 'active', v_hash)
    ON CONFLICT (slug) DO UPDATE SET api_key_hash = v_hash, status = 'active'
    RETURNING id INTO v_tenant_id;

    PERFORM public.create_tenant_schema('tenant_tabarak');

    INSERT INTO public.tenant_sync_states (tenant_id, sync_status)
    VALUES (v_tenant_id, 'idle')
    ON CONFLICT (tenant_id) DO NOTHING;

    -- Create sample pharmacy for testing
    INSERT INTO public.pharmacies (tenant_id, code, name, phone, link_code, is_active)
    VALUES (v_tenant_id, 'PH-101', 'صيدلية النور الحديثة', '01012345678', 'TABARAK101', true)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE 'Tenant Tabarak created successfully with key: %', v_raw_key;
END $$;
