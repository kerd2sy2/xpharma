import { resilientFetch } from '@/utils/resilientFetch';
import { InvoiceItem, InvoiceLineItem } from './types';

const API_BASE_URL = 'https://api.xpharma.cloud';

export async function fetchPharmacyPurchases(
  token: string,
  limit: number = 20,
  offset: number = 0
): Promise<InvoiceItem[]> {
  try {
    const data = await resilientFetch<any>(
      `${API_BASE_URL}/v1/pharmacy/purchases?limit=${limit}&offset=${offset}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeoutMs: 8000,
        retries: 2,
        serviceName: 'purchases-list',
        fallback: { success: false, invoices: [] },
      }
    );

    if (data && data.success) {
      return data.invoices || [];
    }
    return [];
  } catch (e) {
    console.error('Failed to fetch purchases:', e);
    return [];
  }
}

export async function fetchInvoiceDetails(
  token: string,
  invoiceId: string
): Promise<{ invoice?: InvoiceItem; items: InvoiceLineItem[] }> {
  try {
    const data = await resilientFetch<any>(
      `${API_BASE_URL}/v1/pharmacy/purchases/${encodeURIComponent(invoiceId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeoutMs: 8000,
        retries: 2,
        serviceName: 'invoice-details',
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
        if (disc === 0 && qty > 0 && price > 0 && total > 0) {
          const expectedTotal = qty * price;
          if (expectedTotal > total) {
            disc = Math.round(((expectedTotal - total) / expectedTotal) * 100);
          }
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
        invoice: data.invoice || data.data?.invoice,
        items: normalizedItems,
      };
    }
    return { items: [] };
  } catch (e) {
    console.error('Failed to fetch invoice details:', e);
    return { items: [] };
  }
}
