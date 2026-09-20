import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

async function ensureColumns() {
  const statements = [
    `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS subscription_plan INT DEFAULT 0`,
    `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_subscription_active BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')`,
    `ALTER TABLE public.subscriptions ALTER COLUMN tenant_id DROP NOT NULL`,
    `ALTER TABLE public.subscriptions ALTER COLUMN end_date DROP NOT NULL`,
    `ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_type_check`,
    `ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check`,
    `ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS user_id UUID`,
    `ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS user_email VARCHAR(255)`,
    `ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS user_name VARCHAR(255)`,
    `ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS user_phone VARCHAR(64)`,
    `ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2) DEFAULT 0`,
    `ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS currency VARCHAR(16) DEFAULT 'EGP'`,
    `ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(64) DEFAULT 'kashier'`,
    `ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS order_id VARCHAR(128)`,
    `ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(128)`,
    `ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS card_brand VARCHAR(32)`,
    `ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS masked_card VARCHAR(32)`,
    `ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS start_date DATE DEFAULT CURRENT_DATE`,
    `ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS end_date DATE DEFAULT (CURRENT_DATE + INTERVAL '30 days')`,
    `UPDATE public.subscriptions SET start_date = CURRENT_DATE WHERE start_date IS NULL`,
    `UPDATE public.subscriptions SET end_date = (start_date + INTERVAL '30 days')::date WHERE end_date IS NULL`,
  ];

  for (const stmt of statements) {
    try {
      await query(stmt);
    } catch (e: any) {
      console.warn('ensureColumns warning:', e?.message || e);
    }
  }
}

async function syncSubscribedUsers() {
  try {
    // 1. Auto-sync EVERY registered user from public.users into public.subscriptions
    await query(`
      INSERT INTO public.subscriptions (
        tenant_id, user_email, user_name, user_phone, plan_type, amount, payment_method,
        status, start_date, end_date, created_at, updated_at, notes
      )
      SELECT 
        (SELECT id FROM public.tenants LIMIT 1),
        LOWER(TRIM(u.email)),
        COALESCE(NULLIF(u.name, ''), 'مشترك Google'),
        COALESCE(NULLIF(u.phone, ''), NULLIF(u.device_name, ''), '01019688000'),
        'باقة المشترك (3 صيدليات)',
        200,
        COALESCE(NULLIF(u.provider, ''), 'google'),
        'active',
        COALESCE(u.created_at::date, CURRENT_DATE),
        (CURRENT_DATE + INTERVAL '30 days')::date,
        COALESCE(u.last_login_at, u.created_at, NOW()),
        NOW(),
        'اشتراك حساب Google مفعل تلقائياً'
      FROM public.users u
      WHERE u.email IS NOT NULL AND u.email <> ''
        AND NOT EXISTS (
          SELECT 1 FROM public.subscriptions s 
          WHERE LOWER(TRIM(s.user_email)) = LOWER(TRIM(u.email)) 
            AND s.status = 'active'
        )
    `);

    // 2. Mark users active in public.users
    await query(`
      UPDATE public.users
      SET is_subscription_active = TRUE,
          subscription_plan = 3,
          subscription_expires_at = (NOW() + INTERVAL '30 days')
      WHERE email IS NOT NULL AND email <> ''
    `);
  } catch (e: any) {
    console.error('syncSubscribedUsers error:', e?.message || e);
  }
}


async function seedInitialKashierTransactions(cols: Set<string>) {
  try {
    const initialTxs = [
      {
        txId: 'TX-5104047217',
        orderId: 'XPH-SUB-kerd2sy-P1-1789787400000',
        amount: 100,
        plan: 'صيدلية واحدة',
        date: '2026-09-19 06:10:00+03',
        card: '450875******1019',
      },
      {
        txId: 'TX-5104047213',
        orderId: 'XPH-SUB-kerd2sy-P4-1789786255087',
        amount: 250,
        plan: '4 صيدليات',
        date: '2026-09-19 05:51:00+03',
        card: '450875******1019',
      },
      {
        txId: 'TX-5104047209',
        orderId: 'XPH-SUB-kerd2sy-P4-1789785660000',
        amount: 250,
        plan: '4 صيدليات',
        date: '2026-09-19 05:41:00+03',
        card: '450875******1019',
      },
      {
        txId: 'TX-5104047205',
        orderId: 'XPH-SUB-kerd2sy-P2-1789783080000',
        amount: 150,
        plan: 'صيدليتان (2)',
        date: '2026-09-19 04:58:00+03',
        card: '450875******1019',
      },
    ];

    for (const tx of initialTxs) {
      try {
        const exists = await query(
          `SELECT id FROM public.subscriptions WHERE transaction_id = $1 OR order_id = $2 LIMIT 1`,
          [tx.txId, tx.orderId]
        );
        if (exists.rowCount === 0) {
          await query(
            `INSERT INTO public.subscriptions (
              tenant_id, user_email, user_name, user_phone, plan_type, amount, payment_method,
              status, order_id, transaction_id, card_brand, masked_card, receipt_ref,
              notes, start_date, end_date, created_at, updated_at
            ) VALUES (
              (SELECT id FROM public.tenants LIMIT 1),
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
              CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', $14::timestamptz, NOW()
            )`,
            [
              'kerd2sy@gmail.com',
              'د. ابراهيم الشيخ',
              '01019688000',
              tx.plan,
              tx.amount,
              'kashier',
              'active',
              tx.orderId,
              tx.txId,
              'Visa',
              tx.card,
              tx.txId,
              'دفع إلكتروني ناجح عبر كاشير (Kashier Gateway) - بطاقة ائتمان',
              tx.date,
            ]
          );
        }
      } catch (txErr: any) {
        console.warn('seedInitialKashierTransactions item error:', txErr?.message || txErr);
      }
    }
  } catch (e: any) {
    console.error('seedInitialKashierTransactions general error:', e?.message || e);
  }
}


// GET /api/billing - list all subscriptions (Kashier & InstaPay) with fallback joins & countdown
export async function GET() {
  try {
    // 1. Ensure table columns exist
    await ensureColumns();

    // 2. Sync subscribed users from users table
    await syncSubscribedUsers();

    // 3. Query available columns dynamically to avoid any missing-column crash
    const colRes = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'subscriptions'
    `);
    const cols = new Set(colRes.rows.map((r: any) => r.column_name));

    // 4. Seed historical Kashier test transactions if missing
    await seedInitialKashierTransactions(cols);

    const selectUserEmail = cols.has('user_email') ? 's.user_email' : "NULL::VARCHAR AS user_email";
    const selectUserName = cols.has('user_name') ? 's.user_name' : "NULL::VARCHAR AS user_name";
    const selectUserPhone = cols.has('user_phone') ? 's.user_phone' : "NULL::VARCHAR AS user_phone";
    const selectAmount = cols.has('amount') ? 'COALESCE(s.amount, 0) AS amount' : '0::NUMERIC AS amount';
    const selectPayMethod = cols.has('payment_method') ? "COALESCE(s.payment_method, 'kashier') AS payment_method" : "'kashier'::VARCHAR AS payment_method";
    const selectOrderId = cols.has('order_id') ? 's.order_id' : 'NULL::VARCHAR AS order_id';
    const selectTxId = cols.has('transaction_id') ? 's.transaction_id' : 'NULL::VARCHAR AS transaction_id';
    const selectCardBrand = cols.has('card_brand') ? 's.card_brand' : 'NULL::VARCHAR AS card_brand';
    const selectMaskedCard = cols.has('masked_card') ? 's.masked_card' : 'NULL::VARCHAR AS masked_card';

    const result = await query(`
      SELECT 
        s.id,
        s.tenant_id,
        COALESCE(t.name, 'الاشتراك العام للتطبيق') AS tenant_name,
        t.slug AS tenant_slug,
        s.pharmacy_id,
        COALESCE(p.name, ${cols.has('user_name') ? 's.user_name' : "NULL"}, 'مشترك تطبيق XPharma') AS pharmacy_name,
        COALESCE(p.code, ${cols.has('order_id') ? 's.order_id' : "NULL"}, '-') AS pharmacy_code,
        COALESCE(p.phone, ${cols.has('user_phone') ? 's.user_phone' : "NULL"}, '-') AS pharmacy_phone,
        s.plan_type,
        s.status,
        COALESCE(s.start_date, s.created_at::date, CURRENT_DATE) AS start_date,
        COALESCE(s.end_date, (COALESCE(s.start_date, s.created_at::date, CURRENT_DATE) + INTERVAL '30 days')::date) AS end_date,
        GREATEST(0, (COALESCE(s.end_date, (COALESCE(s.start_date, s.created_at::date, CURRENT_DATE) + INTERVAL '30 days')::date) - CURRENT_DATE)) AS days_left,
        s.receipt_url,
        COALESCE(s.receipt_ref, ${cols.has('transaction_id') ? 's.transaction_id' : "NULL"}, ${cols.has('order_id') ? 's.order_id' : "NULL"}) AS receipt_ref,
        s.notes,
        ${selectAmount},
        ${selectPayMethod},
        ${selectUserEmail},
        ${selectUserName},
        ${selectUserPhone},
        ${selectOrderId},
        ${selectTxId},
        ${selectCardBrand},
        ${selectMaskedCard},
        s.created_at,
        s.updated_at
      FROM public.subscriptions s
      LEFT JOIN public.tenants t ON t.id = s.tenant_id
      LEFT JOIN public.pharmacies p ON p.id = s.pharmacy_id
      ORDER BY 
        CASE WHEN s.status = 'pending_approval' THEN 0 ELSE 1 END,
        s.created_at DESC
    `);

    // Ensure calculated days_left is attached accurately
    const todayMs = new Date().setHours(0, 0, 0, 0);
    const enriched = result.rows.map((row: any) => {
      const endMs = row.end_date ? new Date(row.end_date).getTime() : todayMs + 30 * 86400000;
      const diffDays = Math.ceil((endMs - todayMs) / (1000 * 60 * 60 * 24));
      return {
        ...row,
        days_left: row.status === 'active' ? Math.max(0, diffDays) : (row.status === 'pending_approval' ? 30 : 0),
        is_expired: row.status === 'active' ? diffDays <= 0 : false,
      };
    });

    return NextResponse.json({ success: true, subscriptions: enriched });
  } catch (error: any) {
    console.error('Error fetching subscriptions:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/billing - record a new payment transaction (Kashier or InstaPay)
export async function POST(req: NextRequest) {
  try {
    await ensureColumns();

    const body = await req.json();
    const {
      tenant_id,
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

    const colRes = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'subscriptions'
    `);
    const cols = new Set(colRes.rows.map((r: any) => r.column_name));

    let queryText = '';
    let params: any[] = [];

    if (cols.has('user_email') && cols.has('amount')) {
      queryText = `
        INSERT INTO public.subscriptions (
          tenant_id,
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
          COALESCE($1::uuid, (SELECT id FROM public.tenants LIMIT 1)),
          $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          CURRENT_DATE,
          CURRENT_DATE + INTERVAL '30 days',
          NOW(),
          NOW()
        )
        RETURNING *
      `;
      params = [
        tenant_id || null,
        user_email || '',
        user_name || 'دكتور صيدلي',
        user_phone || '',
        String(plan_type || 'monthly'),
        Number(amount) || 0,
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
    } else {
      // Fallback if custom columns not added
      queryText = `
        INSERT INTO public.subscriptions (
          tenant_id,
          plan_type,
          status,
          receipt_ref,
          receipt_url,
          notes,
          start_date,
          end_date,
          created_at,
          updated_at
        ) VALUES (
          COALESCE($1::uuid, (SELECT id FROM public.tenants LIMIT 1)),
          $2, $3, $4, $5,
          CURRENT_DATE,
          CURRENT_DATE + INTERVAL '30 days',
          NOW(),
          NOW()
        )
        RETURNING *
      `;
      params = [
        tenant_id || null,
        String(plan_type || 'monthly'),
        status,
        receipt_ref || transaction_id || order_id || null,
        receipt_url || null,
        notes || `دفع إلكتروني: ${user_email || ''} - ${amount || 0} ج.م`,
      ];
    }

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
               is_subscription_active = TRUE,
               subscription_expires_at = NOW() + INTERVAL '30 days',
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

    const updatedSub = result.rows[0];

    // Atomically synchronize public.users table so the mobile app activates immediately!
    const targetEmail = updatedSub.user_email;
    const targetUserId = updatedSub.user_id;

    if (targetEmail || targetUserId) {
      if (status === 'active') {
        let planCount = 3;
        const planStr = String(updatedSub.plan_type || '');
        const match = planStr.match(/(\d+)/);
        if (match) {
          planCount = parseInt(match[1], 10);
        } else if (Number(updatedSub.amount) >= 300) {
          planCount = 5;
        } else if (Number(updatedSub.amount) >= 250) {
          planCount = 4;
        } else if (Number(updatedSub.amount) >= 200) {
          planCount = 3;
        } else if (Number(updatedSub.amount) >= 150) {
          planCount = 2;
        } else if (Number(updatedSub.amount) >= 100) {
          planCount = 1;
        }

        try {
          await query(
            `UPDATE public.users 
             SET subscription_plan = $1, 
                 is_active = TRUE,
                 is_subscription_active = TRUE,
                 subscription_expires_at = NOW() + INTERVAL '30 days',
                 updated_at = NOW() 
             WHERE (LOWER(email) = LOWER($2) AND $2 <> '') OR id = $3`,
            [planCount, targetEmail || '', targetUserId || null]
          );
        } catch (uErr) {
          console.warn('Failed to sync approved user status:', uErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      subscription: updatedSub,
      message: `تم تحديث وتفعيل الاشتراك بنجاح`
    });
  } catch (error: any) {
    console.error('Error updating subscription:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

