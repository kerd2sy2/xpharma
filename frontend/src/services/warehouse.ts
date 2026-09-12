import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = 'https://api.xpharma.cloud';

export interface Warehouse {
  id: string;
  name: string;
  slug: string;
  status: string;
  address?: string;
  contact_phone?: string;
  logo_url?: string;
  is_linked: boolean;
  linked_pharmacy_id?: string;
  linked_pharmacy_code?: string;
  linked_pharmacy_name?: string;
  pharmacy_token?: string;
}

export interface PharmacyBalance {
  balance: number;
  total_purchases: number;
  total_returns: number;
  total_paid: number;
  currency: string;
}

export interface InvoiceItem {
  id: string;
  invoice_number: string;
  remote_id: string;
  invoice_date: string;
  total_amount: number;
  discount_amount: number;
  net_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: string;
}

export interface ReturnItem {
  id: string;
  return_number?: string;
  remote_id?: string;
  return_date?: string;
  total_amount?: number;
  net_amount?: number;
  reason?: string;
  status?: string;
}

export interface ReceiptItem {
  id: string;
  receipt_number?: string;
  remote_id?: string;
  receipt_date?: string;
  amount?: number;
  payment_method?: string;
  notes?: string;
}

export interface StatementItem {
  id: string;
  remote_id: string;
  entry_date: string;
  doc_type: string;
  doc_number: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface VerifyPharmacyResult {
  success: boolean;
  token?: string;
  pharmacy_id?: string;
  pharmacy_code?: string;
  pharmacy_name?: string;
  tenant_id?: string;
  error?: string;
}

export interface LinkedPharmacyAccount {
  token: string;
  pharmacy_code: string;
  pharmacy_name: string;
  tenant_id: string;
}

const PHARMACY_STORAGE_PREFIX = 'xpharma_pharma_';
const PHARMACIES_LIST_PREFIX = 'xpharma_pharmacies_list_';

/**
 * Fetch all active warehouses and their link status for the current user
 */
export async function fetchWarehouses(userId?: string): Promise<Warehouse[]> {
  try {
    const url = userId 
      ? `${API_BASE_URL}/v1/warehouses?user_id=${encodeURIComponent(userId)}`
      : `${API_BASE_URL}/v1/warehouses`;
    
    const res = await fetch(url);
    const data = await res.json();
    if (res.ok && data.success && Array.isArray(data.warehouses)) {
      // Deduplicate warehouses so each warehouse appears only once
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

/**
 * Verify pharmacy code and phone for a warehouse
 */
export async function verifyPharmacy(
  tenantId: string,
  pharmacyCode: string,
  phone: string,
  userId?: string,
  email?: string
): Promise<VerifyPharmacyResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/auth/verify-pharmacy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: tenantId,
        pharmacy_code: pharmacyCode.trim(),
        phone: phone.trim(),
        user_id: userId || '',
        email: email || '',
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || 'كود الصيدلية أو رقم الهاتف غير مطابق لسجلات المستودع',
      };
    }

    // Save token locally
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

/**
 * Save pharmacy session locally in SecureStore
 */
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

/**
 * Get all linked pharmacies for a warehouse
 */
export async function getWarehousePharmacies(tenantId: string): Promise<LinkedPharmacyAccount[]> {
  try {
    const raw = await SecureStore.getItemAsync(`${PHARMACIES_LIST_PREFIX}${tenantId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
    // Fallback: check single session
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

/**
 * Save or append a pharmacy account to a warehouse
 */
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

/**
 * Get locally saved pharmacy session
 */
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

/**
 * Delete saved pharmacy session for a warehouse
 */
export async function clearPharmacySession(tenantId: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(`${PHARMACY_STORAGE_PREFIX}${tenantId}`);
    await SecureStore.deleteItemAsync(`${PHARMACIES_LIST_PREFIX}${tenantId}`);
  } catch (e) {
    // Ignore error
  }
}

/**
 * Fetch pharmacy balance
 */
export async function fetchPharmacyBalance(token: string): Promise<PharmacyBalance | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/pharmacy/balance`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok && data.success) {
      return {
        balance: data.balance ?? 0,
        total_purchases: data.total_purchases ?? 0,
        total_returns: data.total_returns ?? 0,
        total_paid: data.total_paid ?? 0,
        currency: data.currency || 'EGP',
      };
    }
    return null;
  } catch (e) {
    console.error('Failed to fetch balance:', e);
    return null;
  }
}

/**
 * Fetch purchases (invoices)
 */
export async function fetchPharmacyPurchases(token: string): Promise<InvoiceItem[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/pharmacy/purchases`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok && data.success) {
      return data.invoices || [];
    }
    return [];
  } catch (e) {
    console.error('Failed to fetch purchases:', e);
    return [];
  }
}

/**
 * Fetch returns
 */
export async function fetchPharmacyReturns(token: string): Promise<ReturnItem[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/pharmacy/returns`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok && data.success) {
      return data.returns || [];
    }
    return [];
  } catch (e) {
    console.error('Failed to fetch returns:', e);
    return [];
  }
}

/**
 * Fetch cash receipts
 */
export async function fetchPharmacyReceipts(token: string): Promise<ReceiptItem[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/pharmacy/receipts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok && data.success) {
      return data.receipts || [];
    }
    return [];
  } catch (e) {
    console.error('Failed to fetch receipts:', e);
    return [];
  }
}

/**
 * Fetch statement of account
 */
export async function fetchPharmacyStatement(token: string): Promise<StatementItem[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/pharmacy/statement`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok && data.success) {
      return data.statement || [];
    }
    return [];
  } catch (e) {
    console.error('Failed to fetch statement:', e);
    return [];
  }
}
