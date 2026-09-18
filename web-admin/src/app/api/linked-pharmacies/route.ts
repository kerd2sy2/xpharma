import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

// GET /api/linked-pharmacies - List all pharmacies linked between users and warehouses
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenant_id');
    const search = searchParams.get('search')?.trim();
    const filterType = searchParams.get('filter') || 'linked_only'; // 'linked_only' | 'all'

    let whereConditions: string[] = [];
    let params: any[] = [];
    let paramIndex = 1;

    if (filterType === 'linked_only') {
      whereConditions.push(`(p.linked_user_id IS NOT NULL AND p.linked_user_id <> '')`);
    }

    if (tenantId && tenantId !== 'all') {
      whereConditions.push(`p.tenant_id = $${paramIndex}`);
      params.push(tenantId);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(`(
        p.name ILIKE $${paramIndex} OR 
        p.code ILIKE $${paramIndex} OR 
        p.phone ILIKE $${paramIndex} OR 
        u.name ILIKE $${paramIndex} OR 
        u.email ILIKE $${paramIndex} OR 
        u.phone ILIKE $${paramIndex} OR
        t.name ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const sqlQuery = `
      SELECT 
        p.id AS pharmacy_id,
        p.code AS pharmacy_code,
        p.name AS pharmacy_name,
        COALESCE(p.phone, '') AS pharmacy_phone,
        COALESCE(p.address, '') AS pharmacy_address,
        p.is_active AS pharmacy_is_active,
        p.linked_user_id,
        p.updated_at AS linked_at,
        p.created_at AS pharmacy_created_at,
        t.id AS tenant_id,
        t.name AS tenant_name,
        t.slug AS tenant_slug,
        COALESCE(t.category, 'مخزن أدوية') AS tenant_category,
        COALESCE(t.logo_url, '') AS tenant_logo_url,
        u.id AS user_id,
        COALESCE(u.name, 'مستخدم مسجل') AS user_name,
        COALESCE(u.email, '') AS user_email,
        COALESCE(u.phone, '') AS user_phone,
        COALESCE(u.avatar_url, '') AS user_avatar_url,
        COALESCE(u.device_name, '') AS device_name,
        COALESCE(u.device_id, '') AS device_id,
        COALESCE(u.provider, 'google') AS user_provider,
        COALESCE(u.role, 'pharmacist') AS user_role,
        u.last_login_at,
        COALESCE(s.status, 'trial') AS subscription_status,
        s.end_date AS subscription_end_date
      FROM public.pharmacies p
      JOIN public.tenants t ON t.id = p.tenant_id
      LEFT JOIN public.users u ON (u.id::text = p.linked_user_id OR u.email = p.linked_user_id)
      LEFT JOIN public.subscriptions s ON s.pharmacy_id = p.id AND s.status = 'active'
      ${whereClause}
      ORDER BY p.updated_at DESC
    `;

    const result = await query(sqlQuery, params);

    // Summary metrics
    const statsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM public.pharmacies WHERE linked_user_id IS NOT NULL AND linked_user_id <> '')::int AS total_linked_pharmacies,
        (SELECT COUNT(*) FROM public.pharmacies)::int AS total_pharmacies,
        (SELECT COUNT(DISTINCT linked_user_id) FROM public.pharmacies WHERE linked_user_id IS NOT NULL AND linked_user_id <> '')::int AS unique_pharmacists,
        (SELECT COUNT(*) FROM public.tenants WHERE status = 'active')::int AS total_warehouses,
        (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'active')::int AS active_subscriptions
    `;
    const statsResult = await query(statsQuery);

    return NextResponse.json({
      success: true,
      data: result.rows,
      stats: statsResult.rows[0] || {
        total_linked_pharmacies: 0,
        total_pharmacies: 0,
        unique_pharmacists: 0,
        total_warehouses: 0,
        active_subscriptions: 0
      }
    });
  } catch (error: any) {
    console.error('Error in GET /api/linked-pharmacies:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/linked-pharmacies - Unlink a pharmacy from a user
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { pharmacy_id } = body;

    if (!pharmacy_id) {
      return NextResponse.json({ success: false, error: 'معرف الصيدلية مطلوب' }, { status: 400 });
    }

    await query(
      `UPDATE public.pharmacies SET linked_user_id = NULL, updated_at = NOW() WHERE id = $1`,
      [pharmacy_id]
    );

    return NextResponse.json({
      success: true,
      message: 'تم فك ربط الصيدلية بنجاح'
    });
  } catch (error: any) {
    console.error('Error in DELETE /api/linked-pharmacies:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
