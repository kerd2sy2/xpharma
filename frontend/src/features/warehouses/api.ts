import * as SecureStore from 'expo-secure-store';
import { resilientFetch } from '@/utils/resilientFetch';
import { LinkedPharmacyAccount, VerifyPharmacyResult, Warehouse } from './types';

const API_BASE_URL = 'https://api.xpharma.cloud';
const PHARMACY_STORAGE_PREFIX = 'xpharma_pharma_';
const PHARMACIES_LIST_PREFIX = 'xpharma_pharmacies_list_';

export async function fetchWarehouses(userId?: string, email?: string): Promise<Warehouse[]> {
  try {
    const params = new URLSearchParams();
    if (userId) params.append('user_id', userId.trim());
    if (email) params.append('email', email.trim().toLowerCase());

    const queryString = params.toString();
    const url = queryString
      ? `${API_BASE_URL}/v1/warehouses?${queryString}`
      : `${API_BASE_URL}/v1/warehouses`;

    const data = await resilientFetch<any>(url, {
      timeoutMs: 8000,
      retries: 2,
      serviceName: 'warehouses-list',
      fallback: { success: false, warehouses: [] },
    });

    if (data && data.success && Array.isArray(data.warehouses)) {
      const warehouseMap = new Map<string, Warehouse>();
      for (const wh of data.warehouses) {
        const key = wh.id || wh.slug || wh.name;
        if (!warehouseMap.has(key)) {
          warehouseMap.set(key, wh);
        } else {
          const existing = warehouseMap.get(key)!;
          if (!existing.is_linked && wh.is_linked) {
            warehouseMap.set(key, { ...existing, ...wh, is_linked: true });
          }
        }
      }
      return Array.from(warehouseMap.values());
    }
    return [];
  } catch (error) {
    console.error('Failed to fetch warehouses:', error);
    return [];
  }
}

export async function savePharmacySession(
  tenantId: string,
  session: { token: string; pharmacy_code: string; pharmacy_name: string; tenant_id: string }
): Promise<void> {
  try {
    await SecureStore.setItemAsync(`${PHARMACY_STORAGE_PREFIX}${tenantId}`, JSON.stringify(session));
  } catch (e) {
    console.warn('Failed to save pharmacy session:', e);
  }
}

export async function getPharmacySession(
  tenantId: string
): Promise<{ token: string; pharmacy_code: string; pharmacy_name: string; tenant_id: string } | null> {
  try {
    const raw = await SecureStore.getItemAsync(`${PHARMACY_STORAGE_PREFIX}${tenantId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export async function clearPharmacySession(tenantId: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(`${PHARMACY_STORAGE_PREFIX}${tenantId}`);
    await SecureStore.deleteItemAsync(`${PHARMACIES_LIST_PREFIX}${tenantId}`);
  } catch (e) {}
}

export async function getWarehousePharmacies(tenantId: string): Promise<LinkedPharmacyAccount[]> {
  try {
    const raw = await SecureStore.getItemAsync(`${PHARMACIES_LIST_PREFIX}${tenantId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
    const single = await getPharmacySession(tenantId);
    if (single) {
      const list = [single];
      await SecureStore.setItemAsync(`${PHARMACIES_LIST_PREFIX}${tenantId}`, JSON.stringify(list));
      return list;
    }
    return [];
  } catch (e) {
    return [];
  }
}

export async function saveWarehousePharmacy(
  tenantId: string,
  account: LinkedPharmacyAccount
): Promise<LinkedPharmacyAccount[]> {
  try {
    const currentList = await getWarehousePharmacies(tenantId);
    const filtered = currentList.filter(
      (p) => p.pharmacy_code !== account.pharmacy_code && p.token !== account.token
    );
    const updated = [account, ...filtered];
    await SecureStore.setItemAsync(`${PHARMACIES_LIST_PREFIX}${tenantId}`, JSON.stringify(updated));
    await savePharmacySession(tenantId, account);
    return updated;
  } catch (e) {
    console.warn('Failed to save warehouse pharmacy account:', e);
    return [];
  }
}

export async function syncWarehousePharmacies(
  tenantId: string,
  serverPharmacies: LinkedPharmacyAccount[]
): Promise<void> {
  try {
    if (!serverPharmacies || serverPharmacies.length === 0) {
      await clearPharmacySession(tenantId);
      return;
    }
    await SecureStore.setItemAsync(
      `${PHARMACIES_LIST_PREFIX}${tenantId}`,
      JSON.stringify(serverPharmacies)
    );
  } catch (e) {
    console.warn('Failed to sync warehouse pharmacies:', e);
  }
}

export async function verifyPharmacy(
  tenantId: string,
  pharmacyCode: string,
  phone: string,
  userId?: string,
  email?: string
): Promise<VerifyPharmacyResult> {
  try {
    const data = await resilientFetch<any>(`${API_BASE_URL}/v1/auth/verify-pharmacy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: tenantId,
        pharmacy_code: pharmacyCode.trim(),
        phone: phone.trim(),
        user_id: userId || '',
        email: email || '',
      }),
      timeoutMs: 8000,
      retries: 2,
      serviceName: 'warehouses-verify',
    });

    if (!data || !data.success) {
      return {
        success: false,
        error: data?.error || 'كود الصيدلية أو رقم الهاتف غير مطابق لسجلات المستودع',
      };
    }

    if (data.token) {
      await saveWarehousePharmacy(tenantId, {
        token: data.token,
        pharmacy_code: data.pharmacy_code,
        pharmacy_name: data.pharmacy_name,
        tenant_id: data.tenant_id,
      });
    }

    return {
      success: true,
      token: data.token,
      pharmacy_code: data.pharmacy_code,
      pharmacy_name: data.pharmacy_name,
      tenant_id: data.tenant_id,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'تعذر الاتصال بخادم المنصة. يرجى التحقق من اتصال الإنترنت',
    };
  }
}
