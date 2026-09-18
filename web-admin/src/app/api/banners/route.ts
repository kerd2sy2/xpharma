import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

let tableChecked = false;
async function ensureBannersTable() {
  if (tableChecked) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS public.banners (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255),
        subtitle TEXT,
        image_url TEXT NOT NULL,
        badge_text VARCHAR(64) DEFAULT 'إعلان',
        action_type VARCHAR(64) DEFAULT 'none',
        action_value TEXT DEFAULT '',
        bg_color VARCHAR(32) DEFAULT '#3F0082',
        is_active BOOLEAN DEFAULT true,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    tableChecked = true;
  } catch (e) {
    console.warn('Could not auto-create banners table:', e);
  }
}

// GET /api/banners - fetch banners (all for admin, active only when ?active_only=true)
export async function GET(req: NextRequest) {
  try {
    await ensureBannersTable();

    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get('active_only') === 'true';

    let q = `
      SELECT 
        id, 
        COALESCE(title, '') AS title, 
        COALESCE(subtitle, '') AS subtitle, 
        image_url, 
        COALESCE(badge_text, 'إعلان') AS badge_text, 
        COALESCE(action_type, 'none') AS action_type, 
        COALESCE(action_value, '') AS action_value, 
        COALESCE(bg_color, '#3F0082') AS bg_color, 
        is_active, 
        sort_order, 
        created_at
      FROM public.banners
    `;

    if (activeOnly) {
      q += ` WHERE is_active = true`;
    }

    q += ` ORDER BY sort_order ASC, created_at DESC`;

    const result = await query(q);

    return NextResponse.json({
      success: true,
      banners: result.rows,
    });
  } catch (error: any) {
    console.error('Error fetching banners:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/banners - create new banner
export async function POST(req: NextRequest) {
  try {
    await ensureBannersTable();

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

    if (!image_url || typeof image_url !== 'string') {
      return NextResponse.json({ success: false, error: 'رابط صورة الإعلان مطلوب' }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO public.banners 
        (title, subtitle, image_url, badge_text, action_type, action_value, bg_color, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        title.trim(),
        subtitle.trim(),
        image_url.trim(),
        badge_text.trim(),
        action_type.trim(),
        action_value.trim(),
        bg_color.trim(),
        is_active,
        Number(sort_order) || 0,
      ]
    );

    return NextResponse.json({ success: true, banner: result.rows[0] });
  } catch (error: any) {
    console.error('Error creating banner:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
