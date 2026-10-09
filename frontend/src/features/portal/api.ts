import { resilientFetch } from '@/utils/resilientFetch';
import { PharmacyBalance } from './types';

const API_BASE_URL = 'https://api.xpharma.cloud';

export async function fetchPharmacyBalance(token: string): Promise<PharmacyBalance | null> {
  try {
    const data = await resilientFetch<any>(`${API_BASE_URL}/v1/pharmacy/balance`, {
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: 6000,
      retries: 2,
      serviceName: 'portal-balance',
      fallback: null,
    });

    if (data && data.success) {
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
