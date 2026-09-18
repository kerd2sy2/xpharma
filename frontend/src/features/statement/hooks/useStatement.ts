import { useCallback, useState } from 'react';
import { fetchPharmacyStatement, StatementItem } from '@/services/warehouse';

const PAGE_SIZE = 20;

export function useStatement(token: string) {
  const [statement, setStatement] = useState<StatementItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadInitial = useCallback(async (showLoader = true) => {
    if (!token) return;
    if (showLoader) setLoading(true);
    try {
      const data = await fetchPharmacyStatement(token, PAGE_SIZE, 0);
      const valid = (data || []).filter((stm) => (stm.debit ?? 0) > 0 || (stm.credit ?? 0) > 0);
      setStatement(valid);
      setHasMore(data.length >= PAGE_SIZE);
    } catch (err) {
      console.warn('Error loading statement:', err);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [token]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !token) return;
    setLoadingMore(true);
    try {
      const nextBatch = await fetchPharmacyStatement(token, PAGE_SIZE, statement.length);
      const validNext = (nextBatch || []).filter((stm) => (stm.debit ?? 0) > 0 || (stm.credit ?? 0) > 0);
      if (validNext.length > 0) {
        setStatement((prev) => [...prev, ...validNext]);
      }
      setHasMore(nextBatch.length >= PAGE_SIZE);
    } catch (err) {
      console.warn('Error loading more statement rows:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [token, loadingMore, hasMore, statement.length]);

  return {
    statement,
    setStatement,
    loading,
    loadingMore,
    hasMore,
    loadInitial,
    loadMore,
  };
}
