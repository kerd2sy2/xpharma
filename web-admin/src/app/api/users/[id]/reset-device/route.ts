// ============================================================
// Route Handler — Reset / Unlink User Device (PostgreSQL)
// ============================================================

import { query } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const res = await query(
      `UPDATE public.users 
       SET device_id = NULL, 
           device_name = NULL, 
           updated_at = NOW()
       WHERE id::text = $1
       RETURNING id, name, email, role, is_active, updated_at`,
      [id]
    );

    if (res.rowCount === 0) {
      return NextResponse.json({ success: false, error: 'المستخدم غير موجود' }, { status: 404 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'تم فك ربط الجهاز بنجاح. يمكن للعميل الآن تسجيل الدخول من هاتفه الجديد فوراً.',
      data: res.rows[0]
    });
  } catch (error: any) {
    console.error('Error in POST /api/users/[id]/reset-device:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
