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

export class VanSalesDB extends Dexie {
  products!: Table<Product>;
  orders!: Table<Order>;
  users!: Table<User>;
  priceListCache!: Table<PriceListCacheEntry>;

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
  }
}

export const db = new VanSalesDB();

const PRICE_LIST_CACHE_TTL_MS = 30 * 60 * 1000;

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
