// ============================================================
// Route Handler — Single User (update + delete from PostgreSQL)
// ============================================================

import { query } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, phone, role, is_active } = body;

    const res = await query(
      `UPDATE public.users 
       SET name = COALESCE($1, name), 
           phone = COALESCE($2, phone), 
           role = COALESCE($3, role), 
           is_active = COALESCE($4, is_active),
           updated_at = NOW()
       WHERE id::text = $5
       RETURNING id, name, email, phone, role, is_active, updated_at`,
      [name, phone, role, is_active, id]
    );

    if (res.rowCount === 0) {
      return NextResponse.json({ success: false, error: 'المستخدم غير موجود' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: res.rows[0] });
  } catch (error: any) {
    console.error('Error in PUT /api/users/[id]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    // First unlink any pharmacies linked to this user
    await query(`UPDATE public.pharmacies SET linked_user_id = NULL WHERE linked_user_id = $1`, [id]);

    const res = await query(`DELETE FROM public.users WHERE id::text = $1 RETURNING id`, [id]);

    if (res.rowCount === 0) {
      return NextResponse.json({ success: false, error: 'المستخدم غير موجود' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'تم حذف المستخدم بنجاح' });
  } catch (error: any) {
    console.error('Error in DELETE /api/users/[id]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
