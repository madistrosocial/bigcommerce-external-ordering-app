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
  min_purchase_quantity?: number | null;
  max_purchase_quantity?: number | null;
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
  variant_option_values?: any[];
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
  customer_note?: string;
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
export function getAuthHeaders(): Record<string, string> {
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

export async function getFreshPinnedProducts(): Promise<Product[]> {
  const res = await fetch(`${API_BASE}/products/pinned/fresh`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch fresh pinned products');
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

export async function toggleProductPromotion(id: number, is_promotion: boolean): Promise<void> {
  const res = await fetch(`${API_BASE}/products/${id}/promotion`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ is_promotion })
  });
  if (!res.ok) throw new Error('Failed to update product promotion');
}

export async function getFreshPromotionProducts(): Promise<Product[]> {
  const res = await fetch(`${API_BASE}/products/promotions/fresh`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch fresh promotion products');
  return res.json();
}

export async function getBCSaleProducts(): Promise<Product[]> {
  const res = await fetch(`${API_BASE}/products/sale-category`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Failed to fetch Sale products');
  }
  return res.json();
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

export async function deleteOrder(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/orders/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Failed to delete order');
}

export interface PriceHistoryEntry {
  price: string;
  date: string;
  orderId?: number;
}

export async function getCustomerPriceHistory(
  bcCustomerId: number,
  bcProductId: number,
  variantId?: number
): Promise<PriceHistoryEntry[]> {
  const params = new URLSearchParams({ bcProductId: String(bcProductId) });
  if (variantId) params.set('variantId', String(variantId));
  const res = await fetch(
    `${API_BASE}/orders/customer/${bcCustomerId}/price-history?${params}`,
    { headers: getAuthHeaders() }
  );
  if (!res.ok) throw new Error('Failed to fetch price history');
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
  customer_group_id?: number;
  customer_group_name?: string;
  price_list_id?: number | null;
  store_credit_amount?: number;
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

export async function getCustomerByBcId(bcId: number): Promise<BigCommerceCustomer> {
  const res = await fetch(`${API_BASE}/bigcommerce/customers/by-bc-id/${bcId}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Customer not found');
  return res.json();
}

// ── BigCommerce Categories ────────────────────────────────────────────────────

export interface BcCategory {
  id: number;
  name: string;
  parent_id: number;
  is_visible: boolean;
  sort_order: number;
}

export async function getBcCategories(): Promise<BcCategory[]> {
  const res = await fetch(`${API_BASE}/bigcommerce/categories`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch categories");
  return res.json();
}

export interface BcCategoryProductsResult {
  products: Product[];
  total: number;
  total_pages: number;
  current_page: number;
}

export async function getBcCategoryProducts(
  categoryId: number,
  page: number,
  limit: number,
): Promise<BcCategoryProductsResult> {
  const res = await fetch(
    `${API_BASE}/bigcommerce/category-products?categoryId=${categoryId}&page=${page}&limit=${limit}`,
    { headers: getAuthHeaders() },
  );
  if (!res.ok) throw new Error("Failed to fetch category products");
  return res.json();
}

export interface StockInfo {
  bigcommerce_id: number;
  stock_level: number;
  min_purchase_quantity: number | null;
  max_purchase_quantity: number | null;
  variants: {
    id: number;
    stock_level: number;
    min_purchase_quantity: number | null;
    max_purchase_quantity: number | null;
  }[];
}

export async function refreshProductStock(bigcommerceIds: number[]): Promise<StockInfo[]> {
  const res = await fetch(`${API_BASE}/products/refresh-stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ bigcommerce_ids: bigcommerceIds })
  });
  if (!res.ok) throw new Error('Failed to refresh stock');
  return res.json();
}

// ─── Price Tier Configuration ─────────────────────────────────────────────────

export interface PriceTier {
  id: string;
  label: string;
  customerGroupId: number;
  priceListId: number;
  color: string;
  enabled: boolean;
}

export interface PriceTierConfig {
  enabled: boolean;
  scopeMode: 'app' | 'all';
  tiers: PriceTier[];
}

export const DEFAULT_TIER_CONFIG: PriceTierConfig = {
  enabled: false,
  scopeMode: 'app',
  tiers: [],
};

export async function getPriceListRecords(
  priceListId: number,
  variantIds: number[]
): Promise<Record<number, string>> {
  if (!variantIds.length) return {};
  try {
    const res = await fetch(
      `${API_BASE}/bigcommerce/price-list/${priceListId}/records?variantIds=${variantIds.join(',')}`,
      { headers: getAuthHeaders() }
    );
    if (!res.ok) return {};
    return res.json();
  } catch {
    return {};
  }
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

// ─── Max Purchase Qty Override ────────────────────────────────────────────────

// Product-level override (per spec: max_purchase_quantity is product-level in BigCommerce)
export async function setProductMaxQty(
  items: Array<{ product_id: number; max_purchase_quantity: number | null }>
): Promise<void> {
  const res = await fetch(`${API_BASE}/bigcommerce/products/set-product-max-qty`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ items })
  });
  if (!res.ok) throw new Error('Failed to update product max qty');
}

export async function setVariantMaxQty(
  items: Array<{ product_id: number; variant_id: number; max_purchase_quantity: number | null }>
): Promise<void> {
  const res = await fetch(`${API_BASE}/bigcommerce/products/set-variant-max-qty`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ items })
  });
  if (!res.ok) throw new Error('Failed to update variant max qty');
}

// ─── Inventory Push ───────────────────────────────────────────────────────────

export interface InventoryPushLog {
  id: number;
  user_id: number;
  username: string;
  sku: string;
  product_id: number;
  variant_id: number;
  product_name: string;
  variant_name: string;
  previous_inventory: number;
  new_inventory: number;
  quantity_added: number;
  reason: string | null;
  created_at: string;
}

export async function pushInventory(data: {
  product_id: number;
  variant_id: number;
  sku: string;
  quantity_added: number;
  reason?: string;
  product_name?: string;
  variant_name?: string;
}): Promise<{ success: boolean; previous_inventory: number; new_inventory: number; log: InventoryPushLog }> {
  const res = await fetch(`${API_BASE}/inventory/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to push inventory' }));
    throw new Error(err.error || 'Failed to push inventory');
  }
  return res.json();
}

export async function getInventoryPushLogs(): Promise<InventoryPushLog[]> {
  const res = await fetch(`${API_BASE}/inventory/push-logs`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch inventory push logs');
  return res.json();
}

export async function getAllAdminOrders(): Promise<Order[]> {
  const res = await fetch(`${API_BASE}/orders/all`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch all orders');
  return res.json();
}

// ─── RBAC ─────────────────────────────────────────────────────────────────────

export interface RbacPermission {
  id: number;
  module: string;
  action: string;
  description?: string | null;
}

export interface RbacRole {
  id: number;
  name: string;
  description?: string | null;
  created_at: string;
  permissions: RbacPermission[];
}

export interface RbacUser {
  id: number;
  username: string;
  name: string;
  role: string;
  is_enabled: boolean;
  allow_bigcommerce_search: boolean;
  role_id?: number | null;
  permissions: RbacPermission[];
}

export async function updateUserDetails(
  id: number,
  data: Partial<{ name: string; username: string; password: string; role: string; is_enabled: boolean; allow_bigcommerce_search: boolean }>,
): Promise<User> {
  const res = await fetch(`${API_BASE}/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || "Failed to update user");
  }
  return res.json();
}

export async function updateRole(id: number, data: { name: string; description?: string }): Promise<RbacRole> {
  const res = await fetch(`${API_BASE}/roles/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update group");
  return res.json();
}

export async function getRoles(): Promise<RbacRole[]> {
  const res = await fetch(`${API_BASE}/roles`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch roles');
  return res.json();
}

export async function createRole(data: { name: string; description?: string }): Promise<RbacRole> {
  const res = await fetch(`${API_BASE}/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create role');
  return res.json();
}

export async function deleteRole(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/roles/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to delete role');
}

export async function getPermissions(): Promise<RbacPermission[]> {
  const res = await fetch(`${API_BASE}/permissions`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch permissions');
  return res.json();
}

export async function createPermission(data: { module: string; action: string; description?: string }): Promise<RbacPermission> {
  const res = await fetch(`${API_BASE}/permissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create permission');
  return res.json();
}

export async function deletePermission(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/permissions/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to delete permission');
}

export async function addPermissionToRole(roleId: number, permId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/roles/${roleId}/permissions/${permId}`, {
    method: 'POST', headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to assign permission to role');
}

export async function removePermissionFromRole(roleId: number, permId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/roles/${roleId}/permissions/${permId}`, {
    method: 'DELETE', headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to remove permission from role');
}

export async function getAdminUsers(): Promise<RbacUser[]> {
  const res = await fetch(`${API_BASE}/admin/users`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
}

export async function setUserRole(userId: number, roleId: number | null): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/users/${userId}/role`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ role_id: roleId }),
  });
  if (!res.ok) throw new Error('Failed to set user role');
}

export async function addPermissionToUser(userId: number, permId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/users/${userId}/permissions/${permId}`, {
    method: 'POST', headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to add user permission');
}

export async function removePermissionFromUser(userId: number, permId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/users/${userId}/permissions/${permId}`, {
    method: 'DELETE', headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to remove user permission');
}

export async function getMyPermissions(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/auth/permissions`, { headers: getAuthHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return data.permissions || [];
}

// ─── Invoice ──────────────────────────────────────────────────────────────────

export interface InvoiceSettings {
  company_name: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  logo_base64: string;
  terms: string;
  html_template: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  smtp_from: string;
  email_body: string;
}

export async function getInvoiceSettings(): Promise<InvoiceSettings> {
  const res = await fetch(`${API_BASE}/invoice/settings`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch invoice settings');
  return res.json();
}

export async function saveInvoiceSettings(s: Partial<InvoiceSettings>): Promise<void> {
  const res = await fetch(`${API_BASE}/invoice/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(s),
  });
  if (!res.ok) throw new Error('Failed to save invoice settings');
}

export async function getDefaultInvoiceTemplate(): Promise<string> {
  const res = await fetch(`${API_BASE}/invoice/default-template`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch default template');
  const data = await res.json();
  return data.template;
}

export async function sendInvoiceEmail(data: { to: string; subject: string; pdf_base64: string }): Promise<void> {
  const res = await fetch(`${API_BASE}/invoice/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to send email' }));
    throw new Error(err.error || 'Failed to send email');
  }
}
