import { apiClient } from '@/lib/api-client';
import type { UserFilters, UsersResponse, UserMutationPayload, User } from './types';

export async function getUsers(filters: UserFilters): Promise<UsersResponse> {
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
