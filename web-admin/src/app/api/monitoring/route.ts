import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const agentsResult = await query(`
      SELECT 
        t.id,
        t.name,
        t.slug,
        t.schema_name,
        t.status AS tenant_status,
        t.last_heartbeat_at,
        s.sync_status,
        s.last_sync_at,
        s.last_invoice_cursor,
        s.last_return_cursor,
        s.last_receipt_cursor,
        s.last_ledger_cursor,
        s.last_error,
        CASE 
          WHEN t.last_heartbeat_at IS NULL THEN 'never'
          WHEN t.last_heartbeat_at > NOW() - INTERVAL '5 minutes' THEN 'online'
          WHEN t.last_heartbeat_at < NOW() - INTERVAL '24 hours' THEN 'offline_alert'
          ELSE 'idle'
        END AS agent_health,
        (SELECT COUNT(*) FROM public.pharmacies p WHERE p.tenant_id = t.id)::int AS total_pharmacies
      FROM public.tenants t
      LEFT JOIN public.tenant_sync_states s ON s.tenant_id = t.id
      ORDER BY t.created_at DESC
    `);

    const tenants = agentsResult.rows;

    const totalTenants = tenants.length;
    const onlineAgents = tenants.filter((t) => t.agent_health === 'online').length;
    const offlineAlerts = tenants.filter((t) => t.agent_health === 'offline_alert' || t.agent_health === 'never').length;
    const errorSyncs = tenants.filter((t) => t.sync_status === 'error' || t.sync_status === 'lagging').length;

    return NextResponse.json({
      success: true,
      kpis: {
        totalTenants,
        onlineAgents,
        offlineAlerts,
        errorSyncs
      },
      agents: tenants
    });
  } catch (error: any) {
    console.error('Error fetching monitoring stats:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
