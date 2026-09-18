// ============================================================
// Real DB User definitions (Legacy mock replaced)
// ============================================================

export type User = {
  id: number | string;
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
  updated_at: string;
  last_login_at?: string;
};

export const fakeUsers = {
  records: [] as User[],
  initialize() {
    this.records = [];
  },
  async getAll() {
    return [];
  },
  async getUsers() {
    return {
      success: true,
      time: new Date().toISOString(),
      message: 'Users list',
      total_users: 0,
      offset: 0,
      limit: 10,
      users: []
    };
  },
  async getUserById() {
    return null;
  },
  async createUser() {
    return { success: true };
  },
  async updateUser() {
    return { success: true };
  },
  async deleteUser() {
    return { success: true };
  }
};
