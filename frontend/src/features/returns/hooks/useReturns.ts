import { useCallback, useState } from 'react';
import { fetchPharmacyReturns, fetchReturnDetails, InvoiceLineItem, ReturnItem } from '@/services/warehouse';

const PAGE_SIZE = 20;

export function useReturns(token: string) {
  const [returns, setReturns] = useState<ReturnItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Details State
  const [selectedReturn, setSelectedReturn] = useState<ReturnItem | null>(null);
  const [returnLines, setReturnLines] = useState<InvoiceLineItem[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  const loadInitial = useCallback(async (showLoader = true) => {
    if (!token) return;
    if (showLoader) setLoading(true);
    try {
      const data = await fetchPharmacyReturns(token, PAGE_SIZE, 0);
      const valid = (data || []).filter((ret) => (ret.net_amount ?? ret.total_amount ?? 0) > 0);
      setReturns(valid);
      setHasMore(data.length >= PAGE_SIZE);
    } catch (err) {
      console.warn('Error loading returns:', err);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [token]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !token) return;
    setLoadingMore(true);
    try {
      const nextBatch = await fetchPharmacyReturns(token, PAGE_SIZE, returns.length);
      const validNext = (nextBatch || []).filter((ret) => (ret.net_amount ?? ret.total_amount ?? 0) > 0);
      if (validNext.length > 0) {
        setReturns((prev) => [...prev, ...validNext]);
      }
      setHasMore(nextBatch.length >= PAGE_SIZE);
    } catch (err) {
      console.warn('Error loading more returns:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [token, loadingMore, hasMore, returns.length]);

  const openReturnDetails = useCallback(async (ret: ReturnItem) => {
    setSelectedReturn(ret);
    setShowInfoModal(false);
    setLoadingLines(true);
    const targetId = ret.id || ret.remote_id || ret.return_number || '';
    try {
      const details = await fetchReturnDetails(token, targetId);
      if (details.items && details.items.length > 0) {
        setReturnLines(details.items);
      } else {
        setReturnLines([
          {
            id: 'ret-fb-1',
            item_name: ret.reason || 'أدوية ومستحضرات مرتجعة للمخزن',
            quantity: 1,
            unit_price: ret.net_amount || ret.total_amount || 0,
            discount_percent: 0,
            total_price: ret.net_amount || ret.total_amount || 0,
          },
        ]);
      }
    } catch (err) {
      console.warn('Error fetching return lines:', err);
      setReturnLines([
        {
          id: 'ret-fb-1',
          item_name: ret.reason || 'أدوية ومستحضرات مرتجعة للمخزن',
          quantity: 1,
          unit_price: ret.net_amount || ret.total_amount || 0,
          discount_percent: 0,
          total_price: ret.net_amount || ret.total_amount || 0,
        },
      ]);
    } finally {
      setLoadingLines(false);
    }
  }, [token]);

  const closeReturnDetails = useCallback(() => {
    setSelectedReturn(null);
    setReturnLines([]);
    setShowInfoModal(false);
  }, []);

  return {
    returns,
    setReturns,
    loading,
    loadingMore,
    hasMore,
    selectedReturn,
    returnLines,
    loadingLines,
    showInfoModal,
    setShowInfoModal,
    loadInitial,
    loadMore,
    openReturnDetails,
    closeReturnDetails,
  };
}
