import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const {
      title = '',
      subtitle = '',
      image_url,
      badge_text = 'إعلان',
      action_type = 'none',
      action_value = '',
      bg_color = '#3F0082',
      is_active = true,
      sort_order = 0,
    } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'معرف الإعلان مطلوب' }, { status: 400 });
    }

    const result = await query(
      `UPDATE public.banners 
       SET 
         title = $1,
         subtitle = $2,
         image_url = COALESCE($3, image_url),
         badge_text = $4,
         action_type = $5,
         action_value = $6,
         bg_color = $7,
         is_active = $8,
         sort_order = $9,
         updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        title.trim(),
        subtitle.trim(),
        image_url ? image_url.trim() : null,
        badge_text.trim(),
        action_type.trim(),
        action_value.trim(),
        bg_color.trim(),
        is_active,
        Number(sort_order) || 0,
        id,
      ]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ success: false, error: 'الإعلان غير موجود' }, { status: 404 });
    }

    return NextResponse.json({ success: true, banner: result.rows[0] });
  } catch (error: any) {
    console.error('Error updating banner:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ success: false, error: 'معرف الإعلان مطلوب' }, { status: 400 });
    }

    await query(`DELETE FROM public.banners WHERE id = $1`, [id]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting banner:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
