import { useState, useEffect, useRef, useCallback } from 'react';
import { getAuthHeaders } from './api';
import { getLastSyncTimestamp, setLastSyncTimestamp, saveLocalPriceHistoryBatch, LocalPriceHistoryEntry } from './db';

const BATCH_LIMIT = 200;
const IDLE_DELAY_MS = 2500;

type DeviceType = 'mobile' | 'tablet' | 'desktop';

function detectDevice(): DeviceType {
  const hasTouch = navigator.maxTouchPoints > 0;
  const w = window.innerWidth;
  if (hasTouch && w < 768) return 'mobile';
  if (hasTouch && w < 1280) return 'tablet';
  return 'desktop';
}

export function usePriceHistorySync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [showTabletPrompt, setShowTabletPrompt] = useState(false);

  const pausedRef = useRef(false);
  const syncRunningRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceRef = useRef<DeviceType>(detectDevice());
  const tabletPromptShownRef = useRef(false);

  const doSync = useCallback(async () => {
    if (syncRunningRef.current) return;
    syncRunningRef.current = true;
    setIsSyncing(true);
    try {
      let afterMs = getLastSyncTimestamp();
      let hasMore = true;
      while (hasMore && !pausedRef.current) {
        const params = new URLSearchParams({ limit: String(BATCH_LIMIT) });
        if (afterMs) params.set('after', String(afterMs));
        const res = await fetch(`/api/price-history/sync?${params}`, {
          headers: getAuthHeaders(),
        });
        if (!res.ok) break;
        const records: any[] = await res.json();
        if (!Array.isArray(records) || records.length === 0) { hasMore = false; break; }
        const entries: Omit<LocalPriceHistoryEntry, 'id'>[] = records.map((r) => ({
          customer_id: r.customer_id,
          product_id: r.product_id,
          variant_id: r.variant_id ?? null,
          price: String(r.price),
          order_id: r.order_id,
          order_date: r.order_date ?? null,
          created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        }));
        await saveLocalPriceHistoryBatch(entries);
        // Update last sync timestamp to the last record's created_at
        const lastRecord = records[records.length - 1];
        if (lastRecord?.created_at) {
          const newTs = new Date(lastRecord.created_at).getTime();
          if (!isNaN(newTs)) {
            afterMs = newTs;
            setLastSyncTimestamp(newTs);
          }
        }
        if (records.length < BATCH_LIMIT) { hasMore = false; break; }
        // Small pause between batches to avoid blocking UI
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      }
    } catch {}
    syncRunningRef.current = false;
    setIsSyncing(false);
  }, []);

  const scheduleIdleSync = useCallback(() => {
    if (deviceRef.current !== 'desktop') return;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      pausedRef.current = false;
      doSync();
    }, IDLE_DELAY_MS);
  }, [doSync]);

  const handleUserActivity = useCallback(() => {
    pausedRef.current = true;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    scheduleIdleSync();
  }, [scheduleIdleSync]);

  // Tablet prompt acceptance handler — exposed for UI
  const acceptTabletSync = useCallback(() => {
    setShowTabletPrompt(false);
    pausedRef.current = false;
    doSync();
  }, [doSync]);

  const dismissTabletSync = useCallback(() => {
    setShowTabletPrompt(false);
  }, []);

  useEffect(() => {
    const device = detectDevice();
    deviceRef.current = device;

    if (device === 'mobile') return; // Mobile: do nothing

    if (device === 'tablet') {
      if (!tabletPromptShownRef.current) {
        tabletPromptShownRef.current = true;
        setShowTabletPrompt(true);
      }
      return;
    }

    // Desktop: attach idle listeners and start idle timer
    const events: (keyof WindowEventMap)[] = ['keydown', 'pointermove', 'pointerdown', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, handleUserActivity, { passive: true }));
    scheduleIdleSync();

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleUserActivity));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      pausedRef.current = true;
    };
  }, [handleUserActivity, scheduleIdleSync]);

  return { isSyncing, showTabletPrompt, acceptTabletSync, dismissTabletSync };
}
