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
  variants: any[];
}

export interface User {
  id: number;
  username: string;
  name: string;
  role: 'admin' | 'agent';
  is_enabled: boolean;
  allow_bigcommerce_search: boolean;
}

export interface OrderItem {
  product_id: number;
  bigcommerce_product_id?: number;
  variant_id?: number;
  quantity: number;
  price_at_sale: string;
  name: string;
  sku: string;
  image: string;
}

export interface Order {
  id?: number;
  customer_name: string;
  customer_email?: string;
  status: 'draft' | 'pending_sync' | 'failed' | 'synced';
  sync_error?: string;
  order_note?: string;
  items: OrderItem[];
  total: string;
  date?: string;
  created_by_user_id: number;
  bigcommerce_order_id?: number;
  bigcommerce_customer_id?: number;
  billing_address?: any;
}

const API_BASE = '/api';

/**
 * Returns auth headers derived from the session stored in localStorage.
 * Every protected API call must include these headers so the backend can
 * validate the caller without requiring a separate session cookie.
 */
function getAuthHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('vansales_user');
    if (!raw) return {};
    const user = JSON.parse(raw);
    if (!user?.id) return {};
    return {
      'x-user-id': String(user.id),
      'x-user-role': user.role ?? ''
    };
  } catch {
    return {};
  }
}

// ─── Products ────────────────────────────────────────────────────────────────

export async function getAllProducts(): Promise<Product[]> {
  const res = await fetch(`${API_BASE}/products`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch products');
  return res.json();
}

export async function getPinnedProducts(): Promise<Product[]> {
  const res = await fetch(`${API_BASE}/products/pinned`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch pinned products');
  return res.json();
}

export async function createProduct(product: Omit<Product, 'id'>): Promise<Product> {
  const res = await fetch(`${API_BASE}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(product)
  });
  if (!res.ok) throw new Error('Failed to create product');
  return res.json();
}

export async function toggleProductPin(id: number, is_pinned: boolean): Promise<void> {
  const res = await fetch(`${API_BASE}/products/${id}/pin`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ is_pinned })
  });
  if (!res.ok) throw new Error('Failed to update product pin');
}

export async function resyncProducts(): Promise<{ updated: number; errors: number }> {
  const res = await fetch(`${API_BASE}/products/resync`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Failed to resync products');
  return res.json();
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function getAllAgents(): Promise<User[]> {
  const res = await fetch(`${API_BASE}/users/agents`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch agents');
  return res.json();
}

export async function getAllAdmins(): Promise<User[]> {
  const res = await fetch(`${API_BASE}/users/admins`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch admins');
  return res.json();
}

export async function getAllUsers(): Promise<User[]> {
  const res = await fetch(`${API_BASE}/users`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
}

export async function updateUserStatus(id: number, is_enabled: boolean): Promise<void> {
  const res = await fetch(`${API_BASE}/users/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ is_enabled })
  });
  if (!res.ok) throw new Error('Failed to update user status');
}

export async function updateUserPermission(id: number, allow_bigcommerce_search: boolean): Promise<void> {
  const res = await fetch(`${API_BASE}/users/${id}/permission`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ allow_bigcommerce_search })
  });
  if (!res.ok) throw new Error('Failed to update user permission');
}

export interface DirectVariantResult {
  resultType: 'variant';
  product: Product;
  variant: any;
}

export interface ProductListResult {
  resultType: 'products';
  products: Product[];
}

export type AgentSearchResult = DirectVariantResult | ProductListResult;

export async function agentBigCommerceSearch(query: string, userId: number): Promise<AgentSearchResult> {
  const res = await fetch(
    `${API_BASE}/agent/bigcommerce/search?query=${encodeURIComponent(query)}&userId=${userId}`,
    { headers: getAuthHeaders() }
  );
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Search failed' }));
    throw new Error(error.error || 'BigCommerce search failed');
  }
  return res.json();
}

export async function createUser(userData: any): Promise<User> {
  const res = await fetch(`${API_BASE}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(userData)
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to create user');
  }
  return res.json();
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

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

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function createOrder(order: Omit<Order, 'id' | 'date'>): Promise<{
  order: Order;
  bigcommerce: { success: boolean; order_id?: number; error?: string };
  google_sheets: { success: boolean; error?: string };
}> {
  const res = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(order)
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to create order' }));
    throw new Error(error.error || 'Failed to create order');
  }
  return res.json();
}

export async function getOrdersByUser(userId: number): Promise<Order[]> {
  const res = await fetch(`${API_BASE}/orders/user/${userId}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch orders');
  return res.json();
}

export async function getPendingSyncOrders(): Promise<Order[]> {
  const res = await fetch(`${API_BASE}/orders/pending`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch pending orders');
  return res.json();
}

export async function syncOrder(id: number): Promise<{ success: boolean; bigcommerce_order_id: number }> {
  const res = await fetch(`${API_BASE}/orders/${id}/sync`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Failed to sync order' }));
    throw new Error(errorData.error || 'Failed to sync order');
  }
  return res.json();
}

export async function createDraftOrder(order: Omit<Order, 'id' | 'date'>): Promise<Order> {
  const res = await fetch(`${API_BASE}/orders/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(order)
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to create draft order' }));
    throw new Error(error.error || 'Failed to create draft order');
  }
  return res.json();
}

export async function submitDraftOrder(orderId: number, customerData: {
  bigcommerce_customer_id: number;
  billing_address: any;
}): Promise<{
  order: Order;
  bigcommerce: { success: boolean; order_id?: number; error?: string };
  google_sheets: { success: boolean; error?: string };
}> {
  const res = await fetch(`${API_BASE}/orders/${orderId}/submit-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(customerData)
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to submit draft order' }));
    throw new Error(error.error || 'Failed to submit draft order');
  }
  return res.json();
}

export async function getDraftOrders(): Promise<Order[]> {
  const res = await fetch(`${API_BASE}/orders/drafts`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch draft orders');
  return res.json();
}

// ─── BigCommerce Proxy ────────────────────────────────────────────────────────

export async function searchBigCommerceProducts(query: string, token: string, storeHash: string): Promise<Product[]> {
  const res = await fetch(
    `${API_BASE}/bigcommerce/products/search?query=${encodeURIComponent(query)}`,
    { headers: getAuthHeaders() }
  );
  if (!res.ok) throw new Error('BigCommerce search failed');
  return res.json();
}

export interface BigCommerceCustomer {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company: string;
}

export interface BigCommerceAddress {
  id: number;
  first_name: string;
  last_name: string;
  company: string;
  street_1: string;
  street_2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  country_iso2: string;
  phone: string;
}

export async function searchBigCommerceCustomers(query: string): Promise<BigCommerceCustomer[]> {
  const res = await fetch(
    `${API_BASE}/bigcommerce/customers/search?query=${encodeURIComponent(query)}`,
    { headers: getAuthHeaders() }
  );
  if (!res.ok) throw new Error('Customer search failed');
  return res.json();
}

export async function getCustomerAddresses(customerId: number): Promise<BigCommerceAddress[]> {
  const res = await fetch(`${API_BASE}/bigcommerce/customers/${customerId}/addresses`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch addresses');
  return res.json();
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<{ key: string; value: any }> {
  const res = await fetch(`${API_BASE}/settings/${key}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch setting');
  return res.json();
}

export async function saveSetting(key: string, value: any): Promise<void> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ key, value })
  });
  if (!res.ok) throw new Error('Failed to save setting');
}
