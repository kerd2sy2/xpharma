import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

// GET /api/billing - list all subscriptions (Kashier & InstaPay) with fallback joins
export async function GET() {
  try {
    // Ensure table columns exist safely if migrations haven't run yet
    try {
      await query(`
        ALTER TABLE public.subscriptions ALTER COLUMN tenant_id DROP NOT NULL;
        ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_type_check;
        ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
        ALTER TABLE public.subscriptions 
          ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
          ADD COLUMN IF NOT EXISTS user_email VARCHAR(255),
          ADD COLUMN IF NOT EXISTS user_name VARCHAR(255),
          ADD COLUMN IF NOT EXISTS user_phone VARCHAR(64),
          ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS currency VARCHAR(16) DEFAULT 'EGP',
          ADD COLUMN IF NOT EXISTS payment_method VARCHAR(64) DEFAULT 'kashier',
          ADD COLUMN IF NOT EXISTS order_id VARCHAR(128),
          ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(128),
          ADD COLUMN IF NOT EXISTS card_brand VARCHAR(32),
          ADD COLUMN IF NOT EXISTS masked_card VARCHAR(32);
      `);
    } catch {
      // Ignore migration errors if already done or non-fatal
    }

    const result = await query(`
      SELECT 
        s.id,
        s.tenant_id,
        COALESCE(t.name, 'الاشتراك العام للتطبيق') AS tenant_name,
        t.slug AS tenant_slug,
        s.pharmacy_id,
        COALESCE(p.name, s.user_name, 'مشترك تطبيق XPharma') AS pharmacy_name,
        COALESCE(p.code, s.order_id, '-') AS pharmacy_code,
        COALESCE(p.phone, s.user_phone, '-') AS pharmacy_phone,
        s.plan_type,
        s.status,
        s.start_date,
        s.end_date,
        s.receipt_url,
        COALESCE(s.receipt_ref, s.transaction_id, s.order_id) AS receipt_ref,
        s.notes,
        COALESCE(s.amount, 0) AS amount,
        COALESCE(s.payment_method, 'kashier') AS payment_method,
        s.user_email,
        s.user_name,
        s.user_phone,
        s.order_id,
        s.transaction_id,
        s.card_brand,
        s.masked_card,
        s.created_at,
        s.updated_at
      FROM public.subscriptions s
      LEFT JOIN public.tenants t ON t.id = s.tenant_id
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

// POST /api/billing - record a new payment transaction (Kashier or InstaPay)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      user_email,
      user_name,
      user_phone,
      plan_type,
      amount,
      payment_method = 'kashier',
      status = 'active',
      order_id,
      transaction_id,
      card_brand,
      masked_card,
      receipt_ref,
      receipt_url,
      notes,
    } = body;

    const queryText = `
      INSERT INTO public.subscriptions (
        user_email,
        user_name,
        user_phone,
        plan_type,
        amount,
        payment_method,
        status,
        order_id,
        transaction_id,
        card_brand,
        masked_card,
        receipt_ref,
        receipt_url,
        notes,
        start_date,
        end_date,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        CURRENT_DATE,
        CURRENT_DATE + INTERVAL '30 days',
        NOW(),
        NOW()
      )
      RETURNING *
    `;

    const params = [
      user_email || '',
      user_name || 'دكتور صيدلي',
      user_phone || '',
      plan_type || 'monthly',
      amount || 0,
      payment_method,
      status,
      order_id || null,
      transaction_id || null,
      card_brand || null,
      masked_card || null,
      receipt_ref || transaction_id || order_id || null,
      receipt_url || null,
      notes || `دفع إلكتروني عبر كاشير - مرجع: ${transaction_id || order_id || ''}`,
    ];

    const result = await query(queryText, params);

    // Also update public.users table if email is present
    if (user_email) {
      let planCount = 3;
      if (typeof plan_type === 'number') {
        planCount = plan_type;
      } else if (typeof plan_type === 'string') {
        const match = plan_type.match(/(\d+)/);
        if (match) planCount = parseInt(match[1], 10);
      }
      try {
        await query(
          `UPDATE public.users 
           SET subscription_plan = $1, 
               is_active = TRUE,
               updated_at = NOW() 
           WHERE LOWER(email) = LOWER($2)`,
          [planCount, user_email]
        );
      } catch (userUpdateErr) {
        console.warn('Failed to sync user table subscription:', userUpdateErr);
      }
    }

    return NextResponse.json({
      success: true,
      subscription: result.rows[0],
      message: 'Payment recorded successfully',
    });
  } catch (error: any) {
    console.error('Error recording subscription payment:', error);
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
      // Approve: set active and renew end_date for 30 days from now
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
      params = [id, notes || 'تم الاعتماد عبر لوحة الإدارة'];
    } else {
      // Reject
      queryText = `
        UPDATE public.subscriptions
        SET status = 'rejected',
            notes = COALESCE($2, 'تم الرفض بواسطة الإدارة'),
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

