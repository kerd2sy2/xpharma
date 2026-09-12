import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

// PATCH /api/tenants/[id] - update warehouse details (name, address, contact_phone, logo_url)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, address, contact_phone, logo_url, category } = body;

    const result = await query(
      `UPDATE public.tenants 
       SET name = COALESCE($1, name),
           address = COALESCE($2, address),
           contact_phone = COALESCE($3, contact_phone),
           logo_url = COALESCE($4, logo_url),
           category = COALESCE($5, category),
           updated_at = NOW() 
       WHERE id = $6 
       RETURNING id, name, slug, schema_name, status, address, contact_phone, logo_url, category, created_at`,
      [
        name !== undefined ? name.trim() : null,
        address !== undefined ? address.trim() : null,
        contact_phone !== undefined ? contact_phone.trim() : null,
        logo_url !== undefined ? logo_url.trim() : null,
        category !== undefined ? category.trim() : null,
        id,
      ]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ success: false, error: 'المخزن غير موجود' }, { status: 404 });
    }

    return NextResponse.json({ success: true, tenant: result.rows[0] });
  } catch (error: any) {
    console.error('Error updating tenant:', error);
    return NextResponse.json({ success: false, error: error.message || 'فشل تحديث البيانات' }, { status: 500 });
  }
}
