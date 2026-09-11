import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

// GET /api/billing - list subscriptions with tenant and pharmacy names
export async function GET() {
  try {
    const result = await query(`
      SELECT 
        s.id,
        s.tenant_id,
        t.name AS tenant_name,
        t.slug AS tenant_slug,
        s.pharmacy_id,
        p.name AS pharmacy_name,
        p.code AS pharmacy_code,
        p.phone AS pharmacy_phone,
        s.plan_type,
        s.status,
        s.start_date,
        s.end_date,
        s.receipt_url,
        s.receipt_ref,
        s.notes,
        s.created_at,
        s.updated_at
      FROM public.subscriptions s
      JOIN public.tenants t ON t.id = s.tenant_id
      LEFT JOIN public.pharmacies p ON p.id = s.pharmacy_id
      ORDER BY 
        CASE WHEN s.status = 'pending_approval' THEN 0 ELSE 1 END,
        s.created_at DESC
    `);

    return NextResponse.json({ success: true, subscriptions: result.rows });
  } catch (error: any) {
    console.error('Error fetching subscriptions:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PATCH /api/billing - approve or reject subscription
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status, notes } = body;

    if (!id || !['active', 'rejected'].includes(status)) {
      return NextResponse.json({ success: false, error: 'Valid id and status (active/rejected) required' }, { status: 400 });
    }

    let queryText = '';
    let params = [];

    if (status === 'active') {
      // Approve: set active and renew end_date for 30 days from now (or end_date if in future)
      queryText = `
        UPDATE public.subscriptions
        SET status = 'active',
            start_date = CURRENT_DATE,
            end_date = CURRENT_DATE + INTERVAL '30 days',
            notes = COALESCE($2, notes),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `;
      params = [id, notes || 'Approved by Super Admin'];
    } else {
      // Reject
      queryText = `
        UPDATE public.subscriptions
        SET status = 'rejected',
            notes = COALESCE($2, 'Rejected by Super Admin'),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `;
      params = [id, notes];
    }

    const result = await query(queryText, params);

    if (result.rowCount === 0) {
      return NextResponse.json({ success: false, error: 'Subscription not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      subscription: result.rows[0],
      message: `Subscription marked as ${status}`
    });
  } catch (error: any) {
    console.error('Error updating subscription:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
