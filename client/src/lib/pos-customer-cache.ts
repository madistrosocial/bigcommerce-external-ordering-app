import type { BigCommerceCustomer } from "./api";
import { getPosCustomerSnapshot } from "./api";
import {
  clearLocalPosCustomerCache,
  getPosCustomerSyncMeta,
  LocalPosCustomer,
  saveLocalPosCustomers,
  savePosCustomerSyncMeta,
  searchLocalPosCustomers,
} from "./db";

export const POS_CUSTOMER_CACHE_MAX_AGE_MS = 20 * 60 * 1000;

let syncInFlight: Promise<{ synced: number }> | null = null;

export function toLocalPosCustomer(
  customer: BigCommerceCustomer,
  updatedAt = new Date().toISOString(),
): LocalPosCustomer {
  return {
    id: Number(customer.id),
    first_name: customer.first_name ?? "",
    last_name: customer.last_name ?? "",
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    company: customer.company ?? "",
    customer_group_id: customer.customer_group_id ?? null,
    customer_group_name: customer.customer_group_name,
    is_active: true,
    updatedAt,
  };
}

export function toBigCommerceCustomer(customer: LocalPosCustomer): BigCommerceCustomer {
  return {
    id: customer.id,
    first_name: customer.first_name,
    last_name: customer.last_name,
    email: customer.email,
    phone: customer.phone,
    company: customer.company,
    customer_group_id: customer.customer_group_id ?? undefined,
    customer_group_name: customer.customer_group_name,
    store_credit_amount: 0,
  };
}

export async function searchCachedPosCustomers(query: string, limit = 10): Promise<BigCommerceCustomer[]> {
  const rows = await searchLocalPosCustomers(query, limit);
  return rows.map(toBigCommerceCustomer);
}

export async function isPosCustomerCacheFresh(scope: string): Promise<boolean> {
  const meta = await getPosCustomerSyncMeta();
  return Boolean(
    meta?.scope === scope &&
    meta.hasFullSnapshot &&
    meta.updatedAt > Date.now() - POS_CUSTOMER_CACHE_MAX_AGE_MS,
  );
}

export async function syncPosCustomerDirectory(scope: string): Promise<{ synced: number }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { synced: 0 };
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    let meta = await getPosCustomerSyncMeta();
    if (meta && meta.scope !== scope) {
      await clearLocalPosCustomerCache();
      meta = undefined;
    }

    let synced = 0;
    let storeScope = meta?.storeScope;
    let forceFullSnapshot = !meta?.hasFullSnapshot;

    // The first page reveals the current store. If the store changed since
    // the last sync, discard the old directory and restart from a full page.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const updatedSince = forceFullSnapshot ? null : meta?.updatedUntil ?? null;
      let updatedUntil: string | null = null;
      let cursor: number | null = null;
      let hasMore = true;
      let pageIsFirst = true;

      while (hasMore) {
        const page = await getPosCustomerSnapshot({
          updatedSince,
          updatedUntil,
          cursor,
          limit: 500,
        });
        if (pageIsFirst && storeScope && page.storeScope !== storeScope) {
          await clearLocalPosCustomerCache();
          meta = undefined;
          storeScope = page.storeScope;
          forceFullSnapshot = true;
          synced = 0;
          break;
        }
        pageIsFirst = false;
        storeScope = page.storeScope;
        updatedUntil = updatedUntil ?? page.updatedUntil;
        await saveLocalPosCustomers(
          page.customers.map((customer) => toLocalPosCustomer(customer, updatedUntil!)),
        );
        synced += page.customers.length;
        hasMore = page.hasMore;
        cursor = page.nextCursor;
      }

      if (!hasMore) {
        await savePosCustomerSyncMeta({
          scope,
          storeScope,
          updatedUntil,
          hasFullSnapshot: true,
          updatedAt: Date.now(),
        });
        return { synced };
      }
    }

    return { synced };
  })();

  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}
