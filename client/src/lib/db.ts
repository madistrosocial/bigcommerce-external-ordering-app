import Dexie, { Table } from 'dexie';

export interface Product {
  id: number;
  name: string;
  sku: string;
  price: number;
  image: string;
  description: string;
  stock_level: number;
  is_pinned: boolean; // Admin pin for "featured" or "required" items
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
  date: string; // ISO string
  created_by_user_id: number;
  bigcommerce_order_id?: number; // Populated after sync
}

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'agent';
  is_enabled: boolean;
  name: string;
}

export class VanSalesDB extends Dexie {
  products!: Table<Product>;
  orders!: Table<Order>;
  users!: Table<User>;

  constructor() {
    super('VanSalesDB');
    this.version(1).stores({
      products: '++id, sku, is_pinned, bigcommerce_id',
      orders: '++id, status, date, created_by_user_id',
      users: '++id, username, role'
    });
  }
}

export const db = new VanSalesDB();
