// API client for backend calls

export interface Product {
  id: number;
  name: string;
  sku: string;
  price: string;
  cost_price?: string | null;
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
  default_landing_page?: string;
  auth_token?: string;
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
  created_by_name?: string;
  created_by_username?: string;
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
    if (!user?.auth_token) return {};
    return {
      Authorization: `Bearer ${user.auth_token}`,
    };
  } catch {
    return {};
  }
}

// ─── Marketing ────────────────────────────────────────────────────────────────

async function marketingRequest(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...getAuthHeaders(), ...(init.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Marketing request failed");
  }
  return res.status === 204 ? null : res.json();
}

export const getMarketingDashboard = () => marketingRequest("/marketing/dashboard");
export const getMarketingSenderSettings = () => marketingRequest("/marketing/sender-settings");
export const getMarketingProviderStatus = () => marketingRequest("/marketing/provider-status");
export const saveMarketingSenderSettings = (data: { emails: string[]; defaultEmail: string }) =>
  marketingRequest("/marketing/sender-settings", { method: "PUT", body: JSON.stringify(data) });

export const getAdminZohoCredentials = () => marketingRequest("/admin/zoho-credentials");
export const saveAdminZohoCredentials = (data: {
  credentials: Record<string, string>;
  clear?: string[];
}) => marketingRequest("/admin/zoho-credentials", { method: "PUT", body: JSON.stringify(data) });
export const clearAdminZohoCredentials = () =>
  marketingRequest("/admin/zoho-credentials", { method: "DELETE" });
export const getMarketingCampaigns = (params: { search?: string; status?: string } = {}) =>
  marketingRequest(`/marketing/campaigns?search=${encodeURIComponent(params.search || "")}&status=${encodeURIComponent(params.status || "all")}`);
export const getMarketingCampaign = (id: number) => marketingRequest(`/marketing/campaigns/${id}`);
export const getMarketingCustomerGroups = () => marketingRequest("/marketing/customer-groups");
export const searchMarketingProducts = (query: string) =>
  marketingRequest(`/marketing/products/search?query=${encodeURIComponent(query)}`);
export const createMarketingCampaign = (data: any) => marketingRequest("/marketing/campaigns", { method: "POST", body: JSON.stringify(data) });
export const updateMarketingCampaign = (id: number, data: any) => marketingRequest(`/marketing/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteMarketingCampaign = (id: number) => marketingRequest(`/marketing/campaigns/${id}`, { method: "DELETE" });
export const updateMarketingCampaignStatus = (id: number, status: string) =>
  marketingRequest(`/marketing/campaigns/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
export const sendMarketingTest = (id: number, email: string) =>
  marketingRequest(`/marketing/campaigns/${id}/test-send`, { method: "POST", body: JSON.stringify({ email }) });
export const sendMarketingCampaign = (id: number) =>
  marketingRequest(`/marketing/campaigns/${id}/send`, { method: "POST", body: JSON.stringify({ confirm: true }) });
export const scheduleMarketingCampaign = (id: number, scheduled_at: string, timezone = "UTC") =>
  marketingRequest(`/marketing/campaigns/${id}/schedule`, { method: "POST", body: JSON.stringify({ scheduled_at, timezone }) });
export const pauseMarketingCampaign = (id: number) =>
  marketingRequest(`/marketing/campaigns/${id}/pause`, { method: "POST" });
export const duplicateMarketingCampaign = (id: number) =>
  marketingRequest(`/marketing/campaigns/${id}/duplicate`, { method: "POST" });
export const getMarketingRecipients = (id: number, status = "all") =>
  marketingRequest(`/marketing/campaigns/${id}/recipients?status=${encodeURIComponent(status)}`);
export const getMarketingAnalytics = (params: { campaignId?: number; dateFrom?: string; dateTo?: string } = {}) =>
  marketingRequest(`/marketing/analytics?${new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== "") as string[][]).toString()}`);
export const getMarketingAudiences = () => marketingRequest("/marketing/audiences");
export const getMarketingAudience = (id: number) => marketingRequest(`/marketing/audiences/${id}`);
export const createMarketingAudience = (data: any) => marketingRequest("/marketing/audiences", { method: "POST", body: JSON.stringify(data) });
export const updateMarketingAudience = (id: number, data: any) => marketingRequest(`/marketing/audiences/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteMarketingAudience = (id: number) => marketingRequest(`/marketing/audiences/${id}`, { method: "DELETE" });
export const getMarketingAudienceCustomers = (params: { search?: string; limit?: number; offset?: number } = {}) =>
  marketingRequest(`/marketing/audience-customers?search=${encodeURIComponent(params.search || "")}&limit=${params.limit || 25}&offset=${params.offset || 0}`);
export const getMarketingContacts = (params: { search?: string; type?: string; limit?: number; offset?: number } = {}) =>
  marketingRequest(`/marketing/contacts?search=${encodeURIComponent(params.search || "")}&type=${encodeURIComponent(params.type || "all")}&limit=${params.limit || 25}&offset=${params.offset || 0}`);
export const importMarketingContacts = (csv: string, contact_type: "lead" | "prospect") =>
  marketingRequest("/marketing/contacts/import", { method: "POST", body: JSON.stringify({ csv, contact_type }) });
export const getMarketingAudienceMembers = (id: number, params: { search?: string; source?: string; status?: string; limit?: number; offset?: number } = {}) =>
  marketingRequest(`/marketing/audiences/${id}/members?search=${encodeURIComponent(params.search || "")}&source=${encodeURIComponent(params.source || "all")}&status=${encodeURIComponent(params.status || "all")}&limit=${params.limit || 25}&offset=${params.offset || 0}`);
export const getMarketingAudiencePreview = (filters: any) =>
  marketingRequest("/marketing/audience-preview", { method: "POST", body: JSON.stringify({ filters, limit: 25 }) });
export const getMarketingTemplates = () => marketingRequest("/marketing/templates");
export const createMarketingTemplate = (data: any) => marketingRequest("/marketing/templates", { method: "POST", body: JSON.stringify(data) });
export const updateMarketingTemplate = (id: number, data: any) => marketingRequest(`/marketing/templates/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const archiveMarketingTemplate = (id: number, archived = true) => marketingRequest(`/marketing/templates/${id}/archive`, { method: "POST", body: JSON.stringify({ archived }) });
export const getMarketingAutomations = () => marketingRequest("/marketing/automations");
export const getMarketingAutomation = (id: number) => marketingRequest(`/marketing/automations/${id}`);
export const createMarketingAutomation = (data: any) => marketingRequest("/marketing/automations", { method: "POST", body: JSON.stringify(data) });
export const updateMarketingAutomation = (id: number, data: any) => marketingRequest(`/marketing/automations/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const updateMarketingAutomationStatus = (id: number, status: string) => marketingRequest(`/marketing/automations/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
export const getMarketingPreference = (id: number) => marketingRequest(`/marketing/customers/${id}/preference`);
export const updateMarketingPreference = (id: number, email_subscribed: boolean, reason?: string) => marketingRequest(`/marketing/customers/${id}/preference`, { method: "PATCH", body: JSON.stringify({ email_subscribed, reason }) });

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
  bigcommerce: { success: boolean; order_id?: number; bc_credit_remaining?: number | null; error?: string };
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
  bigcommerce: { success: boolean; order_id?: number; bc_credit_remaining?: number | null; error?: string };
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

export async function getDraftOrders(viewAll = false): Promise<Order[]> {
  const res = await fetch(`${API_BASE}/orders/drafts${viewAll ? "?scope=all" : ""}`, {
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

export interface BigCommerceCustomerGroup {
  id: number;
  name: string;
}

export interface CustomerSignup {
  id: number;
  bigcommerce_customer_id: number;
  first_name: string;
  last_name: string;
  email: string;
  company?: string | null;
  customer_group_id?: number | null;
  customer_group_name?: string | null;
  attribution: string;
  shipping_address?: any;
  signed_up_by_user_id: number;
  signed_up_by_name: string;
  primary_rep_id?: number | null;
  primary_rep_name?: string | null;
  crm_customer_id?: number | null;
  created_at: string;
}

export async function getBigCommerceCustomerGroups(): Promise<BigCommerceCustomerGroup[]> {
  const res = await fetch(`${API_BASE}/bigcommerce/customer-groups`, { headers: getAuthHeaders() });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to fetch customer groups' }));
    throw new Error(error.error || 'Failed to fetch customer groups');
  }
  return res.json();
}

export async function testBigCommerceCustomerGroup(id: number, name: string): Promise<BigCommerceCustomerGroup> {
  const res = await fetch(`${API_BASE}/bigcommerce/customer-groups/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ id, name }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Customer group validation failed');
  return data;
}

export async function getBigCommercePublicConfig(): Promise<{ storeHash: string }> {
  const res = await fetch(`${API_BASE}/bigcommerce/public-config`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Failed to fetch store configuration");
  return res.json();
}

export async function getCustomerSignupConfig(): Promise<{ groupId: number; groupName: string }> {
  const res = await fetch(`${API_BASE}/customer-signups/config`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Failed to fetch customer signup configuration");
  return res.json();
}

export async function getCustomerSignups(page = 1, limit = 50, filters?: { dateFrom?: string; dateTo?: string; signedUpBy?: number }): Promise<{ rows: CustomerSignup[]; total: number; page: number; limit: number; can_view_all: boolean }> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filters?.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters?.dateTo) params.set("dateTo", filters.dateTo);
  if (filters?.signedUpBy) params.set("signedUpBy", String(filters.signedUpBy));
  const res = await fetch(`${API_BASE}/customer-signups?${params}`, { headers: getAuthHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to fetch customer signups');
  return data;
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

export async function getCustomerStoreCredit(bcCustomerId: number): Promise<number> {
  const res = await fetch(`${API_BASE}/pos/customer-store-credit/${bcCustomerId}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch store credit');
  const data = await res.json();
  return Number(data.store_credit) || 0;
}

export interface PriceOverrideAuditPayload {
  customer_id?: number | null;
  customer_name?: string | null;
  order_id?: number | null;
  bigcommerce_order_id?: number | null;
  product_id: number;
  product_name: string;
  sku: string;
  product_cost: string | number;
  selling_price: string | number;
}

export async function createPriceOverrideAudit(payload: PriceOverrideAuditPayload): Promise<any> {
  const res = await fetch(`${API_BASE}/pos/price-override-audit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to log price override' }));
    throw new Error(error.error || 'Failed to log price override');
  }
  return res.json();
}

export interface StoreCreditUsagePayload {
  bigcommerce_customer_id: number;
  customer_name?: string | null;
  order_id?: number | null;
  bigcommerce_order_id?: number | null;
  credit_used: number;
  order_total_before: number;
  final_order_total: number;
  bc_updated_balance?: number | null;
}

export async function applyStoreCreditUsage(payload: StoreCreditUsagePayload): Promise<any> {
  const res = await fetch(`${API_BASE}/pos/store-credit-usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to apply store credit' }));
    throw new Error(error.error || 'Failed to apply store credit');
  }
  return res.json();
}

export interface PosPriceOverrideAuditRow {
  id: number;
  user_id: number;
  customer_id: number | null;
  customer_name: string | null;
  order_id: number | null;
  bigcommerce_order_id: number | null;
  product_id: number;
  product_name: string;
  sku: string;
  product_cost: string;
  selling_price: string;
  loss_amount: string;
  created_at: string;
}

export interface PosStoreCreditUsageRow {
  id: number;
  order_id: number | null;
  bigcommerce_order_id: number | null;
  customer_id: number;
  customer_name: string | null;
  cashier_id: number;
  credit_before: string;
  credit_used: string;
  credit_remaining: string;
  order_total_before: string;
  final_order_total: string;
  created_at: string;
}

export interface PosReportQuery {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  dateFrom?: string;
  dateTo?: string;
  sku?: string;
  orderSearch?: string;
}

export async function getPriceOverrideAudit(query: PosReportQuery = {}): Promise<{ rows: PosPriceOverrideAuditRow[]; total: number }> {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => { if (v !== undefined && v !== "") params.set(k, String(v)); });
  const res = await fetch(`${API_BASE}/pos/price-override-audit?${params.toString()}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Failed to fetch price override audit");
  return res.json();
}

export async function getStoreCreditUsageReport(query: PosReportQuery = {}): Promise<{ rows: PosStoreCreditUsageRow[]; total: number }> {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => { if (v !== undefined && v !== "") params.set(k, String(v)); });
  const res = await fetch(`${API_BASE}/pos/store-credit-usage?${params.toString()}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Failed to fetch store credit usage");
  return res.json();
}

export async function getCustomerByBcId(bcId: number): Promise<BigCommerceCustomer> {
  const res = await fetch(`${API_BASE}/bigcommerce/customers/by-bc-id/${bcId}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Customer not found');
  return res.json();
}

export interface CrmMetrics {
  total: number;
  healthy: number;
  watch: number;
  at_risk: number;
  lost: number;
  needs_follow_up: number;
  inactive: number;
  by_account_type: Record<string, number>;
}

export async function getCrmMetrics(): Promise<CrmMetrics> {
  const res = await fetch(`${API_BASE}/crm/metrics`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch CRM metrics");
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
  skuvault_location: string | null;
  created_at: string;
}

export async function resolveSkuVaultLocation(sku: string): Promise<{
  sku: string;
  locationCode: string | null;
  currentQty: number | null;
  source: "primary" | "fallback_api" | "fallback_config" | "not_found" | "not_configured" | "error";
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/inventory/resolve-location?sku=${encodeURIComponent(sku)}`, {
    headers: getAuthHeaders(),
  });
  return res.json();
}

export async function pushInventory(data: {
  product_id: number;
  variant_id: number;
  sku: string;
  quantity_added: number;
  reason?: string;
  product_name?: string;
  variant_name?: string;
  push_to_bigcommerce?: boolean;
  push_to_skuvault?: boolean;
}): Promise<{ success: boolean; previous_inventory: number; new_inventory: number; log: InventoryPushLog; skuvault?: any }> {
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

// ─── Inventory Audit ─────────────────────────────────────────────────────────

export interface InventoryAuditTask {
  id: number;
  sku: string;
  product_id: number;
  variant_id: number;
  product_name: string;
  variant_name: string;
  status: string;
  source: string;
  total_push_qty: number;
  push_count: number;
  last_push_at: string | null;
  system_qty: number | null;
  physical_qty: number | null;
  variance: number | null;
  reason: string | null;
  notes: string | null;
  skuvault_result: any;
  skuvault_location: string | null;
  created_at: string;
  completed_at: string | null;
  created_by: number | null;
  completed_by: number | null;
  completed_by_name: string | null;
}

export interface AuditProductGroup {
  product_id: number;
  product_name: string;
  sku_count: number;
  total_push_qty: number;
  last_push_at: string | null;
  source: string;
  status: string;
  sku_group: string | null;
}

export interface AuditKPIs {
  totalPendingTasks: number;
  skusToAudit: number;
  totalPendingQty: number;
  lastAuditAt: string | null;
  lastAuditBy: string | null;
}

export async function getAuditKPIs(): Promise<AuditKPIs> {
  const res = await fetch(`${API_BASE}/inventory/audit/kpis`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch audit KPIs');
  return res.json();
}

export async function getAuditQueue(opts?: { page?: number; limit?: number; search?: string; status?: string; source?: string; dateFrom?: string; dateTo?: string }): Promise<{ groups: AuditProductGroup[]; total: number }> {
  const params = new URLSearchParams();
  if (opts?.page !== undefined) params.set('page', String(opts.page));
  if (opts?.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts?.search) params.set('search', opts.search);
  if (opts?.status) params.set('status', opts.status);
  if (opts?.source) params.set('source', opts.source);
  if (opts?.dateFrom) params.set('dateFrom', opts.dateFrom);
  if (opts?.dateTo) params.set('dateTo', opts.dateTo);
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/inventory/audit${qs ? `?${qs}` : ''}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch audit queue');
  return res.json();
}

export async function getAuditTasksForProduct(productId: number, status?: string): Promise<InventoryAuditTask[]> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const res = await fetch(`${API_BASE}/inventory/audit/product/${productId}/tasks?${params}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch audit tasks');
  return res.json();
}

export async function completeAuditTask(id: number, data: { physical_qty: number; variance: number; reason: string; notes?: string }): Promise<InventoryAuditTask> {
  const res = await fetch(`${API_BASE}/inventory/audit/tasks/${id}/complete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: 'Failed' })); throw new Error(e.error); }
  return res.json();
}

export async function getSkuVaultLiveQty(skus: string[]): Promise<Record<string, { onHand: number; pending: number; available: number }>> {
  const res = await fetch(`${API_BASE}/inventory/skuvault-live-qty`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ skus }),
  });
  if (!res.ok) throw new Error('Failed to fetch live SKUVault quantities');
  return res.json();
}

export async function batchCompleteAuditTasks(items: { id: number; physical_qty: number; variance: number }[], reason: string, notes?: string): Promise<{ results: { id: number; sku: string; success: boolean; error?: string }[] }> {
  const res = await fetch(`${API_BASE}/inventory/audit/tasks/batch-complete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ items, reason, notes }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: 'Failed' })); throw new Error(e.error); }
  return res.json();
}

export async function getSkuVaultSettings(): Promise<{ tenantToken: string; userToken: string; warehouseId: number | null; warehouseLocation: string; reasons: string[]; hasCredentials: boolean; lastTestedAt?: string; lastTestOk?: boolean }> {
  const res = await fetch(`${API_BASE}/settings/skuvault`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch SKUVault settings');
  return res.json();
}

export async function saveSkuVaultSettings(data: { tenantToken: string; userToken: string; warehouseId?: number | null; warehouseLocation?: string; reasons?: string[] }): Promise<void> {
  const res = await fetch(`${API_BASE}/settings/skuvault`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: 'Failed' })); throw new Error(e.error); }
}

export async function testSkuVaultConnection(): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/settings/skuvault/test`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: 'Failed' })); throw new Error(e.error); }
  return res.json();
}

export async function getInventoryPushLogs(opts?: {
  page?: number;
  limit?: number;
  search?: string;
  username?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<{ rows: InventoryPushLog[]; total: number }> {
  const params = new URLSearchParams();
  if (opts?.page !== undefined) params.set("page", String(opts.page));
  if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts?.search) params.set("search", opts.search);
  if (opts?.username) params.set("username", opts.username);
  if (opts?.dateFrom) params.set("dateFrom", opts.dateFrom);
  if (opts?.dateTo) params.set("dateTo", opts.dateTo);
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/inventory/push-logs${qs ? `?${qs}` : ""}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch inventory push logs');
  return res.json();
}

export async function exportInventoryPushLogs(opts?: {
  search?: string;
  username?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<{ blob: Blob; filename: string }> {
  const params = new URLSearchParams();
  if (opts?.search)   params.set("search",   opts.search);
  if (opts?.username) params.set("username", opts.username);
  if (opts?.dateFrom) params.set("dateFrom", opts.dateFrom);
  if (opts?.dateTo)   params.set("dateTo",   opts.dateTo);
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/inventory/push-logs/export${qs ? `?${qs}` : ""}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Failed to export inventory push logs");
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] ?? `inventory-push-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  return { blob, filename };
}

export async function getInventoryPushLogUsernames(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/inventory/push-logs/usernames`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch log usernames');
  return res.json();
}

export interface PendingOrderEntry {
  order_id: number;
  status: string;
  status_id: number;
  quantity: number;
  customer: string;
  date: string;
}

export async function getPendingOrdersBySku(skus: string[]): Promise<Record<string, PendingOrderEntry[]>> {
  if (skus.length === 0) return {};
  const res = await fetch(
    `${API_BASE}/bigcommerce/orders/pending-by-sku?skus=${encodeURIComponent(skus.join(","))}`,
    { headers: getAuthHeaders() }
  );
  if (!res.ok) throw new Error('Failed to fetch pending orders by SKU');
  return res.json();
}

export async function getAllOrders(): Promise<Order[]> {
  const res = await fetch(`${API_BASE}/orders/all`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch all orders');
  return res.json();
}

export interface UserSummary {
  id: number;
  name: string;
  role: string;
  is_enabled: boolean;
  group_name: string | null;
}

export async function getUsersSummary(): Promise<UserSummary[]> {
  const res = await fetch(`${API_BASE}/users/summary`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch users summary');
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
  default_landing_page?: string;
  role_id?: number | null;
  attendance_home_latitude?: string | null;
  attendance_home_longitude?: string | null;
  attendance_home_set_at?: string | null;
  permissions: RbacPermission[];
}

export async function updateUserDetails(
  id: number,
  data: Partial<{ name: string; username: string; password: string; role: string; is_enabled: boolean; allow_bigcommerce_search: boolean; default_landing_page: string }>,
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

export async function resetAttendanceHomeLocation(userId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/users/${userId}/attendance-home-location/reset`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to reset home location');
  }
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
  const controller = new AbortController();
  // 60-second client-side timeout — prevents the spinner hanging forever if the
  // server stalls (e.g. SMTP connection blocked in the hosting environment).
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(`${API_BASE}/invoice/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to send email' }));
      throw new Error(err.error || 'Failed to send email');
    }
  } catch (e: any) {
    if (e.name === 'AbortError') throw new Error('Email request timed out. Check that your SMTP settings are reachable from the server.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
