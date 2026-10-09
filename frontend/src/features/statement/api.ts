import { resilientFetch } from '@/utils/resilientFetch';
import { StatementItem } from './types';

const API_BASE_URL = 'https://api.xpharma.cloud';

export async function fetchPharmacyStatement(
  token: string,
  limit: number = 20,
  offset: number = 0
): Promise<StatementItem[]> {
  try {
    const data = await resilientFetch<any>(
      `${API_BASE_URL}/v1/pharmacy/statement?limit=${limit}&offset=${offset}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeoutMs: 8000,
        retries: 2,
        serviceName: 'statement-list',
        fallback: { success: false, statement: [] },
      }
    );

    if (data && data.success) {
      return data.statement || [];
    }
    return [];
  } catch (e) {
    console.error('Failed to fetch statement:', e);
    return [];
  }
}
