import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Revenue & Subscription counts
    const revenueRes = await query(`
      SELECT 
        COALESCE(SUM(amount) FILTER (WHERE status = 'active'), 0)::numeric AS total_revenue,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active_subscriptions,
        COUNT(*) FILTER (WHERE status = 'pending_approval')::int AS pending_subscriptions,
        COUNT(*)::int AS total_subscriptions
      FROM public.subscriptions;
    `);
    const revenue = revenueRes.rows[0] || {
      total_revenue: 0,
      active_subscriptions: 0,
      pending_subscriptions: 0,
      total_subscriptions: 0,
    };

    // 2. Tenants & Agent health
    const tenantsRes = await query(`
      SELECT 
        t.id,
        t.name,
        t.slug,
        t.schema_name,
        t.status,
        t.last_heartbeat_at,
        t.created_at,
        s.sync_status,
        s.last_sync_at,
        s.last_error,
        CASE 
          WHEN t.last_heartbeat_at IS NULL THEN 'never'
          WHEN t.last_heartbeat_at > NOW() - INTERVAL '5 minutes' THEN 'online'
          WHEN t.last_heartbeat_at < NOW() - INTERVAL '24 hours' THEN 'offline'
          ELSE 'idle'
        END AS agent_health,
        (SELECT COUNT(*) FROM public.pharmacies p WHERE p.tenant_id = t.id)::int AS total_pharmacies
      FROM public.tenants t
      LEFT JOIN public.tenant_sync_states s ON s.tenant_id = t.id
      ORDER BY t.created_at DESC;
    `);
    const tenants = tenantsRes.rows;
    const totalTenants = tenants.length;
    const activeTenants = tenants.filter((t) => t.status === 'active').length;
    const onlineAgents = tenants.filter((t) => t.agent_health === 'online').length;

    // 3. Pharmacies counts
    const pharmaciesRes = await query(`
      SELECT 
        COUNT(*)::int AS total_pharmacies,
        COUNT(*) FILTER (WHERE linked_user_id IS NOT NULL AND linked_user_id <> '')::int AS linked_pharmacies
      FROM public.pharmacies;
    `);
    const pharmacies = pharmaciesRes.rows[0] || {
      total_pharmacies: 0,
      linked_pharmacies: 0,
    };

    // 4. Users / Pharmacists
    const usersRes = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE role <> 'superadmin')::int AS total_pharmacists,
        COUNT(*) FILTER (WHERE role <> 'superadmin' AND (subscription_plan = 0 OR subscription_plan IS NULL))::int AS trial_pharmacists,
        COUNT(*) FILTER (WHERE role <> 'superadmin' AND subscription_plan > 0)::int AS paid_pharmacists
      FROM public.users;
    `);
    const users = usersRes.rows[0] || {
      total_pharmacists: 0,
      trial_pharmacists: 0,
      paid_pharmacists: 0,
    };

    // 5. Recent Subscriptions (Limit 5)
    const recentSubsRes = await query(`
      SELECT 
        s.id,
        s.user_name,
        s.user_email,
        s.user_phone,
        s.plan_type,
        s.amount,
        s.currency,
        s.payment_method,
        s.status,
        s.order_id,
        s.transaction_id,
        s.card_brand,
        s.masked_card,
        s.created_at,
        t.name AS tenant_name
      FROM public.subscriptions s
      LEFT JOIN public.tenants t ON t.id = s.tenant_id
      ORDER BY s.created_at DESC
      LIMIT 6;
    `);
    const recentSubscriptions = recentSubsRes.rows;

    // 6. Recent Warehouse Requests (Limit 5)
    let recentRequests: any[] = [];
    try {
      const requestsRes = await query(`
        SELECT 
          id,
          warehouse_name,
          warehouse_phone,
          notes,
          requested_by_name,
          requested_by_email,
          status,
          created_at
        FROM public.warehouse_requests
        ORDER BY created_at DESC
        LIMIT 5;
      `);
      recentRequests = requestsRes.rows;
    } catch {
      recentRequests = [];
    }

    // 7. Plan breakdown among users
    const planBreakdownRes = await query(`
      SELECT 
        COALESCE(subscription_plan, 0) AS plan,
        COUNT(*)::int AS count
      FROM public.users
      WHERE role <> 'superadmin'
      GROUP BY subscription_plan
      ORDER BY plan ASC;
    `);
    const planBreakdown = planBreakdownRes.rows;

    return NextResponse.json({
      success: true,
      data: {
        revenue: {
          total: Number(revenue.total_revenue) || 0,
          activeCount: revenue.active_subscriptions || 0,
          pendingCount: revenue.pending_subscriptions || 0,
          totalCount: revenue.total_subscriptions || 0,
        },
        tenants: {
          total: totalTenants,
          active: activeTenants,
          onlineAgents,
          list: tenants.slice(0, 6),
        },
        pharmacies: {
          total: pharmacies.total_pharmacies || 0,
          linked: pharmacies.linked_pharmacies || 0,
        },
        users: {
          total: users.total_pharmacists || 0,
          trial: users.trial_pharmacists || 0,
          paid: users.paid_pharmacists || 0,
          plans: planBreakdown,
        },
        recentSubscriptions,
        recentRequests,
      },
    });
  } catch (error: any) {
    console.error('Error fetching overview stats:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal error' },
      { status: 500 }
    );
  }
}
