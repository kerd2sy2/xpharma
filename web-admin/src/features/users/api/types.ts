export type User = {
  id: string | number;
  first_name: string;
  last_name: string;
  name?: string;
  email: string;
  phone: string;
  status: string;
  role: string;
  provider?: string;
  device_name?: string;
  device_id?: string;
  linked_pharmacies_count?: number;
  created_at: string;
  updated_at?: string;
  last_login_at?: string;
};

export type UserFilters = {
  page?: number;
  limit?: number;
  roles?: string;
  search?: string;
  sort?: string;
};

export type UsersResponse = {
  success: boolean;
  time: string;
  message: string;
  total_users: number;
  offset: number;
  limit: number;
  users: User[];
};

export type UserMutationPayload = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
};
