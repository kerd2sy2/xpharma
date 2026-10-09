import { resilientFetch } from '@/utils/resilientFetch';
import { ReceiptItem } from './types';

const API_BASE_URL = 'https://api.xpharma.cloud';

export async function fetchPharmacyReceipts(
  token: string,
  limit: number = 20,
  offset: number = 0
): Promise<ReceiptItem[]> {
  try {
    const data = await resilientFetch<any>(
      `${API_BASE_URL}/v1/pharmacy/receipts?limit=${limit}&offset=${offset}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeoutMs: 8000,
        retries: 2,
        serviceName: 'receipts-list',
        fallback: { success: false, receipts: [] },
      }
    );

    if (data && data.success) {
      return data.receipts || [];
    }
    return [];
  } catch (e) {
    console.error('Failed to fetch receipts:', e);
    return [];
  }
}
