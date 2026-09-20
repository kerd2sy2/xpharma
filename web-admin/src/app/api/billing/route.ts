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



// GET /api/billing - list all subscriptions (Kashier & InstaPay) with fallback joins & countdown
export async function GET() {
  try {
    // 1. Ensure table columns exist
    await ensureColumns();

    // 2. Query available columns dynamically to avoid any missing-column crash
    const colRes = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'subscriptions'
    `);
    const cols = new Set(colRes.rows.map((r: any) => r.column_name));

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
        LEAST(30, GREATEST(0, (COALESCE(s.end_date, (COALESCE(s.start_date, s.created_at::date, CURRENT_DATE) + INTERVAL '30 days')::date) - CURRENT_DATE))) AS days_left,
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

    let rowsToProcess = result.rows;

    // Ensure calculated days_left is attached accurately (strictly capped at 30, no timezone distortion)
    const now = new Date();
    const utcNow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const enriched = rowsToProcess.map((row: any) => {
      let diffDays = 30;
      if (row.end_date) {
        const end = new Date(row.end_date);
        const utcEnd = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
        diffDays = Math.ceil((utcEnd - utcNow) / (1000 * 60 * 60 * 24));
      }
      const daysLeft = row.status === 'active'
        ? Math.min(30, Math.max(0, diffDays))
        : (row.status === 'pending_approval' ? 30 : 0);
      return {
        ...row,
        days_left: daysLeft,
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
      plan_type = '3 صيدليات',
      amount = 0,
      payment_method = 'admin_grant',
      status = 'active',
      duration_days = 30,
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

    const finalOrderId = order_id || `XPH-ADMIN-${Date.now()}`;
    const daysNum = Math.max(1, Number(duration_days) || 30);

    // Idempotency: avoid duplicate rows for the same order_id
    if (order_id) {
      const existing = await query(
        `SELECT id, status FROM public.subscriptions WHERE order_id = $1 LIMIT 1`,
        [order_id]
      );
      if (existing.rows.length > 0) {
        await query(
          `UPDATE public.subscriptions SET status = 'active', updated_at = NOW() WHERE id = $1`,
          [existing.rows[0].id]
        );
        return NextResponse.json({
          success: true,
          subscription: existing.rows[0],
          message: 'Payment already recorded (idempotent)',
        });
      }
    }

    if (user_email && status === 'active') {
      await query(
        `UPDATE public.subscriptions SET status = 'superseded', updated_at = NOW() WHERE LOWER(user_email) = LOWER($1) AND status = 'active'`,
        [user_email]
      );
    }

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
          CURRENT_DATE + ($16 || 30) * INTERVAL '1 day',
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
        String(plan_type || '3 صيدليات'),
        Number(amount) || 0,
        payment_method,
        status,
        finalOrderId,
        transaction_id || null,
        card_brand || null,
        masked_card || null,
        receipt_ref || transaction_id || finalOrderId,
        receipt_url || null,
        notes || (payment_method === 'admin_grant' ? 'اشتراك ممنوح بقرار الإدارة' : `دفع إلكتروني: ${finalOrderId}`),
        daysNum,
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
          $2, $3, $4, $5, $6,
          CURRENT_DATE,
          CURRENT_DATE + ($7 || 30) * INTERVAL '1 day',
          NOW(),
          NOW()
        )
        RETURNING *
      `;
      params = [
        tenant_id || null,
        String(plan_type || '3 صيدليات'),
        status,
        receipt_ref || transaction_id || finalOrderId,
        receipt_url || null,
        notes || `دفع إلكتروني: ${user_email || ''} - ${amount || 0} ج.م`,
        daysNum,
      ];
    }

    const result = await query(queryText, params);

    // Also update public.users table if email is present
    if (user_email && status === 'active') {
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
               subscription_expires_at = NOW() + ($3 || 30) * INTERVAL '1 day',
               updated_at = NOW() 
           WHERE LOWER(email) = LOWER($2)`,
          [planCount, user_email, daysNum]
        );
      } catch (userUpdateErr) {
        console.warn('Failed to sync user table subscription:', userUpdateErr);
      }
    }

    return NextResponse.json({
      success: true,
      subscription: result.rows[0],
      message: 'تم تسجيل وتفعيل الاشتراك بنجاح',
    });
  } catch (error: any) {
    console.error('Error recording subscription payment:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}


// PATCH /api/billing - manage subscription lifecycle (approve, reject, change plan, pause, resume, cancel, extend)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      action,
      status,
      plan_type,
      days,
      renew_cycle,
      amount,
      notes,
    } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Subscription ID is required' }, { status: 400 });
    }

    // Fetch existing subscription
    const existingRes = await query(`SELECT * FROM public.subscriptions WHERE id = $1 LIMIT 1`, [id]);
    if (existingRes.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Subscription not found' }, { status: 404 });
    }
    const currentSub = existingRes.rows[0];
    const targetEmail = currentSub.user_email;
    const targetUserId = currentSub.user_id;

    let updatedSub = currentSub;
    let message = 'تم التحديث بنجاح';

    // 1. CHANGE PLAN (1, 2, 3, 4, 5 pharmacies)
    if (action === 'change_plan' || plan_type) {
      const newPlanStr = String(plan_type || currentSub.plan_type || '3 صيدليات');
      let planCount = 3;
      const match = newPlanStr.match(/(\d+)/);
      if (match) planCount = parseInt(match[1], 10);

      const daysNum = Number(days) || 30;
      let dateUpdateSql = '';
      let dateParams: any[] = [];

      if (renew_cycle) {
        dateUpdateSql = `, start_date = CURRENT_DATE, end_date = CURRENT_DATE + ($${dateParams.length + 5}::int) * INTERVAL '1 day'`;
        dateParams.push(daysNum);
      }

      const updateQuery = `
        UPDATE public.subscriptions
        SET plan_type = $2,
            amount = COALESCE($3, amount),
            notes = COALESCE($4, notes),
            status = 'active',
            updated_at = NOW()
            ${dateUpdateSql}
        WHERE id = $1
        RETURNING *
      `;
      const res = await query(updateQuery, [id, newPlanStr, amount !== undefined ? Number(amount) : null, notes || `تعديل الباقة إلى ${newPlanStr} من قبل الإدارة`, ...dateParams]);
      updatedSub = res.rows[0];

      if (targetEmail || targetUserId) {
        let expireSql = '';
        let expireParams: any[] = [];
        if (renew_cycle) {
          expireSql = `, subscription_expires_at = NOW() + ($${expireParams.length + 4}::int) * INTERVAL '1 day'`;
          expireParams.push(daysNum);
        }
        await query(
          `UPDATE public.users 
           SET subscription_plan = $1, 
               is_active = TRUE,
               is_subscription_active = TRUE,
               updated_at = NOW()
               ${expireSql}
           WHERE (LOWER(email) = LOWER($2) AND $2 <> '') OR id = $3`,
          [planCount, targetEmail || '', targetUserId || null, ...expireParams]
        );
      }
      message = `تم تغيير الباقة إلى ${newPlanStr} وتحديث الحساب فورياً`;
    }

    // 2. PAUSE / FREEZE SUBSCRIPTION
    else if (action === 'pause' || status === 'paused') {
      const res = await query(
        `UPDATE public.subscriptions
         SET status = 'paused',
             notes = COALESCE($2, notes),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, notes || 'تم إيقاف الاشتراك مؤقتاً بواسطة الإدارة']
      );
      updatedSub = res.rows[0];

      if (targetEmail || targetUserId) {
        await query(
          `UPDATE public.users 
           SET is_subscription_active = FALSE,
               updated_at = NOW()
           WHERE (LOWER(email) = LOWER($1) AND $1 <> '') OR id = $2`,
          [targetEmail || '', targetUserId || null]
        );
      }
      message = 'تم إيقاف الاشتراك مؤقتاً وتجميده في تطبيق المستخدم';
    }

    // 3. RESUME / UNFREEZE SUBSCRIPTION
    else if (action === 'resume' || (status === 'active' && currentSub.status === 'paused')) {
      const res = await query(
        `UPDATE public.subscriptions
         SET status = 'active',
             notes = COALESCE($2, notes),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, notes || 'تم استئناف تفعيل الاشتراك بواسطة الإدارة']
      );
      updatedSub = res.rows[0];

      let planCount = 3;
      const match = String(updatedSub.plan_type || '').match(/(\d+)/);
      if (match) planCount = parseInt(match[1], 10);

      if (targetEmail || targetUserId) {
        await query(
          `UPDATE public.users 
           SET is_subscription_active = TRUE,
               subscription_plan = $1,
               updated_at = NOW()
           WHERE (LOWER(email) = LOWER($2) AND $2 <> '') OR id = $3`,
          [planCount, targetEmail || '', targetUserId || null]
        );
      }
      message = 'تم استئناف الاشتراك وتفعيله في تطبيق المستخدم بنجاح';
    }

    // 4. CANCEL SUBSCRIPTION
    else if (action === 'cancel' || status === 'cancelled') {
      const res = await query(
        `UPDATE public.subscriptions
         SET status = 'cancelled',
             notes = COALESCE($2, notes),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, notes || 'تم إلغاء الاشتراك بالكامل بواسطة الإدارة']
      );
      updatedSub = res.rows[0];

      if (targetEmail || targetUserId) {
        await query(
          `UPDATE public.users 
           SET is_subscription_active = FALSE,
               subscription_plan = 0,
               updated_at = NOW()
           WHERE (LOWER(email) = LOWER($1) AND $1 <> '') OR id = $2`,
          [targetEmail || '', targetUserId || null]
        );
      }
      message = 'تم إلغاء الاشتراك وإعادة حساب المستخدم للباقة المجانية (0 صيدليات مدفوعة)';
    }

    // 5. EXTEND DURATION (add days)
    else if (action === 'extend') {
      const addDays = Math.max(1, Number(days) || 30);
      const res = await query(
        `UPDATE public.subscriptions
         SET end_date = GREATEST(CURRENT_DATE, end_date) + ($2::int) * INTERVAL '1 day',
             status = 'active',
             notes = COALESCE($3, notes),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, addDays, notes || `تمديد الاشتراك بمقدار ${addDays} يوماً من قبل الإدارة`]
      );
      updatedSub = res.rows[0];

      if (targetEmail || targetUserId) {
        await query(
          `UPDATE public.users 
           SET is_subscription_active = TRUE,
               subscription_expires_at = GREATEST(NOW(), subscription_expires_at) + ($2::int) * INTERVAL '1 day',
               updated_at = NOW()
           WHERE (LOWER(email) = LOWER($1) AND $1 <> '') OR id = $3`,
          [targetEmail || '', addDays, targetUserId || null]
        );
      }
      message = `تم تمديد صلاحية الاشتراك بمقدار ${addDays} يوماً إضافية بنجاح`;
    }

    // 6. APPROVE PENDING
    else if (status === 'active' || action === 'approve') {
      const res = await query(
        `UPDATE public.subscriptions
         SET status = 'active',
             start_date = CURRENT_DATE,
             end_date = CURRENT_DATE + INTERVAL '30 days',
             notes = COALESCE($2, notes),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, notes || 'تم الاعتماد والتفعيل عبر لوحة الإدارة']
      );
      updatedSub = res.rows[0];

      let planCount = 3;
      const match = String(updatedSub.plan_type || '').match(/(\d+)/);
      if (match) planCount = parseInt(match[1], 10);

      if (targetEmail || targetUserId) {
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
      }
      message = 'تم اعتماد وتفعيل الاشتراك بنجاح (30 يوماً)';
    }

    // 7. REJECT PENDING
    else if (status === 'rejected' || action === 'reject') {
      const res = await query(
        `UPDATE public.subscriptions
         SET status = 'rejected',
             notes = COALESCE($2, 'تم الرفض بواسطة الإدارة'),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, notes]
      );
      updatedSub = res.rows[0];
      message = 'تم رفض الطلب بنجاح';
    }

    return NextResponse.json({
      success: true,
      subscription: updatedSub,
      message,
    });
  } catch (error: any) {
    console.error('Error updating subscription:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

