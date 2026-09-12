import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import crypto from 'crypto';

// Ensure columns exist (auto-migration)
let columnsChecked = false;
async function ensureColumnsExist() {
  if (columnsChecked) return;
  try {
    await query(`
      ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS address TEXT;
      ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(64);
      ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;
    `);
    columnsChecked = true;
  } catch (e) {
    console.warn('Could not auto-migrate tenants columns:', e);
  }
}

// GET /api/tenants - list all warehouses/tenants
export async function GET() {
  try {
    await ensureColumnsExist();

    const result = await query(`
      SELECT 
        t.id,
        t.slug,
        t.name,
        t.schema_name,
        t.status,
        COALESCE(t.address, '') AS address,
        COALESCE(t.contact_phone, '') AS contact_phone,
        COALESCE(t.logo_url, '') AS logo_url,
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
    await ensureColumnsExist();

    const body = await req.json();
    const { name, slug, address = '', contact_phone = '', logo_url = '' } = body;

    if (!name || !slug) {
      return NextResponse.json({ success: false, error: 'اسم المخزن والمعرف (slug) مطلوبان' }, { status: 400 });
    }

    // Sanitize slug (alphanumeric and underscores)
    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const schemaName = `tenant_${cleanSlug}`;

    // Generate Agent API Key
    const rawApiKey = `xph_agt_${crypto.randomBytes(24).toString('hex')}`;
    const apiKeyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');

    // 1. Insert tenant in public.tenants with address, contact_phone, logo_url
    const insertTenant = await query(
      `INSERT INTO public.tenants (name, slug, schema_name, status, api_key_hash, address, contact_phone, logo_url)
       VALUES ($1, $2, $3, 'active', $4, $5, $6, $7)
       RETURNING id, name, slug, schema_name, status, address, contact_phone, logo_url, created_at`,
      [name.trim(), cleanSlug, schemaName, apiKeyHash, address ? address.trim() : null, contact_phone ? contact_phone.trim() : null, logo_url ? logo_url.trim() : null]
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
      message: 'تم إنشاء المخزن والمخطط بنجاح.'
    });
  } catch (error: any) {
    console.error('Error creating tenant:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
