// API client for backend calls

export interface Product {
  id: number;
  name: string;
  sku: string;
  price: string;
  image: string;
  description: string;
  stock_level: number;
  is_pinned: boolean;
  bigcommerce_id: number;
}

export interface User {
  id: number;
  username: string;
  name: string;
  role: 'admin' | 'agent';
  is_enabled: boolean;
}

export interface OrderItem {
  product_id: number;
  quantity: number;
  price_at_sale: string;
  name: string;
  sku: string;
  image: string;
}

export interface Order {
  id?: number;
  customer_name: string;
  status: 'pending_sync' | 'synced';
  items: OrderItem[];
  total: string;
  date?: string;
  created_by_user_id: number;
  bigcommerce_order_id?: number;
}

const API_BASE = '/api';

// Products
export async function getAllProducts(): Promise<Product[]> {
  const res = await fetch(`${API_BASE}/products`);
  if (!res.ok) throw new Error('Failed to fetch products');
  return res.json();
}

export async function getPinnedProducts(): Promise<Product[]> {
  const res = await fetch(`${API_BASE}/products/pinned`);
  if (!res.ok) throw new Error('Failed to fetch pinned products');
  return res.json();
}

export async function createProduct(product: Omit<Product, 'id'>): Promise<Product> {
  const res = await fetch(`${API_BASE}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(product)
  });
  if (!res.ok) throw new Error('Failed to create product');
  return res.json();
}

export async function toggleProductPin(id: number, is_pinned: boolean): Promise<void> {
  const res = await fetch(`${API_BASE}/products/${id}/pin`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_pinned })
  });
  if (!res.ok) throw new Error('Failed to update product pin');
}

// Users
export async function getAllAgents(): Promise<User[]> {
  const res = await fetch(`${API_BASE}/users/agents`);
  if (!res.ok) throw new Error('Failed to fetch agents');
  return res.json();
}

export async function updateUserStatus(id: number, is_enabled: boolean): Promise<void> {
  const res = await fetch(`${API_BASE}/users/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_enabled })
  });
  if (!res.ok) throw new Error('Failed to update user status');
}

export async function login(username: string, password: string): Promise<User> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Login failed');
  }
  return res.json();
}

// Orders
export async function createOrder(order: Omit<Order, 'id' | 'date'>): Promise<Order> {
  const res = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(order)
  });
  if (!res.ok) throw new Error('Failed to create order');
  return res.json();
}

export async function getOrdersByUser(userId: number): Promise<Order[]> {
  const res = await fetch(`${API_BASE}/orders/user/${userId}`);
  if (!res.ok) throw new Error('Failed to fetch orders');
  return res.json();
}

export async function getPendingSyncOrders(): Promise<Order[]> {
  const res = await fetch(`${API_BASE}/orders/pending`);
  if (!res.ok) throw new Error('Failed to fetch pending orders');
  return res.json();
}

export async function syncOrder(id: number): Promise<{ success: boolean; bigcommerce_order_id: number }> {
  const res = await fetch(`${API_BASE}/orders/${id}/sync`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error('Failed to sync order');
  return res.json();
}

// BigCommerce
export async function searchBigCommerceProducts(query: string, token: string, storeHash: string): Promise<Product[]> {
  const res = await fetch(`${API_BASE}/bigcommerce/products/search?query=${encodeURIComponent(query)}&token=${encodeURIComponent(token)}&storeHash=${encodeURIComponent(storeHash)}`);
  if (!res.ok) throw new Error('BigCommerce search failed');
  return res.json();
}
