import { useCallback, useState } from 'react';
import { fetchPharmacyReceipts, ReceiptItem } from '@/services/warehouse';

const PAGE_SIZE = 20;

export function useReceipts(token: string) {
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadInitial = useCallback(async (showLoader = true) => {
    if (!token) return;
    if (showLoader) setLoading(true);
    try {
      const data = await fetchPharmacyReceipts(token, PAGE_SIZE, 0);
      const valid = (data || []).filter((rec) => (rec.amount ?? 0) > 0);
      setReceipts(valid);
      setHasMore(data.length >= PAGE_SIZE);
    } catch (err) {
      console.warn('Error loading receipts:', err);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [token]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !token) return;
    setLoadingMore(true);
    try {
      const nextBatch = await fetchPharmacyReceipts(token, PAGE_SIZE, receipts.length);
      const validNext = (nextBatch || []).filter((rec) => (rec.amount ?? 0) > 0);
      if (validNext.length > 0) {
        setReceipts((prev) => [...prev, ...validNext]);
      }
      setHasMore(nextBatch.length >= PAGE_SIZE);
    } catch (err) {
      console.warn('Error loading more receipts:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [token, loadingMore, hasMore, receipts.length]);

  return {
    receipts,
    setReceipts,
    loading,
    loadingMore,
    hasMore,
    loadInitial,
    loadMore,
  };
}
