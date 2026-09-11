import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import crypto from 'crypto';

// GET /api/tenants - list all warehouses/tenants
export async function GET() {
  try {
    const result = await query(`
      SELECT 
        t.id,
        t.slug,
        t.name,
        t.schema_name,
        t.status,
        t.last_heartbeat_at,
        t.created_at,
        s.sync_status,
        s.last_sync_at,
        s.last_invoice_cursor,
        s.last_error,
        (SELECT COUNT(*) FROM public.pharmacies p WHERE p.tenant_id = t.id)::int AS pharmacies_count,
        CASE 
          WHEN t.last_heartbeat_at IS NULL THEN 'never'
          WHEN t.last_heartbeat_at > NOW() - INTERVAL '5 minutes' THEN 'online'
          WHEN t.last_heartbeat_at < NOW() - INTERVAL '24 hours' THEN 'offline_alert'
          ELSE 'idle'
        END AS agent_health
      FROM public.tenants t
      LEFT JOIN public.tenant_sync_states s ON s.tenant_id = t.id
      ORDER BY t.created_at DESC
    `);

    return NextResponse.json({ success: true, tenants: result.rows });
  } catch (error: any) {
    console.error('Error fetching tenants:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/tenants - create new warehouse tenant & provision schema
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, slug } = body;

    if (!name || !slug) {
      return NextResponse.json({ success: false, error: 'Name and slug are required' }, { status: 400 });
    }

    // Sanitize slug (alphanumeric and underscores)
    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const schemaName = `tenant_${cleanSlug}`;

    // Generate Agent API Key
    const rawApiKey = `xph_agt_${crypto.randomBytes(24).toString('hex')}`;
    const apiKeyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');

    // 1. Insert tenant in public.tenants
    const insertTenant = await query(
      `INSERT INTO public.tenants (name, slug, schema_name, status, api_key_hash)
       VALUES ($1, $2, $3, 'active', $4)
       RETURNING id, name, slug, schema_name, status, created_at`,
      [name, cleanSlug, schemaName, apiKeyHash]
    );

    const tenant = insertTenant.rows[0];

    // 2. Provision isolated schema with tables (invoices, returns, receipts, ledger, products)
    await query(`SELECT public.create_tenant_schema($1)`, [schemaName]);

    // 3. Initialize tenant sync state
    await query(
      `INSERT INTO public.tenant_sync_states (tenant_id, sync_status)
       VALUES ($1, 'idle')
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tenant.id]
    );

    return NextResponse.json({
      success: true,
      tenant,
      apiKey: rawApiKey, // returned only upon creation
      message: 'Tenant created and schema provisioned successfully.'
    });
  } catch (error: any) {
    console.error('Error creating tenant:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
