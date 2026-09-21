import Dexie, { Table } from 'dexie';

export interface Product {
  id: number;
  name: string;
  sku: string;
  price: number;
  image: string;
  description: string;
  stock_level: number;
  is_pinned: boolean;
  bigcommerce_id: number;
}

export interface OrderItem {
  product_id: number;
  quantity: number;
  price_at_sale: number;
  name: string;
  sku: string;
  image: string;
}

export interface Order {
  id?: number;
  customer_name: string;
  status: 'pending_sync' | 'synced';
  items: OrderItem[];
  total: number;
  date: string;
  created_by_user_id: number;
  bigcommerce_order_id?: number;
}

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'agent';
  is_enabled: boolean;
  name: string;
}

export interface PriceListCacheEntry {
  key: string;
  price: string;
  currency: string;
  cachedAt: number;
}

export interface LocalPriceHistoryEntry {
  id?: number;
  customer_id: number;
  product_id: number;
  variant_id: number | null;
  price: string;
  order_id: number;
  order_date: string | null;
  created_at: string;
}

export interface LocalPosCustomer {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company: string;
  customer_group_id: number | null;
  customer_group_name?: string;
  is_active: boolean;
  updatedAt: string;
}

export interface PosCustomerSyncMeta {
  key: string;
  scope: string;
  storeScope?: string;
  updatedUntil: string | null;
  hasFullSnapshot: boolean;
  updatedAt: number;
}

export class VanSalesDB extends Dexie {
  products!: Table<Product>;
  orders!: Table<Order>;
  users!: Table<User>;
  priceListCache!: Table<PriceListCacheEntry>;
  localPriceHistory!: Table<LocalPriceHistoryEntry>;
  posCustomers!: Table<LocalPosCustomer, number>;
  posCustomerSyncMeta!: Table<PosCustomerSyncMeta, string>;

  constructor() {
    super('VanSalesDB');
    this.version(1).stores({
      products: '++id, sku, is_pinned, bigcommerce_id',
      orders: '++id, status, date, created_by_user_id',
      users: '++id, username, role'
    });
    this.version(2).stores({
      products: '++id, sku, is_pinned, bigcommerce_id',
      orders: '++id, status, date, created_by_user_id',
      users: '++id, username, role',
      priceListCache: 'key, cachedAt'
    });
    this.version(3).stores({
      products: '++id, sku, is_pinned, bigcommerce_id',
      orders: '++id, status, date, created_by_user_id',
      users: '++id, username, role',
      priceListCache: 'key, cachedAt',
      localPriceHistory: '++id, [customer_id+product_id], [customer_id+product_id+order_id], created_at'
    });
    this.version(4).stores({
      products: '++id, sku, is_pinned, bigcommerce_id',
      orders: '++id, status, date, created_by_user_id',
      users: '++id, username, role',
      priceListCache: 'key, cachedAt',
      localPriceHistory: '++id, [customer_id+product_id], [customer_id+product_id+order_id], created_at',
      posCustomers: 'id, first_name, last_name, email, phone, company, customer_group_id, updatedAt',
      posCustomerSyncMeta: 'key'
    });
  }
}

export const db = new VanSalesDB();

const PRICE_LIST_CACHE_TTL_MS = 30 * 60 * 1000;
export const POS_CUSTOMER_SYNC_META_KEY = "pos-customer-directory";

export async function getPriceListCacheEntry(priceListId: number, variantId: number): Promise<string | null> {
  try {
    const key = `${priceListId}-${variantId}`;
    const entry = await db.priceListCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > PRICE_LIST_CACHE_TTL_MS) {
      await db.priceListCache.delete(key);
      return null;
    }
    return entry.price;
  } catch {
    return null;
  }
}

export async function setPriceListCacheEntry(priceListId: number, variantId: number, price: string): Promise<void> {
  try {
    const key = `${priceListId}-${variantId}`;
    await db.priceListCache.put({ key, price, currency: 'USD', cachedAt: Date.now() });
  } catch {}
}

export async function setPriceListCacheBatch(priceListId: number, prices: Record<number, string>): Promise<void> {
  try {
    const now = Date.now();
    const entries = Object.entries(prices).map(([variantId, price]) => ({
      key: `${priceListId}-${variantId}`,
      price,
      currency: 'USD',
      cachedAt: now,
    }));
    await db.priceListCache.bulkPut(entries);
  } catch {}
}

export async function getPriceListCacheBatch(priceListId: number, variantIds: number[]): Promise<Record<number, string>> {
  try {
    const keys = variantIds.map(id => `${priceListId}-${id}`);
    const entries = await db.priceListCache.bulkGet(keys);
    const now = Date.now();
    const result: Record<number, string> = {};
    for (let i = 0; i < variantIds.length; i++) {
      const entry = entries[i];
      if (entry && (now - entry.cachedAt) <= PRICE_LIST_CACHE_TTL_MS) {
        result[variantIds[i]] = entry.price;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function normalizePosCustomer(customer: Omit<LocalPosCustomer, "updatedAt"> & { updatedAt?: string }): LocalPosCustomer {
  return {
    ...customer,
    first_name: String(customer.first_name ?? ""),
    last_name: String(customer.last_name ?? ""),
    email: String(customer.email ?? ""),
    phone: String(customer.phone ?? ""),
    company: String(customer.company ?? ""),
    customer_group_id: customer.customer_group_id == null ? null : Number(customer.customer_group_id),
    is_active: customer.is_active !== false,
    updatedAt: customer.updatedAt ?? new Date(0).toISOString(),
  };
}

export async function searchLocalPosCustomers(query: string, limit = 10): Promise<LocalPosCustomer[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  const queryDigits = trimmed.replace(/\D/g, "");
  try {
    const rows = await db.posCustomers
      .filter((customer) => {
        const textMatches = [
          customer.first_name,
          customer.last_name,
          `${customer.first_name} ${customer.last_name}`,
          `${customer.last_name} ${customer.first_name}`,
          customer.email,
          customer.phone,
          customer.company,
        ].some((value) => String(value ?? "").toLowerCase().includes(trimmed));
        const phoneMatches = queryDigits.length >= 3 &&
          customer.phone.replace(/\D/g, "").includes(queryDigits);
        return textMatches || phoneMatches;
      })
      .toArray();
    rows.sort((a, b) =>
      `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`) ||
      a.id - b.id,
    );
    return rows.slice(0, limit);
  } catch {
    return [];
  }
}

export async function saveLocalPosCustomers(customers: LocalPosCustomer[]): Promise<void> {
  if (customers.length === 0) return;
  try {
    await db.posCustomers.bulkPut(customers.map(normalizePosCustomer));
  } catch {}
}

export async function getPosCustomerSyncMeta(): Promise<PosCustomerSyncMeta | undefined> {
  try {
    return await db.posCustomerSyncMeta.get(POS_CUSTOMER_SYNC_META_KEY);
  } catch {
    return undefined;
  }
}

export async function savePosCustomerSyncMeta(meta: Omit<PosCustomerSyncMeta, "key">): Promise<void> {
  try {
    await db.posCustomerSyncMeta.put({
      key: POS_CUSTOMER_SYNC_META_KEY,
      ...meta,
    });
  } catch {}
}

export async function clearLocalPosCustomerCache(): Promise<void> {
  try {
    await db.transaction("rw", db.posCustomers, db.posCustomerSyncMeta, async () => {
      await db.posCustomers.clear();
      await db.posCustomerSyncMeta.clear();
    });
  } catch {}
}

// ── Local price history cache (mirrors Postgres price_history_cache) ──────────

const SYNC_TS_KEY = 'vansales_price_history_last_sync';

export function getLastSyncTimestamp(): number | null {
  const raw = localStorage.getItem(SYNC_TS_KEY);
  return raw ? parseInt(raw) : null;
}

export function setLastSyncTimestamp(ms: number): void {
  localStorage.setItem(SYNC_TS_KEY, String(ms));
}

export async function getLocalPriceHistory(
  customerId: number,
  bcProductId: number,
  limit = 10
): Promise<LocalPriceHistoryEntry[]> {
  try {
    const entries = await db.localPriceHistory
      .where('[customer_id+product_id]')
      .equals([customerId, bcProductId])
      .toArray();
    entries.sort((a, b) => {
      const aDate = a.order_date ? new Date(a.order_date).getTime() : 0;
      const bDate = b.order_date ? new Date(b.order_date).getTime() : 0;
      return bDate - aDate;
    });
    return entries.slice(0, limit);
  } catch {
    return [];
  }
}

export async function clearLocalPriceHistory(): Promise<void> {
  try {
    await db.localPriceHistory.clear();
  } catch {}
}

export async function saveLocalPriceHistoryBatch(
  entries: Omit<LocalPriceHistoryEntry, 'id'>[]
): Promise<number> {
  try {
    await db.localPriceHistory.bulkAdd(entries as LocalPriceHistoryEntry[]);
    return entries.length;
  } catch {}
  return 0;
}
