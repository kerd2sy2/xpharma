import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

// GET /api/databases - list all connected warehouse databases and replica statistics
export async function GET() {
  try {
    const tenantsResult = await query(`
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
        s.last_receipt_cursor,
        s.last_ledger_cursor,
        s.last_error,
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

    const tenants = tenantsResult.rows;

    const databaseReplicas = await Promise.all(
      tenants.map(async (tenant) => {
        const schema = tenant.schema_name;

        let invoicesCount = 0;
        let receiptsCount = 0;
        let productsCount = 0;
        let ledgerCount = 0;
        let returnsCount = 0;
        let pharmaciesCount = 0;
        let totalReceiptsAmount = 0;
        let totalInvoicesAmount = 0;
        let latestReceiptDate: string | null = null;
        let latestInvoiceDate: string | null = null;

        try {
          const pharmRes = await query(
            `SELECT COUNT(*)::int as count FROM public.pharmacies WHERE tenant_id = $1`,
            [tenant.id]
          );
          pharmaciesCount = pharmRes.rows[0]?.count || 0;

          const rcptRes = await query(`
            SELECT 
              COUNT(*)::int as count, 
              COALESCE(SUM(amount), 0)::float as total_amount,
              MAX(receipt_date) as latest_date
            FROM ${schema}.cash_receipts
          `);
          receiptsCount = rcptRes.rows[0]?.count || 0;
          totalReceiptsAmount = rcptRes.rows[0]?.total_amount || 0;
          latestReceiptDate = rcptRes.rows[0]?.latest_date || null;

          const invRes = await query(`
            SELECT 
              COUNT(*)::int as count, 
              COALESCE(SUM(net_amount), 0)::float as total_amount,
              MAX(invoice_date) as latest_date
            FROM ${schema}.invoices
          `);
          invoicesCount = invRes.rows[0]?.count || 0;
          totalInvoicesAmount = invRes.rows[0]?.total_amount || 0;
          latestInvoiceDate = invRes.rows[0]?.latest_date || null;

          const prodRes = await query(`SELECT COUNT(*)::int as count FROM ${schema}.products`);
          productsCount = prodRes.rows[0]?.count || 0;

          const ledgRes = await query(`SELECT COUNT(*)::int as count FROM ${schema}.ledger_entries`);
          ledgerCount = ledgRes.rows[0]?.count || 0;

          const retRes = await query(`SELECT COUNT(*)::int as count FROM ${schema}.returns`);
          returnsCount = retRes.rows[0]?.count || 0;
        } catch (schemaErr: any) {
          console.warn(`Could not read tables for schema ${schema}:`, schemaErr.message);
        }

        return {
          ...tenant,
          metrics: {
            receipts_count: receiptsCount,
            total_receipts_amount: totalReceiptsAmount,
            latest_receipt_date: latestReceiptDate,
            invoices_count: invoicesCount,
            total_invoices_amount: totalInvoicesAmount,
            latest_invoice_date: latestInvoiceDate,
            pharmacies_count: pharmaciesCount,
            products_count: productsCount,
            ledger_count: ledgerCount,
            returns_count: returnsCount,
            total_replicated_records:
              receiptsCount + invoicesCount + pharmaciesCount + productsCount + ledgerCount + returnsCount,
          },
        };
      })
    );

    return NextResponse.json({ success: true, databases: databaseReplicas });
  } catch (error: any) {
    console.error('Error fetching database replicas:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
