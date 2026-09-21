import { useCallback, useRef, useState } from 'react';
import { fetchInvoiceDetails, fetchPharmacyPurchases, InvoiceItem, InvoiceLineItem } from '@/services/warehouse';

const PAGE_SIZE = 20;

export function usePurchases(token: string) {
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Details State
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceItem | null>(null);
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLineItem[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // In-memory cache for instant line items display
  const invoiceCacheRef = useRef<Record<string, InvoiceLineItem[]>>({});

  const loadInitial = useCallback(async (showLoader = true) => {
    if (!token) return;
    if (showLoader) setLoading(true);
    try {
      const data = await fetchPharmacyPurchases(token, PAGE_SIZE, 0);
      const valid = (data || []).filter((inv) => (inv.net_amount ?? inv.total_amount ?? 0) > 0);
      setInvoices(valid);
      setHasMore(data.length >= PAGE_SIZE);
    } catch (err) {
      console.warn('Error loading purchases:', err);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [token]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !token) return;
    setLoadingMore(true);
    try {
      const nextBatch = await fetchPharmacyPurchases(token, PAGE_SIZE, invoices.length);
      const validNext = (nextBatch || []).filter((inv) => (inv.net_amount ?? inv.total_amount ?? 0) > 0);
      if (validNext.length > 0) {
        setInvoices((prev) => [...prev, ...validNext]);
      }
      setHasMore(nextBatch.length >= PAGE_SIZE);
    } catch (err) {
      console.warn('Error loading more purchases:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [token, loadingMore, hasMore, invoices.length]);

  const openInvoiceDetails = useCallback(async (inv: InvoiceItem) => {
    setSelectedInvoice(inv);
    setShowInfoModal(false);
    const targetId = inv.id || inv.remote_id || inv.invoice_number;

    // Instant check in local cache
    if (invoiceCacheRef.current[targetId] && invoiceCacheRef.current[targetId].length > 0) {
      setInvoiceLines(invoiceCacheRef.current[targetId]);
      setLoadingLines(false);
      return;
    }

    setLoadingLines(true);
    try {
      const details = await fetchInvoiceDetails(token, targetId);
      if (details.items && details.items.length > 0) {
        invoiceCacheRef.current[targetId] = details.items;
        setInvoiceLines(details.items);
      } else {
        const fallbackItems: InvoiceLineItem[] = [
          {
            id: 'fallback-1',
            item_name: 'أدوية ومستلزمات عامة (فاتورة مسجلة)',
            quantity: 1,
            unit_price: inv.total_amount || inv.net_amount || 0,
            discount_percent:
              inv.total_amount && inv.discount_amount
                ? Math.round((inv.discount_amount / inv.total_amount) * 100)
                : 0,
            total_price: inv.net_amount || inv.total_amount || 0,
          },
        ];
        invoiceCacheRef.current[targetId] = fallbackItems;
        setInvoiceLines(fallbackItems);
      }
    } catch (err) {
      console.warn('Error fetching invoice lines:', err);
      setInvoiceLines([]);
    } finally {
      setLoadingLines(false);
    }
  }, [token]);

  const closeInvoiceDetails = useCallback(() => {
    setSelectedInvoice(null);
    setInvoiceLines([]);
    setShowInfoModal(false);
  }, []);

  return {
    invoices,
    setInvoices,
    loading,
    loadingMore,
    hasMore,
    selectedInvoice,
    invoiceLines,
    loadingLines,
    showInfoModal,
    setShowInfoModal,
    loadInitial,
    loadMore,
    openInvoiceDetails,
    closeInvoiceDetails,
  };
}
