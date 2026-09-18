import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, Number(searchParams.get('page') ?? 1));
    const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit') ?? 10)));
    const roles = searchParams.get('roles')?.split(',').filter(Boolean);
    const search = searchParams.get('search')?.trim();
    const offset = (page - 1) * limit;

    let whereConditions: string[] = [];
    let params: any[] = [];
    let paramIndex = 1;

    if (roles && roles.length > 0) {
      whereConditions.push(`role = ANY($${paramIndex})`);
      params.push(roles);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(`(name ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR phone ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const countResult = await query(`SELECT COUNT(*)::int AS total FROM public.users ${whereClause}`, params);
    const total = countResult.rows[0]?.total ?? 0;

    const dataQuery = `
      SELECT 
        id, 
        name, 
        email, 
        role, 
        COALESCE(phone, '') AS phone,
        COALESCE(avatar_url, '') AS avatar_url,
        COALESCE(provider, 'google') AS provider,
        COALESCE(device_name, '') AS device_name,
        COALESCE(device_id, '') AS device_id,
        is_active,
        last_login_at,
        created_at,
        updated_at,
        (SELECT COUNT(*) FROM public.pharmacies p WHERE p.linked_user_id = u.id::text OR p.linked_user_id = u.email)::int AS linked_pharmacies_count
      FROM public.users u
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataResult = await query(dataQuery, [...params, limit, offset]);

    return NextResponse.json({
      success: true,
      data: dataResult.rows,
      users: dataResult.rows,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit)
    });
  } catch (error: any) {
    console.error('Error in GET /api/users:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, phone = '', role = 'pharmacist' } = body;

    if (!name || !email) {
      return NextResponse.json({ success: false, error: 'الاسم والبريد الإلكتروني مطلوبان' }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO public.users (name, email, phone, role, provider, is_active)
       VALUES ($1, $2, $3, $4, 'email', true)
       ON CONFLICT (email) DO UPDATE 
       SET name = EXCLUDED.name, phone = EXCLUDED.phone, updated_at = NOW()
       RETURNING id, name, email, phone, role, created_at`,
      [name.trim(), email.trim().toLowerCase(), phone.trim(), role]
    );

    return NextResponse.json({ success: true, data: result.rows[0] }, { status: 201 });
  } catch (error: any) {
    console.error('Error in POST /api/users:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
