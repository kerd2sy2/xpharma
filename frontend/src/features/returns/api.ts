import { resilientFetch } from '@/utils/resilientFetch';
import { InvoiceLineItem } from '@/features/purchases/types';
import { ReturnItem } from './types';

const API_BASE_URL = 'https://api.xpharma.cloud';

export async function fetchPharmacyReturns(
  token: string,
  limit: number = 20,
  offset: number = 0
): Promise<ReturnItem[]> {
  try {
    const data = await resilientFetch<any>(
      `${API_BASE_URL}/v1/pharmacy/returns?limit=${limit}&offset=${offset}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeoutMs: 8000,
        retries: 2,
        serviceName: 'returns-list',
        fallback: { success: false, returns: [] },
      }
    );

    if (data && data.success) {
      return data.returns || [];
    }
    return [];
  } catch (e) {
    console.error('Failed to fetch returns:', e);
    return [];
  }
}

export async function fetchReturnDetails(
  token: string,
  returnId: string
): Promise<{ return?: ReturnItem; items: InvoiceLineItem[] }> {
  try {
    const data = await resilientFetch<any>(
      `${API_BASE_URL}/v1/pharmacy/returns/${encodeURIComponent(returnId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeoutMs: 8000,
        retries: 2,
        serviceName: 'return-details',
        fallback: { items: [] },
      }
    );

    if (data && (data.success || data.items || data.itemsList || data.data)) {
      const rawList =
        data.items ||
        data.itemsList ||
        data.data?.items ||
        data.data?.itemsList ||
        (Array.isArray(data.data) ? data.data : []);

      const normalizedItems: InvoiceLineItem[] = (rawList || []).map((item: any, idx: number) => {
        const qty = Number(item.quantity ?? item.qty ?? item.QTY ?? item.items_qty ?? 1);
        const price = Number(item.unit_price ?? item.price ?? item.PRICE ?? item.consumer ?? 0);
        let disc = Number(item.discount_percent ?? item.discount ?? item.discount_value ?? item.DISCOUNT ?? 0);
        let total = Number(item.total_price ?? item.total ?? item.line_total ?? item.TOTAL ?? 0);

        if (total === 0 && qty > 0 && price > 0) {
          total = qty * price * (1 - disc / 100);
        }

        return {
          id: String(item.id ?? item.remote_item_id ?? idx),
          remote_item_id: item.remote_item_id ? String(item.remote_item_id) : undefined,
          item_code: String(item.item_code ?? item.prod_id ?? item.PROD_ID ?? ''),
          item_name:
            item.item_name ||
            item.name ||
            item.product_name ||
            item.PRODUCT_NAME ||
            item.p_name ||
            'صنف غير معروف',
          unit: item.unit || 'علبة',
          quantity: qty,
          bonus_quantity: Number(item.bonus_quantity ?? item.bonus ?? 0),
          unit_price: price,
          discount_percent: disc,
          total_price: total,
        };
      });

      return {
        return: data.return || data.data?.return,
        items: normalizedItems,
      };
    }
    return { items: [] };
  } catch (e) {
    console.error('Failed to fetch return details:', e);
    return { items: [] };
  }
}
