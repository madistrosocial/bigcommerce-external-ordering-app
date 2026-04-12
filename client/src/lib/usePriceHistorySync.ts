import { useState, useCallback } from 'react';
import { getAuthHeaders } from './api';
import { saveLocalPriceHistoryBatch, LocalPriceHistoryEntry, clearLocalPriceHistory } from './db';

export function usePriceHistorySync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);

  const syncPriceHistory = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await fetch('/api/price-history/sync', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return;
      const records: any[] = await res.json();
      if (!Array.isArray(records)) return;

      await clearLocalPriceHistory();

      const entries: Omit<LocalPriceHistoryEntry, 'id'>[] = records.map((r) => ({
        customer_id: r.customer_id,
        product_id: r.product_id,
        variant_id: r.variant_id ?? null,
        price: String(r.price),
        order_id: r.order_id,
        order_date: r.order_date ?? null,
        created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      }));

      if (entries.length > 0) {
        await saveLocalPriceHistoryBatch(entries);
      }

      console.log('SYNC COMPLETE', entries.length);
      setLastSyncTime(Date.now());
    } catch (err) {
      console.error('SYNC FAILED', err);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  return { isSyncing, lastSyncTime, syncPriceHistory };
}
