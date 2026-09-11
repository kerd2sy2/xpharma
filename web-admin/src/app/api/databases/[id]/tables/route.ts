import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tenantId } = await params;
    const { searchParams } = new URL(req.url);
    const table = searchParams.get('table') || 'cash_receipts';
    const search = searchParams.get('search') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    // Verify tenant exists and get schema_name
    const tenantRes = await query(
      `SELECT id, name, slug, schema_name FROM public.tenants WHERE id = $1`,
      [tenantId]
    );
    if (tenantRes.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Warehouse not found' }, { status: 404 });
    }

    const tenant = tenantRes.rows[0];
    const schema = tenant.schema_name;
    const searchPattern = search ? `%${search.trim()}%` : '';

    let rows: any[] = [];
    let totalCount = 0;

    switch (table) {
      case 'cash_receipts': {
        const countRes = await query(
          `SELECT COUNT(*)::int as count 
           FROM ${schema}.cash_receipts r
           LEFT JOIN public.pharmacies p ON p.tenant_id = $1 AND p.code = r.pharmacy_code
           WHERE ($2 = '' OR r.pharmacy_code ILIKE $2 OR r.receipt_number ILIKE $2 OR r.collector_name ILIKE $2 OR p.name ILIKE $2)`,
          [tenantId, searchPattern]
        );
        totalCount = countRes.rows[0]?.count || 0;

        const dataRes = await query(
          `SELECT 
             r.id, r.remote_id, r.receipt_number, r.pharmacy_code, 
             COALESCE(p.name, 'غير متوفر بالدليل') as pharmacy_name,
             r.receipt_date, r.amount, r.payment_method, r.collector_name, r.notes, r.created_at
           FROM ${schema}.cash_receipts r
           LEFT JOIN public.pharmacies p ON p.tenant_id = $1 AND p.code = r.pharmacy_code
           WHERE ($2 = '' OR r.pharmacy_code ILIKE $2 OR r.receipt_number ILIKE $2 OR r.collector_name ILIKE $2 OR p.name ILIKE $2)
           ORDER BY r.receipt_date DESC, r.remote_id DESC
           LIMIT $3 OFFSET $4`,
          [tenantId, searchPattern, limit, offset]
        );
        rows = dataRes.rows;
        break;
      }

      case 'invoices': {
        const countRes = await query(
          `SELECT COUNT(*)::int as count 
           FROM ${schema}.invoices i
           LEFT JOIN public.pharmacies p ON p.tenant_id = $1 AND p.code = i.pharmacy_code
           WHERE ($2 = '' OR i.pharmacy_code ILIKE $2 OR i.invoice_number ILIKE $2 OR p.name ILIKE $2)`,
          [tenantId, searchPattern]
        );
        totalCount = countRes.rows[0]?.count || 0;

        const dataRes = await query(
          `SELECT 
             i.id, i.remote_id, i.invoice_number, i.pharmacy_code, 
             COALESCE(p.name, 'غير متوفر بالدليل') as pharmacy_name,
             i.invoice_date, i.total_amount, i.discount_amount, i.net_amount, i.paid_amount, i.remaining_amount, i.status, i.created_at
           FROM ${schema}.invoices i
           LEFT JOIN public.pharmacies p ON p.tenant_id = $1 AND p.code = i.pharmacy_code
           WHERE ($2 = '' OR i.pharmacy_code ILIKE $2 OR i.invoice_number ILIKE $2 OR p.name ILIKE $2)
           ORDER BY i.invoice_date DESC, i.remote_id DESC
           LIMIT $3 OFFSET $4`,
          [tenantId, searchPattern, limit, offset]
        );
        rows = dataRes.rows;
        break;
      }

      case 'pharmacies': {
        const countRes = await query(
          `SELECT COUNT(*)::int as count 
           FROM public.pharmacies
           WHERE tenant_id = $1 
             AND ($2 = '' OR code ILIKE $2 OR name ILIKE $2 OR phone ILIKE $2 OR address ILIKE $2)`,
          [tenantId, searchPattern]
        );
        totalCount = countRes.rows[0]?.count || 0;

        const dataRes = await query(
          `SELECT 
             p.id, p.code, p.name, p.phone, p.address, p.link_code, p.is_active, p.created_at, p.updated_at,
             COALESCE(inv.total_amount, 0)::float as total_invoices,
             COALESCE(inv.invoices_count, 0)::int as invoices_count,
             COALESCE(ret.total_amount, 0)::float as total_returns,
             COALESCE(ret.returns_count, 0)::int as returns_count,
             COALESCE(rcpt.total_amount, 0)::float as total_paid,
             COALESCE(rcpt.receipts_count, 0)::int as receipts_count,
             (COALESCE(inv.total_amount, 0) - COALESCE(ret.total_amount, 0) - COALESCE(rcpt.total_amount, 0))::float as current_balance
           FROM public.pharmacies p
           LEFT JOIN (
             SELECT pharmacy_code, SUM(net_amount) as total_amount, COUNT(*) as invoices_count 
             FROM ${schema}.invoices GROUP BY pharmacy_code
           ) inv ON inv.pharmacy_code = p.code
           LEFT JOIN (
             SELECT pharmacy_code, SUM(net_amount) as total_amount, COUNT(*) as returns_count 
             FROM ${schema}.returns GROUP BY pharmacy_code
           ) ret ON ret.pharmacy_code = p.code
           LEFT JOIN (
             SELECT pharmacy_code, SUM(amount) as total_amount, COUNT(*) as receipts_count 
             FROM ${schema}.cash_receipts GROUP BY pharmacy_code
           ) rcpt ON rcpt.pharmacy_code = p.code
           WHERE p.tenant_id = $1 
             AND ($2 = '' OR p.code ILIKE $2 OR p.name ILIKE $2 OR p.phone ILIKE $2 OR p.address ILIKE $2)
           ORDER BY (COALESCE(inv.total_amount, 0) - COALESCE(ret.total_amount, 0) - COALESCE(rcpt.total_amount, 0)) DESC, p.code ASC
           LIMIT $3 OFFSET $4`,
          [tenantId, searchPattern, limit, offset]
        );
        rows = dataRes.rows;
        break;
      }

      case 'products': {
        const countRes = await query(
          `SELECT COUNT(*)::int as count 
           FROM ${schema}.products
           WHERE ($1 = '' OR remote_id ILIKE $1 OR name ILIKE $1 OR name_en ILIKE $1)`,
          [searchPattern]
        );
        totalCount = countRes.rows[0]?.count || 0;

        const dataRes = await query(
          `SELECT id, remote_id, name, name_en, price, quantity, discount_percent, date_in, updated_at
           FROM ${schema}.products
           WHERE ($1 = '' OR remote_id ILIKE $1 OR name ILIKE $1 OR name_en ILIKE $1)
           ORDER BY remote_id ASC
           LIMIT $2 OFFSET $3`,
          [searchPattern, limit, offset]
        );
        rows = dataRes.rows;
        break;
      }

      case 'returns': {
        const countRes = await query(
          `SELECT COUNT(*)::int as count 
           FROM ${schema}.returns r
           LEFT JOIN public.pharmacies p ON p.tenant_id = $1 AND p.code = r.pharmacy_code
           WHERE ($2 = '' OR r.pharmacy_code ILIKE $2 OR r.return_number ILIKE $2 OR r.reason ILIKE $2 OR p.name ILIKE $2)`,
          [tenantId, searchPattern]
        );
        totalCount = countRes.rows[0]?.count || 0;

        const dataRes = await query(
          `SELECT 
             r.id, r.remote_id, r.return_number, r.pharmacy_code, 
             COALESCE(p.name, 'غير متوفر بالدليل') as pharmacy_name,
             r.return_date, r.total_amount, r.net_amount, r.status, r.reason, r.created_at
           FROM ${schema}.returns r
           LEFT JOIN public.pharmacies p ON p.tenant_id = $1 AND p.code = r.pharmacy_code
           WHERE ($2 = '' OR r.pharmacy_code ILIKE $2 OR r.return_number ILIKE $2 OR r.reason ILIKE $2 OR p.name ILIKE $2)
           ORDER BY r.return_date DESC, r.remote_id DESC
           LIMIT $3 OFFSET $4`,
          [tenantId, searchPattern, limit, offset]
        );
        rows = dataRes.rows;
        break;
      }

      case 'ledger': {
        // Check if direct ledger_entries has data
        const directCountRes = await query(
          `SELECT COUNT(*)::int as count FROM ${schema}.ledger_entries`
        );
        const hasDirectLedger = (directCountRes.rows[0]?.count || 0) > 0;

        if (hasDirectLedger) {
          const countRes = await query(
            `SELECT COUNT(*)::int as count 
             FROM ${schema}.ledger_entries l
             LEFT JOIN public.pharmacies p ON p.tenant_id = $1 AND p.code = l.pharmacy_code
             WHERE ($2 = '' OR l.pharmacy_code ILIKE $2 OR l.doc_number ILIKE $2 OR l.description ILIKE $2 OR p.name ILIKE $2)`,
            [tenantId, searchPattern]
          );
          totalCount = countRes.rows[0]?.count || 0;

          const dataRes = await query(
            `SELECT 
               l.id, l.remote_id, l.pharmacy_code, 
               COALESCE(p.name, 'غير متوفر بالدليل') as pharmacy_name,
               l.entry_date, l.doc_type, l.doc_number, l.debit, l.credit, l.balance, l.description
             FROM ${schema}.ledger_entries l
             LEFT JOIN public.pharmacies p ON p.tenant_id = $1 AND p.code = l.pharmacy_code
             WHERE ($2 = '' OR l.pharmacy_code ILIKE $2 OR l.doc_number ILIKE $2 OR l.description ILIKE $2 OR p.name ILIKE $2)
             ORDER BY l.entry_date DESC, l.remote_id DESC
             LIMIT $3 OFFSET $4`,
            [tenantId, searchPattern, limit, offset]
          );
          rows = dataRes.rows;
        } else {
          // Unified real-time movements: Invoices (Debit) + Cash Receipts (Credit) + Returns (Credit)
          const countRes = await query(
            `WITH unified_movements AS (
               SELECT i.pharmacy_code, i.invoice_number as doc_number, 'فاتورة مبيعات' as doc_type, 'فاتورة مبيعات أدوية' as description, COALESCE(p.name, 'غير متوفر بالدليل') as pharmacy_name
               FROM ${schema}.invoices i
               LEFT JOIN public.pharmacies p ON p.tenant_id = $1 AND p.code = i.pharmacy_code
               UNION ALL
               SELECT r.pharmacy_code, r.receipt_number as doc_number, 'سند قبض نقدي' as doc_type, COALESCE(r.notes, 'سند تحصيل نقدي') as description, COALESCE(p.name, 'غير متوفر بالدليل') as pharmacy_name
               FROM ${schema}.cash_receipts r
               LEFT JOIN public.pharmacies p ON p.tenant_id = $1 AND p.code = r.pharmacy_code
               UNION ALL
               SELECT ret.pharmacy_code, ret.return_number as doc_number, 'مرتجع مبيعات' as doc_type, COALESCE(ret.reason, 'مرتجع مبيعات أدوية') as description, COALESCE(p.name, 'غير متوفر بالدليل') as pharmacy_name
               FROM ${schema}.returns ret
               LEFT JOIN public.pharmacies p ON p.tenant_id = $1 AND p.code = ret.pharmacy_code
             )
             SELECT COUNT(*)::int as count
             FROM unified_movements
             WHERE ($2 = '' OR pharmacy_code ILIKE $2 OR doc_number ILIKE $2 OR description ILIKE $2 OR pharmacy_name ILIKE $2 OR doc_type ILIKE $2)`,
            [tenantId, searchPattern]
          );
          totalCount = countRes.rows[0]?.count || 0;

          const dataRes = await query(
            `WITH raw_movements AS (
               SELECT 
                 i.id::text as id,
                 'INV-' || i.remote_id as remote_id,
                 i.pharmacy_code,
                 COALESCE(p.name, 'غير متوفر بالدليل') as pharmacy_name,
                 i.invoice_date as entry_date,
                 'فاتورة مبيعات' as doc_type,
                 i.invoice_number as doc_number,
                 i.net_amount as debit,
                 0.00 as credit,
                 'فاتورة مبيعات أدوية' as description
               FROM ${schema}.invoices i
               LEFT JOIN public.pharmacies p ON p.tenant_id = $1 AND p.code = i.pharmacy_code

               UNION ALL

               SELECT 
                 r.id::text as id,
                 'RCP-' || r.remote_id as remote_id,
                 r.pharmacy_code,
                 COALESCE(p.name, 'غير متوفر بالدليل') as pharmacy_name,
                 r.receipt_date as entry_date,
                 'سند قبض نقدي' as doc_type,
                 r.receipt_number as doc_number,
                 0.00 as debit,
                 r.amount as credit,
                 COALESCE(r.notes, 'سند تحصيل نقدي') as description
               FROM ${schema}.cash_receipts r
               LEFT JOIN public.pharmacies p ON p.tenant_id = $1 AND p.code = r.pharmacy_code

               UNION ALL

               SELECT 
                 ret.id::text as id,
                 'RET-' || ret.remote_id as remote_id,
                 ret.pharmacy_code,
                 COALESCE(p.name, 'غير متوفر بالدليل') as pharmacy_name,
                 ret.return_date as entry_date,
                 'مرتجع مبيعات' as doc_type,
                 ret.return_number as doc_number,
                 0.00 as debit,
                 ret.net_amount as credit,
                 COALESCE(ret.reason, 'مرتجع مبيعات أدوية') as description
               FROM ${schema}.returns ret
               LEFT JOIN public.pharmacies p ON p.tenant_id = $1 AND p.code = ret.pharmacy_code
             ),
             calculated_movements AS (
               SELECT 
                 id, remote_id, pharmacy_code, pharmacy_name, entry_date, doc_type, doc_number, debit, credit,
                 SUM(debit - credit) OVER (PARTITION BY pharmacy_code ORDER BY entry_date ASC, remote_id ASC) as balance,
                 description
               FROM raw_movements
             )
             SELECT * FROM calculated_movements
             WHERE ($2 = '' OR pharmacy_code ILIKE $2 OR doc_number ILIKE $2 OR description ILIKE $2 OR pharmacy_name ILIKE $2 OR doc_type ILIKE $2)
             ORDER BY entry_date DESC, remote_id DESC
             LIMIT $3 OFFSET $4`,
            [tenantId, searchPattern, limit, offset]
          );
          rows = dataRes.rows;
        }
        break;
      }

      default:
        return NextResponse.json({ success: false, error: 'Invalid table requested' }, { status: 400 });
    }

    // Calculate Financial Totals / Summary for the pharmacy (or overall warehouse)
    let summary = {
      total_invoices_amount: 0,
      total_invoices_count: 0,
      total_returns_amount: 0,
      total_returns_count: 0,
      total_receipts_amount: 0,
      total_receipts_count: 0,
      net_balance: 0,
      balance_type: 'debit' as 'debit' | 'credit',
      matched_pharmacy: null as any,
    };

    try {
      let matchedCode = '';
      if (search) {
        const pharmRes = await query(
          `SELECT code, name, phone, address 
           FROM public.pharmacies 
           WHERE tenant_id = $1 AND (code ILIKE $2 OR name ILIKE $2) 
           LIMIT 1`,
          [tenantId, searchPattern]
        );
        if (pharmRes.rows.length > 0) {
          summary.matched_pharmacy = pharmRes.rows[0];
          matchedCode = pharmRes.rows[0].code;
        }
      }

      const summaryRes = await query(
        `SELECT 
          COALESCE((SELECT SUM(net_amount) FROM ${schema}.invoices WHERE ($1 = '' OR pharmacy_code ILIKE $1 OR ($2 != '' AND pharmacy_code = $2))), 0)::float as inv_amount,
          COALESCE((SELECT COUNT(*) FROM ${schema}.invoices WHERE ($1 = '' OR pharmacy_code ILIKE $1 OR ($2 != '' AND pharmacy_code = $2))), 0)::int as inv_count,
          COALESCE((SELECT SUM(net_amount) FROM ${schema}.returns WHERE ($1 = '' OR pharmacy_code ILIKE $1 OR ($2 != '' AND pharmacy_code = $2))), 0)::float as ret_amount,
          COALESCE((SELECT COUNT(*) FROM ${schema}.returns WHERE ($1 = '' OR pharmacy_code ILIKE $1 OR ($2 != '' AND pharmacy_code = $2))), 0)::int as ret_count,
          COALESCE((SELECT SUM(amount) FROM ${schema}.cash_receipts WHERE ($1 = '' OR pharmacy_code ILIKE $1 OR ($2 != '' AND pharmacy_code = $2))), 0)::float as rcpt_amount,
          COALESCE((SELECT COUNT(*) FROM ${schema}.cash_receipts WHERE ($1 = '' OR pharmacy_code ILIKE $1 OR ($2 != '' AND pharmacy_code = $2))), 0)::int as rcpt_count`,
        [searchPattern, matchedCode]
      );

      if (summaryRes.rows.length > 0) {
        const s = summaryRes.rows[0];
        const invAmt = Number(s.inv_amount || 0);
        const retAmt = Number(s.ret_amount || 0);
        const rcptAmt = Number(s.rcpt_amount || 0);
        const netBal = invAmt - retAmt - rcptAmt;

        summary.total_invoices_amount = invAmt;
        summary.total_invoices_count = Number(s.inv_count || 0);
        summary.total_returns_amount = retAmt;
        summary.total_returns_count = Number(s.ret_count || 0);
        summary.total_receipts_amount = rcptAmt;
        summary.total_receipts_count = Number(s.rcpt_count || 0);
        summary.net_balance = netBal;
        summary.balance_type = netBal >= 0 ? 'debit' : 'credit';
      }
    } catch (sumErr: any) {
      console.warn('Could not compute financial summary:', sumErr.message);
    }

    return NextResponse.json({
      success: true,
      tenant,
      table,
      totalCount,
      limit,
      offset,
      summary,
      rows,
    });
  } catch (error: any) {
    console.error('Error fetching table data:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
