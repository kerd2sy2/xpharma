// ============================================================
// User Service — Data Access Layer (Connected to Real PostgreSQL)
// ============================================================

import { apiClient } from '@/lib/api-client';
import { query } from '@/lib/db';
import type { UserFilters, UsersResponse, UserMutationPayload, User } from './types';

export async function getUsers(filters: UserFilters): Promise<UsersResponse> {
  // If running on the server (SSR / Server Component / prefetchQuery), query PostgreSQL directly
  if (typeof window === 'undefined') {
    try {
      const page = Math.max(1, Number(filters.page ?? 1));
      const limit = Math.max(1, Math.min(100, Number(filters.limit ?? 10)));
      const offset = (page - 1) * limit;

      let whereConditions: string[] = [];
      let params: any[] = [];
      let paramIndex = 1;

      if (filters.roles) {
        whereConditions.push(`role = ANY($${paramIndex})`);
        params.push(filters.roles.split(',').filter(Boolean));
        paramIndex++;
      }

      if (filters.search) {
        whereConditions.push(`(name ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR phone ILIKE $${paramIndex})`);
        params.push(`%${filters.search.trim()}%`);
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
      const rawUsers = dataResult.rows;

      const users: User[] = rawUsers.map((u: any, idx: number) => {
        const rawName = (u.name || '').trim();
        const parts = rawName.split(' ');
        const first_name = parts[0] || (u.email ? u.email.split('@')[0] : 'مستخدم');
        const last_name = parts.slice(1).join(' ') || '';

        return {
          id: u.id || idx + 1,
          first_name,
          last_name,
          name: rawName || `${first_name} ${last_name}`.trim(),
          email: u.email || '',
          phone: u.phone || '-',
          status: u.is_active !== false ? 'Active' : 'Inactive',
          role: u.role || 'pharmacist',
          provider: u.provider || 'google',
          device_name: u.device_name || '',
          device_id: u.device_id || '',
          linked_pharmacies_count: u.linked_pharmacies_count || 0,
          created_at: u.created_at || new Date().toISOString(),
          updated_at: u.updated_at || u.created_at || new Date().toISOString(),
          last_login_at: u.last_login_at
        };
      });

      return {
        success: true,
        time: new Date().toISOString(),
        message: 'Users fetched successfully',
        total_users: total,
        offset,
        limit,
        users
      };
    } catch (err: any) {
      console.error('Error fetching users directly in getUsers (SSR):', err);
    }
  }

  // Client-side fetch via API route
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.roles) params.set('roles', filters.roles);
  if (filters.search) params.set('search', filters.search);

  const queryStr = params.toString() ? `?${params.toString()}` : '';
  const res = await apiClient<any>(`/users${queryStr}`);

  const rawUsers = res.data || res.users || [];
  const users: User[] = rawUsers.map((u: any, idx: number) => {
    const rawName = (u.name || '').trim();
    const parts = rawName.split(' ');
    const first_name = parts[0] || (u.email ? u.email.split('@')[0] : 'مستخدم');
    const last_name = parts.slice(1).join(' ') || '';

    return {
      id: u.id || idx + 1,
      first_name,
      last_name,
      name: rawName || `${first_name} ${last_name}`.trim(),
      email: u.email || '',
      phone: u.phone || '-',
      status: u.is_active !== false ? 'Active' : 'Inactive',
      role: u.role || 'pharmacist',
      provider: u.provider || 'google',
      device_name: u.device_name || '',
      device_id: u.device_id || '',
      linked_pharmacies_count: u.linked_pharmacies_count || 0,
      created_at: u.created_at || new Date().toISOString(),
      updated_at: u.updated_at || u.created_at || new Date().toISOString(),
      last_login_at: u.last_login_at
    };
  });

  return {
    success: true,
    time: new Date().toISOString(),
    message: 'Users fetched successfully',
    total_users: res.total ?? users.length,
    offset: ((filters.page || 1) - 1) * (filters.limit || 10),
    limit: filters.limit || 10,
    users
  };
}

export async function createUser(data: UserMutationPayload) {
  const fullName = `${data.first_name} ${data.last_name}`.trim();
  return apiClient('/users', {
    method: 'POST',
    body: JSON.stringify({
      name: fullName,
      email: data.email,
      phone: data.phone,
      role: data.role
    })
  });
}

export async function updateUser(id: string | number, data: UserMutationPayload) {
  const fullName = `${data.first_name} ${data.last_name}`.trim();
  return apiClient(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: fullName,
      phone: data.phone,
      role: data.role,
      is_active: data.status === 'Active'
    })
  });
}

export async function deleteUser(id: string | number) {
  return apiClient(`/users/${id}`, {
    method: 'DELETE'
  });
}
