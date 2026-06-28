import { db } from "../db";
import { type User, type InsertUser, type Product, type InsertProduct, type Order, type InsertOrder, type InsertPriceHistoryCache, type PriceHistoryCacheEntry, type InsertInventoryPushLog, type InventoryPushLog, type InsertProductLinkLog, type ProductLinkLog, type Role, type InsertRole, type Permission, type InsertPermission, type InsertRolePermission, type InsertUserPermission, type InsertShipstationExportHistory, type ShipstationExportHistory, type InsertPromoFreeSkuTracker, type PromoFreeSkuTracker, type CrmCustomer, type InsertCrmCustomer, type CrmOrder, type InsertCrmOrder, type CrmSalesRep, type InsertCrmSalesRep, type CrmNote, type InsertCrmNote, type InsertCrmAuditLog, users, products, orders, settings, priceHistoryCache, inventoryPushLogs, productLinkLogs, roles, permissions, rolePermissions, userPermissions, shipstationExportHistory, promoFreeSkuTracker, customersMirror, customerOrdersMirror, customerSalesRep, crmCustomerNotes, crmAuditLog } from "@shared/schema";
import { eq, desc, and, inArray, gt, asc, or, ilike, sql, isNotNull, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllAgents(): Promise<User[]>;
  getAllAdmins(): Promise<User[]>;
  getAllUsers(): Promise<User[]>;
  updateUserStatus(id: number, is_enabled: boolean): Promise<void>;
  updateUserPermission(id: number, allow_bigcommerce_search: boolean): Promise<void>;
  updateUserDetails(id: number, data: Partial<{ name: string; username: string; password: string; role: string; is_enabled: boolean; allow_bigcommerce_search: boolean; default_landing_page: string }>): Promise<User>;

  // Product operations
  getAllProducts(): Promise<Product[]>;
  getPinnedProducts(): Promise<Product[]>;
  getPromotionProducts(): Promise<Product[]>;
  getProductByBigCommerceId(bcId: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProductPin(id: number, is_pinned: boolean): Promise<void>;
  updateProductPromotion(id: number, is_promotion: boolean): Promise<void>;
  updateProduct(id: number, updates: Partial<InsertProduct>): Promise<void>;
  updateProductByBigCommerceId(bcId: number, updates: Partial<InsertProduct>): Promise<void>;

  // Order operations
  createOrder(order: InsertOrder): Promise<Order>;
  getOrder(id: number): Promise<Order | undefined>;
  getOrdersByUser(userId: number): Promise<Order[]>;
  getPendingSyncOrders(): Promise<Order[]>;
  getDraftOrders(): Promise<Order[]>;
  updateOrderStatus(id: number, status: string, bcOrderId?: number): Promise<void>;
  updateOrderSyncError(id: number, error: string): Promise<void>;
  updateOrderForSubmission(id: number, updates: { bigcommerce_customer_id: number; billing_address: any; status: string }): Promise<void>;
  deleteOrder(id: number): Promise<void>;
  getOrdersByBcCustomerId(bcCustomerId: number, statuses: string[]): Promise<Order[]>;
  getAllOrders(): Promise<Order[]>;

  // Setting operations
  getSetting(key: string): Promise<any>;
  setSetting(key: string, value: any): Promise<void>;

  // Price history cache operations
  getCachedPriceHistory(customerId: number, bcProductId: number): Promise<PriceHistoryCacheEntry[]>;
  savePriceHistoryCacheEntries(entries: InsertPriceHistoryCache[]): Promise<void>;
  getPriceHistoryForSync(afterMs: number | null, limit: number): Promise<PriceHistoryCacheEntry[]>;

  // Inventory push log operations
  createInventoryPushLog(entry: InsertInventoryPushLog): Promise<InventoryPushLog>;
  getInventoryPushLogs(limit?: number): Promise<InventoryPushLog[]>;

  // Product link log operations
  createProductLinkLog(entry: InsertProductLinkLog): Promise<ProductLinkLog>;
  getProductLinkLogs(limit?: number): Promise<ProductLinkLog[]>;

  // RBAC operations
  getAllRoles(): Promise<Role[]>;
  getRoleById(id: number): Promise<Role | undefined>;
  createRole(role: InsertRole): Promise<Role>;
  deleteRole(id: number): Promise<void>;
  getAllPermissions(): Promise<Permission[]>;
  createPermission(perm: InsertPermission): Promise<Permission>;
  deletePermission(id: number): Promise<void>;
  getPermissionsForRole(roleId: number): Promise<Permission[]>;
  addPermissionToRole(entry: InsertRolePermission): Promise<void>;
  removePermissionFromRole(roleId: number, permissionId: number): Promise<void>;
  getPermissionsForUser(userId: number): Promise<Permission[]>;
  addPermissionToUser(entry: InsertUserPermission): Promise<void>;
  removePermissionFromUser(userId: number, permissionId: number): Promise<void>;
  getUserPermissionStrings(userId: number): Promise<string[]>;
  setUserRole(userId: number, roleId: number | null): Promise<void>;
  updateRole(id: number, data: Partial<{ name: string; description: string | null }>): Promise<Role>;

  // ShipStation export history
  createShipstationExportHistory(entry: InsertShipstationExportHistory): Promise<ShipstationExportHistory>;
  getShipstationExportHistory(limit?: number): Promise<ShipstationExportHistory[]>;
  getShipstationExportHistoryById(id: number): Promise<ShipstationExportHistory | undefined>;

  // Promo SKU tracker
  getAllPromoSkus(): Promise<PromoFreeSkuTracker[]>;
  getPromoSkuById(id: number): Promise<PromoFreeSkuTracker | undefined>;
  getPromoSkuBySku(sku: string): Promise<PromoFreeSkuTracker | undefined>;
  createPromoSku(entry: InsertPromoFreeSkuTracker): Promise<PromoFreeSkuTracker>;
  updatePromoSku(id: number, data: Partial<InsertPromoFreeSkuTracker>): Promise<PromoFreeSkuTracker>;
  deletePromoSku(id: number): Promise<void>;

  // CRM operations
  getCrmCustomers(opts: { search?: string; group?: string; state?: string; health?: string; customerType?: string; addressType?: string; primaryRep?: number | "unassigned"; secondaryRep?: number | "unassigned"; sortBy?: string; sortDir?: string; limit?: number; offset?: number; assignedRep?: number | "unassigned"; visibilityScope?: string; visibilityUserId?: number }): Promise<{ customers: (CrmCustomer & { sales_rep_name?: string | null; primary_rep_name?: string | null; secondary_rep_name?: string | null; last_follow_up_date?: string | null; last_follow_up_by?: string | null })[]; total: number }>;
  getHealthThresholds(): Promise<{ healthy_days: number; watch_days: number; at_risk_days: number }>;
  setHealthThresholds(t: { healthy_days: number; watch_days: number; at_risk_days: number }): Promise<void>;
  getCrmCustomerById(id: number): Promise<(CrmCustomer & { sales_rep_name?: string | null; primary_rep_name?: string | null; secondary_rep_name?: string | null }) | undefined>;
  getCrmCustomerByBcId(bcId: number): Promise<CrmCustomer | undefined>;
  upsertCrmCustomer(data: InsertCrmCustomer): Promise<CrmCustomer>;
  getCrmCustomerCount(): Promise<number>;
  getAllCrmCustomersForExport(opts: { search?: string; group?: string; state?: string; health?: string; customerType?: string; addressType?: string; primaryRep?: number | "unassigned"; secondaryRep?: number | "unassigned"; sortBy?: string; sortDir?: string; assignedRep?: number | "unassigned"; visibilityScope?: string; visibilityUserId?: number }): Promise<(CrmCustomer & { sales_rep_name?: string | null; primary_rep_name?: string | null; secondary_rep_name?: string | null; last_follow_up_date?: string | null; last_follow_up_by?: string | null })[]>;
  updateCrmCustomerMasterFields(id: number, data: { primary_rep_id?: number | null; secondary_rep_id?: number | null; customer_type?: string }): Promise<void>;
  getCrmFilterOptions(): Promise<{ groups: string[]; states: string[]; reps: { id: number; name: string }[] }>;
  getCrmOrdersByBcCustomerId(bcCustomerId: number, limit?: number): Promise<CrmOrder[]>;
  upsertCrmOrder(data: InsertCrmOrder): Promise<CrmOrder>;
  getCrmOrderCount(): Promise<number>;
  updateCrmCustomerStats(bcCustomerId: number, stats: { lifetime_orders: number; lifetime_revenue: string; last_order_date: Date | null }): Promise<void>;
  recalculateCrmCustomerStats(): Promise<{ updated: number; customers_in_orders: number; duration_ms: number }>;
  getCrmSalesRep(customerId: number): Promise<CrmSalesRep | undefined>;
  setCrmSalesRep(data: InsertCrmSalesRep): Promise<CrmSalesRep>;
  removeCrmSalesRep(customerId: number): Promise<void>;
  // CRM Notes
  createCrmNote(data: InsertCrmNote): Promise<CrmNote>;
  getCrmNotes(customerId: number): Promise<(CrmNote & { created_by_name?: string | null })[]>;
  getCrmNoteById(id: number): Promise<CrmNote | undefined>;
  updateCrmNote(id: number, data: { note?: string; note_type?: string; order_id?: number | null }): Promise<CrmNote>;
  deleteCrmNote(id: number): Promise<void>;
  getAllCrmNotes(opts: { search?: string; type?: string; createdBy?: number; customerId?: number; orderId?: number; customerGroup?: string; state?: string; dateFrom?: string; dateTo?: string; limit?: number; offset?: number }): Promise<{ notes: any[]; total: number }>;
  getCrmNotesKpis(opts?: { search?: string; createdBy?: number; customerGroup?: string; state?: string; dateFrom?: string; dateTo?: string }): Promise<{ notesToday: number; followUps: number; salesCalls: number; issues: number; internalNotes: number }>;
  // CRM Timeline
  getCrmTimeline(customerId: number): Promise<any[]>;
  // CRM Reactivation
  getReactivationCustomers(opts: { search?: string; group?: string; state?: string; health?: string; rep?: number; sortBy?: string; sortDir?: string; limit?: number; offset?: number; visibilityScope?: string; visibilityUserId?: number }): Promise<{ customers: (CrmCustomer & { sales_rep_name?: string | null })[]; total: number }>;
  // CRM Metrics
  getCrmMetrics(opts: { search?: string; group?: string; state?: string; primaryRep?: number | "unassigned"; secondaryRep?: number | "unassigned"; customerType?: string; addressType?: string; assignedRep?: number | "unassigned"; visibilityScope?: string; visibilityUserId?: number }): Promise<{ total: number; healthy: number; watch: number; at_risk: number; lost: number; needs_follow_up: number }>;
  // CRM Users list
  getCrmUsers(): Promise<{ id: number; name: string }[]>;
  // CRM Order Notes (mirror update)
  updateCrmOrderNotes(bcOrderId: number, data: { staff_notes?: string; customer_order_notes?: string }): Promise<void>;
  // CRM Audit Log
  createCrmAuditLog(data: InsertCrmAuditLog): Promise<void>;
  // CRM Table resets
  truncateCrmCustomers(): Promise<void>;
  truncateCrmOrders(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username));
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(users).values([user]).returning();
    return result[0];
  }

  async getAllAgents(): Promise<User[]> {
    return db.select().from(users).where(eq(users.role, 'agent'));
  }

  async getAllAdmins(): Promise<User[]> {
    return db.select().from(users).where(eq(users.role, 'admin'));
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async updateUserStatus(id: number, is_enabled: boolean): Promise<void> {
    await db.update(users).set({ is_enabled }).where(eq(users.id, id));
  }

  async updateUserPermission(id: number, allow_bigcommerce_search: boolean): Promise<void> {
    await db.update(users).set({ allow_bigcommerce_search }).where(eq(users.id, id));
  }

  async updateUserDetails(id: number, data: Partial<{ name: string; username: string; password: string; role: string; is_enabled: boolean; allow_bigcommerce_search: boolean; default_landing_page: string }>): Promise<User> {
    const result = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return result[0];
  }

  // Product operations
  async getAllProducts(): Promise<Product[]> {
    return db.select().from(products).orderBy(desc(products.is_pinned));
  }

  async getPinnedProducts(): Promise<Product[]> {
    return db.select().from(products).where(eq(products.is_pinned, true));
  }

  async getPromotionProducts(): Promise<Product[]> {
    return db.select().from(products).where(eq(products.is_promotion, true));
  }

  async getProductByBigCommerceId(bcId: number): Promise<Product | undefined> {
    const result = await db.select().from(products).where(eq(products.bigcommerce_id, bcId));
    return result[0];
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const result = await db.insert(products).values([product]).returning();
    return result[0];
  }

  async updateProductPin(id: number, is_pinned: boolean): Promise<void> {
    await db.update(products).set({ is_pinned }).where(eq(products.id, id));
  }

  async updateProductPromotion(id: number, is_promotion: boolean): Promise<void> {
    await db.update(products).set({ is_promotion }).where(eq(products.id, id));
  }

  async updateProduct(id: number, updates: Partial<InsertProduct>): Promise<void> {
    await db.update(products).set(updates).where(eq(products.id, id));
  }

  async updateProductByBigCommerceId(bcId: number, updates: Partial<InsertProduct>): Promise<void> {
    await db.update(products).set(updates).where(eq(products.bigcommerce_id, bcId));
  }

  // Order operations
  async createOrder(order: InsertOrder): Promise<Order> {
    const result = await db.insert(orders).values([order]).returning();
    return result[0];
  }

  async getOrder(id: number): Promise<Order | undefined> {
    const result = await db.select().from(orders).where(eq(orders.id, id));
    return result[0];
  }

  async getOrdersByUser(userId: number): Promise<Order[]> {
    return db.select().from(orders).where(eq(orders.created_by_user_id, userId)).orderBy(desc(orders.date));
  }

  async getPendingSyncOrders(): Promise<Order[]> {
    return db.select().from(orders).where(eq(orders.status, 'pending_sync'));
  }

  async getDraftOrders(): Promise<Order[]> {
    return db.select().from(orders).where(eq(orders.status, 'draft')).orderBy(desc(orders.date));
  }

  async updateOrderStatus(id: number, status: string, bcOrderId?: number): Promise<void> {
    await db.update(orders).set({ 
      status, 
      ...(bcOrderId && { bigcommerce_order_id: bcOrderId }) 
    }).where(eq(orders.id, id));
  }

  async updateOrderSyncError(id: number, error: string): Promise<void> {
    await db.update(orders).set({ 
      status: 'failed',
      sync_error: error 
    }).where(eq(orders.id, id));
  }

  async updateOrderForSubmission(id: number, updates: { bigcommerce_customer_id: number; billing_address: any; status: string }): Promise<void> {
    await db.update(orders).set({
      bigcommerce_customer_id: updates.bigcommerce_customer_id,
      billing_address: updates.billing_address,
      status: updates.status
    }).where(eq(orders.id, id));
  }

  async deleteOrder(id: number): Promise<void> {
    await db.delete(orders).where(eq(orders.id, id));
  }

  async getAllOrders(): Promise<Order[]> {
    return db.select().from(orders).orderBy(desc(orders.date));
  }

  async getOrdersByBcCustomerId(bcCustomerId: number, statuses: string[]): Promise<Order[]> {
    return db.select().from(orders)
      .where(and(eq(orders.bigcommerce_customer_id, bcCustomerId), inArray(orders.status, statuses)))
      .orderBy(desc(orders.date));
  }

  // Setting operations
  async getSetting(key: string): Promise<any> {
    const result = await db.select().from(settings).where(eq(settings.key, key));
    return result[0];
  }

  async setSetting(key: string, value: any): Promise<void> {
    const existing = await this.getSetting(key);
    if (existing) {
      await db.update(settings).set({ value }).where(eq(settings.key, key));
    } else {
      await db.insert(settings).values({ key, value });
    }
  }

  async getCachedPriceHistory(customerId: number, bcProductId: number): Promise<PriceHistoryCacheEntry[]> {
    return db.select().from(priceHistoryCache)
      .where(and(
        eq(priceHistoryCache.customer_id, customerId),
        eq(priceHistoryCache.product_id, bcProductId)
      ))
      .orderBy(desc(priceHistoryCache.created_at))
      .limit(20);
  }

  async savePriceHistoryCacheEntries(entries: InsertPriceHistoryCache[]): Promise<void> {
    for (const entry of entries) {
      const exists = await db.select({ id: priceHistoryCache.id })
        .from(priceHistoryCache)
        .where(and(
          eq(priceHistoryCache.customer_id, entry.customer_id),
          eq(priceHistoryCache.product_id, entry.product_id),
          eq(priceHistoryCache.order_id, entry.order_id)
        ))
        .limit(1);
      if (exists.length === 0) {
        await db.insert(priceHistoryCache).values(entry);
      }
    }
  }

  async getPriceHistoryForSync(afterMs: number | null, limit: number): Promise<PriceHistoryCacheEntry[]> {
    if (afterMs) {
      const afterDate = new Date(afterMs);
      return db.select().from(priceHistoryCache)
        .where(gt(priceHistoryCache.created_at, afterDate))
        .orderBy(asc(priceHistoryCache.created_at))
        .limit(limit);
    }
    return db.select().from(priceHistoryCache)
      .orderBy(asc(priceHistoryCache.created_at))
      .limit(limit);
  }

  async createInventoryPushLog(entry: InsertInventoryPushLog): Promise<InventoryPushLog> {
    const result = await db.insert(inventoryPushLogs).values(entry).returning();
    return result[0];
  }

  async getInventoryPushLogs(limit = 100): Promise<InventoryPushLog[]> {
    return db.select().from(inventoryPushLogs)
      .orderBy(desc(inventoryPushLogs.created_at))
      .limit(limit);
  }

  async createProductLinkLog(entry: InsertProductLinkLog): Promise<ProductLinkLog> {
    const result = await db.insert(productLinkLogs).values(entry).returning();
    return result[0];
  }

  async getProductLinkLogs(limit = 200): Promise<ProductLinkLog[]> {
    return db.select().from(productLinkLogs)
      .orderBy(desc(productLinkLogs.created_at))
      .limit(limit);
  }

  // ── RBAC ──────────────────────────────────────────────────────────────────

  async getAllRoles(): Promise<Role[]> {
    return db.select().from(roles).orderBy(asc(roles.name));
  }

  async getRoleById(id: number): Promise<Role | undefined> {
    const result = await db.select().from(roles).where(eq(roles.id, id));
    return result[0];
  }

  async createRole(role: InsertRole): Promise<Role> {
    const result = await db.insert(roles).values(role).returning();
    return result[0];
  }

  async deleteRole(id: number): Promise<void> {
    await db.delete(roles).where(eq(roles.id, id));
  }

  async getAllPermissions(): Promise<Permission[]> {
    return db.select().from(permissions).orderBy(asc(permissions.module), asc(permissions.action));
  }

  async createPermission(perm: InsertPermission): Promise<Permission> {
    const result = await db.insert(permissions).values(perm).returning();
    return result[0];
  }

  async deletePermission(id: number): Promise<void> {
    await db.delete(permissions).where(eq(permissions.id, id));
  }

  async getPermissionsForRole(roleId: number): Promise<Permission[]> {
    const rps = await db.select({ permission_id: rolePermissions.permission_id })
      .from(rolePermissions)
      .where(eq(rolePermissions.role_id, roleId));
    if (rps.length === 0) return [];
    const ids = rps.map((r) => r.permission_id);
    return db.select().from(permissions).where(inArray(permissions.id, ids));
  }

  async addPermissionToRole(entry: InsertRolePermission): Promise<void> {
    await db.insert(rolePermissions).values(entry).onConflictDoNothing();
  }

  async removePermissionFromRole(roleId: number, permissionId: number): Promise<void> {
    await db.delete(rolePermissions)
      .where(and(eq(rolePermissions.role_id, roleId), eq(rolePermissions.permission_id, permissionId)));
  }

  async getPermissionsForUser(userId: number): Promise<Permission[]> {
    const ups = await db.select({ permission_id: userPermissions.permission_id })
      .from(userPermissions)
      .where(eq(userPermissions.user_id, userId));
    if (ups.length === 0) return [];
    const ids = ups.map((u) => u.permission_id);
    return db.select().from(permissions).where(inArray(permissions.id, ids));
  }

  async addPermissionToUser(entry: InsertUserPermission): Promise<void> {
    await db.insert(userPermissions).values(entry).onConflictDoNothing();
  }

  async removePermissionFromUser(userId: number, permissionId: number): Promise<void> {
    await db.delete(userPermissions)
      .where(and(eq(userPermissions.user_id, userId), eq(userPermissions.permission_id, permissionId)));
  }

  async getUserPermissionStrings(userId: number): Promise<string[]> {
    const user = await this.getUser(userId);
    if (!user) return [];
    const directPerms = await this.getPermissionsForUser(userId);
    let rolePerms: Permission[] = [];
    if (user.role_id) {
      rolePerms = await this.getPermissionsForRole(user.role_id);
    }
    const all = [...directPerms, ...rolePerms];
    return [...new Set(all.map((p) => `${p.module}:${p.action}`))];
  }

  async setUserRole(userId: number, roleId: number | null): Promise<void> {
    await db.update(users).set({ role_id: roleId }).where(eq(users.id, userId));
  }

  async updateRole(id: number, data: Partial<{ name: string; description: string | null }>): Promise<Role> {
    const result = await db.update(roles).set(data).where(eq(roles.id, id)).returning();
    return result[0];
  }

  // ShipStation export history
  async createShipstationExportHistory(entry: InsertShipstationExportHistory): Promise<ShipstationExportHistory> {
    const result = await db.insert(shipstationExportHistory).values([entry]).returning();
    return result[0];
  }

  async getShipstationExportHistory(limit = 100): Promise<ShipstationExportHistory[]> {
    return db.select().from(shipstationExportHistory).orderBy(desc(shipstationExportHistory.created_at)).limit(limit);
  }

  async getShipstationExportHistoryById(id: number): Promise<ShipstationExportHistory | undefined> {
    const result = await db.select().from(shipstationExportHistory).where(eq(shipstationExportHistory.id, id));
    return result[0];
  }

  // Promo SKU tracker
  async getAllPromoSkus(): Promise<PromoFreeSkuTracker[]> {
    return db.select().from(promoFreeSkuTracker).where(eq(promoFreeSkuTracker.is_active, true)).orderBy(asc(promoFreeSkuTracker.product_name));
  }

  async getPromoSkuById(id: number): Promise<PromoFreeSkuTracker | undefined> {
    const result = await db.select().from(promoFreeSkuTracker).where(eq(promoFreeSkuTracker.id, id));
    return result[0];
  }

  async getPromoSkuBySku(sku: string): Promise<PromoFreeSkuTracker | undefined> {
    const result = await db.select().from(promoFreeSkuTracker).where(eq(promoFreeSkuTracker.sku, sku));
    return result[0];
  }

  async createPromoSku(entry: InsertPromoFreeSkuTracker): Promise<PromoFreeSkuTracker> {
    const result = await db.insert(promoFreeSkuTracker).values([entry]).returning();
    return result[0];
  }

  async updatePromoSku(id: number, data: Partial<InsertPromoFreeSkuTracker>): Promise<PromoFreeSkuTracker> {
    const result = await db.update(promoFreeSkuTracker).set({ ...data, updated_at: new Date() }).where(eq(promoFreeSkuTracker.id, id)).returning();
    return result[0];
  }

  async deletePromoSku(id: number): Promise<void> {
    await db.delete(promoFreeSkuTracker).where(eq(promoFreeSkuTracker.id, id));
  }

  // ─── CRM operations ──────────────────────────────────────────────────────────

  private buildCrmWhereClause(
    search?: string,
    group?: string,
    state?: string,
    health?: string,
    customerType?: string,
    addressType?: string,
    primaryRep?: number | "unassigned",
    secondaryRep?: number | "unassigned",
  ) {
    const conditions: any[] = [];
    if (search?.trim()) {
      const s = `%${search.trim()}%`;
      conditions.push(or(
        ilike(customersMirror.company, s),
        ilike(customersMirror.first_name, s),
        ilike(customersMirror.last_name, s),
        ilike(customersMirror.email, s),
        ilike(customersMirror.phone, s),
        sql`coalesce(${customersMirror.shipping_address}->>'city', ${customersMirror.billing_address}->>'city') ILIKE ${s}`,
      ));
    }
    if (group) conditions.push(eq(customersMirror.customer_group_name, group));
    if (state) {
      if (state === "Unknown") {
        conditions.push(sql`(coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') IS NULL OR coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') = '')`);
      } else {
        conditions.push(sql`coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') = ${state}`);
      }
    }
    if (health) conditions.push(eq(customersMirror.account_health, health));
    if (customerType) conditions.push(eq(customersMirror.customer_type, customerType));
    if (addressType) conditions.push(eq(customersMirror.address_type, addressType));
    if (primaryRep === "unassigned") {
      conditions.push(isNull(customersMirror.primary_rep_id));
    } else if (primaryRep !== undefined) {
      conditions.push(eq(customersMirror.primary_rep_id, Number(primaryRep)));
    }
    if (secondaryRep === "unassigned") {
      conditions.push(isNull(customersMirror.secondary_rep_id));
    } else if (secondaryRep !== undefined) {
      conditions.push(eq(customersMirror.secondary_rep_id, Number(secondaryRep)));
    }
    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];
    return and(...conditions);
  }

  async getHealthThresholds(): Promise<{ healthy_days: number; watch_days: number; at_risk_days: number }> {
    const defaults = { healthy_days: 30, watch_days: 60, at_risk_days: 90 };
    const row = await this.getSetting("crm_health_thresholds");
    if (!row?.value) return defaults;
    try { return { ...defaults, ...row.value }; } catch { return defaults; }
  }

  async setHealthThresholds(t: { healthy_days: number; watch_days: number; at_risk_days: number }): Promise<void> {
    await this.setSetting("crm_health_thresholds", t);
  }

  private buildCrmOrderBy(sortBy?: string, sortDir?: string) {
    const dir = sortDir === "asc" ? asc : desc;
    switch (sortBy) {
      case "company":
        return sortDir === "asc"
          ? sql`${customersMirror.company} ASC NULLS LAST`
          : sql`${customersMirror.company} DESC NULLS LAST`;
      case "first_name": return dir(customersMirror.first_name);
      case "state":
        return sortDir === "asc"
          ? sql`coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') ASC NULLS LAST`
          : sql`coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') DESC NULLS LAST`;
      case "customer_group_name":
        return sortDir === "asc"
          ? sql`${customersMirror.customer_group_name} ASC NULLS LAST`
          : sql`${customersMirror.customer_group_name} DESC NULLS LAST`;
      case "lifetime_revenue": return dir(customersMirror.lifetime_revenue);
      case "lifetime_orders": return dir(customersMirror.lifetime_orders);
      case "days_since_order":
        return sortDir === "asc"
          ? sql`${customersMirror.last_order_date} DESC NULLS LAST`
          : sql`${customersMirror.last_order_date} ASC NULLS LAST`;
      case "customer_type":
        return sortDir === "asc"
          ? sql`${customersMirror.customer_type} ASC NULLS LAST`
          : sql`${customersMirror.customer_type} DESC NULLS LAST`;
      case "address_type":
        return sortDir === "asc"
          ? sql`${customersMirror.address_type} ASC NULLS LAST`
          : sql`${customersMirror.address_type} DESC NULLS LAST`;
      case "primary_rep_name":
        return sortDir === "asc"
          ? sql`primary_rep_user.name ASC NULLS LAST`
          : sql`primary_rep_user.name DESC NULLS LAST`;
      case "secondary_rep_name":
        return sortDir === "asc"
          ? sql`secondary_rep_user.name ASC NULLS LAST`
          : sql`secondary_rep_user.name DESC NULLS LAST`;
      case "city":
        return sortDir === "asc"
          ? sql`coalesce(${customersMirror.shipping_address}->>'city', ${customersMirror.billing_address}->>'city') ASC NULLS LAST`
          : sql`coalesce(${customersMirror.shipping_address}->>'city', ${customersMirror.billing_address}->>'city') DESC NULLS LAST`;
      case "last_follow_up":
        return sortDir === "asc"
          ? sql`(SELECT n.created_at FROM crm_customer_notes n WHERE n.customer_id = customers_mirror.id AND n.note_type = 'Follow Up' ORDER BY n.created_at DESC LIMIT 1) ASC NULLS LAST`
          : sql`(SELECT n.created_at FROM crm_customer_notes n WHERE n.customer_id = customers_mirror.id AND n.note_type = 'Follow Up' ORDER BY n.created_at DESC LIMIT 1) DESC NULLS LAST`;
      default:
        return sortDir === "asc"
          ? sql`${customersMirror.last_order_date} ASC NULLS LAST`
          : sql`${customersMirror.last_order_date} DESC NULLS LAST`;
    }
  }

  private buildCrmRepConditions(assignedRep?: number | "unassigned", visibilityScope?: string, visibilityUserId?: number): any[] {
    const conds: any[] = [];
    if (visibilityScope && visibilityUserId) {
      if (visibilityScope === "ASSIGNED_ONLY") {
        conds.push(eq(customerSalesRep.assigned_user_id, visibilityUserId));
      } else if (visibilityScope === "ASSIGNED_AND_UNASSIGNED") {
        conds.push(or(
          eq(customerSalesRep.assigned_user_id, visibilityUserId),
          isNull(customerSalesRep.id),
        ));
      }
    }
    if (assignedRep === "unassigned") {
      conds.push(isNull(customerSalesRep.id));
    } else if (assignedRep !== undefined) {
      conds.push(eq(customerSalesRep.assigned_user_id, Number(assignedRep)));
    }
    return conds;
  }

  async getCrmCustomers(opts: { search?: string; group?: string; state?: string; health?: string; customerType?: string; addressType?: string; primaryRep?: number | "unassigned"; secondaryRep?: number | "unassigned"; sortBy?: string; sortDir?: string; limit?: number; offset?: number; assignedRep?: number | "unassigned"; visibilityScope?: string; visibilityUserId?: number }): Promise<{ customers: (CrmCustomer & { sales_rep_name?: string | null; primary_rep_name?: string | null; secondary_rep_name?: string | null })[]; total: number }> {
    const { search, group, state, health, customerType, addressType, primaryRep, secondaryRep,
            sortBy = "last_order_date", sortDir = "desc", limit = 50, offset = 0,
            assignedRep, visibilityScope, visibilityUserId } = opts;
    const primaryRepUser = alias(users, "primary_rep_user");
    const secondaryRepUser = alias(users, "secondary_rep_user");
    const baseWhere = this.buildCrmWhereClause(search, group, state, health, customerType, addressType, primaryRep, secondaryRep);
    const repConds = this.buildCrmRepConditions(assignedRep, visibilityScope, visibilityUserId);
    const needsRepJoin = repConds.length > 0;
    const allConds = [...(baseWhere ? [baseWhere] : []), ...repConds];
    const where = allConds.length === 0 ? undefined : allConds.length === 1 ? allConds[0] : and(...allConds);
    const orderExpr = this.buildCrmOrderBy(sortBy, sortDir);
    const countRows = needsRepJoin
      ? await db.select({ count: sql<number>`count(*)::int` }).from(customersMirror).leftJoin(customerSalesRep, eq(customerSalesRep.customer_id, customersMirror.id)).where(where)
      : await db.select({ count: sql<number>`count(*)::int` }).from(customersMirror).where(where);
    const total = countRows[0]?.count ?? 0;
    const rows = await db.select({
      c: customersMirror,
      rep_name: users.name,
      primary_rep_name: primaryRepUser.name,
      secondary_rep_name: secondaryRepUser.name,
      last_follow_up_date: sql<string | null>`(SELECT n.created_at FROM crm_customer_notes n WHERE n.customer_id = customers_mirror.id AND n.note_type = 'Follow Up' ORDER BY n.created_at DESC LIMIT 1)`,
      last_follow_up_by: sql<string | null>`(SELECT u.name FROM crm_customer_notes n LEFT JOIN users u ON u.id = n.created_by WHERE n.customer_id = customers_mirror.id AND n.note_type = 'Follow Up' ORDER BY n.created_at DESC LIMIT 1)`,
    })
      .from(customersMirror)
      .leftJoin(customerSalesRep, eq(customerSalesRep.customer_id, customersMirror.id))
      .leftJoin(users, eq(users.id, customerSalesRep.assigned_user_id))
      .leftJoin(primaryRepUser, eq(primaryRepUser.id, customersMirror.primary_rep_id))
      .leftJoin(secondaryRepUser, eq(secondaryRepUser.id, customersMirror.secondary_rep_id))
      .where(where)
      .orderBy(orderExpr as any)
      .limit(limit)
      .offset(offset);
    return {
      customers: rows.map(r => ({
        ...r.c,
        sales_rep_name: r.rep_name ?? null,
        primary_rep_name: r.primary_rep_name ?? null,
        secondary_rep_name: r.secondary_rep_name ?? null,
        last_follow_up_date: r.last_follow_up_date ?? null,
        last_follow_up_by: r.last_follow_up_by ?? null,
      })),
      total,
    };
  }

  async getCrmCustomerById(id: number): Promise<(CrmCustomer & { sales_rep_name?: string | null; primary_rep_name?: string | null; secondary_rep_name?: string | null }) | undefined> {
    const primaryRepUser = alias(users, "primary_rep_user");
    const secondaryRepUser = alias(users, "secondary_rep_user");
    const rows = await db.select({
      c: customersMirror,
      rep_name: users.name,
      primary_rep_name: primaryRepUser.name,
      secondary_rep_name: secondaryRepUser.name,
    })
      .from(customersMirror)
      .leftJoin(customerSalesRep, eq(customerSalesRep.customer_id, customersMirror.id))
      .leftJoin(users, eq(users.id, customerSalesRep.assigned_user_id))
      .leftJoin(primaryRepUser, eq(primaryRepUser.id, customersMirror.primary_rep_id))
      .leftJoin(secondaryRepUser, eq(secondaryRepUser.id, customersMirror.secondary_rep_id))
      .where(eq(customersMirror.id, id));
    if (!rows[0]) return undefined;
    return {
      ...rows[0].c,
      sales_rep_name: rows[0].rep_name ?? null,
      primary_rep_name: rows[0].primary_rep_name ?? null,
      secondary_rep_name: rows[0].secondary_rep_name ?? null,
    };
  }

  async getCrmCustomerByBcId(bcId: number): Promise<CrmCustomer | undefined> {
    const result = await db.select().from(customersMirror).where(eq(customersMirror.bigcommerce_customer_id, bcId));
    return result[0];
  }

  async upsertCrmCustomer(data: InsertCrmCustomer): Promise<CrmCustomer> {
    const result = await db.insert(customersMirror).values(data)
      .onConflictDoUpdate({
        target: customersMirror.bigcommerce_customer_id,
        set: {
          company: data.company,
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email,
          phone: data.phone,
          customer_group_id: data.customer_group_id,
          customer_group_name: data.customer_group_name,
          billing_address: data.billing_address,
          shipping_address: data.shipping_address,
          created_date: data.created_date,
          is_active: data.is_active,
          store_credit_balance: data.store_credit_balance,
          address_type: data.address_type,
          updated_at: new Date(),
        },
      }).returning();
    return result[0];
  }

  async getCrmCustomerCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(customersMirror);
    return result[0]?.count ?? 0;
  }

  async getAllCrmCustomersForExport(opts: { search?: string; group?: string; state?: string; health?: string; customerType?: string; addressType?: string; primaryRep?: number | "unassigned"; secondaryRep?: number | "unassigned"; sortBy?: string; sortDir?: string; assignedRep?: number | "unassigned"; visibilityScope?: string; visibilityUserId?: number }): Promise<(CrmCustomer & { sales_rep_name?: string | null; primary_rep_name?: string | null; secondary_rep_name?: string | null })[]> {
    const { search, group, state, health, customerType, addressType, primaryRep, secondaryRep,
            sortBy = "last_order_date", sortDir = "desc",
            assignedRep, visibilityScope, visibilityUserId } = opts;
    const primaryRepUser = alias(users, "primary_rep_user");
    const secondaryRepUser = alias(users, "secondary_rep_user");
    const baseWhere = this.buildCrmWhereClause(search, group, state, health, customerType, addressType, primaryRep, secondaryRep);
    const repConds = this.buildCrmRepConditions(assignedRep, visibilityScope, visibilityUserId);
    const allConds = [...(baseWhere ? [baseWhere] : []), ...repConds];
    const where = allConds.length === 0 ? undefined : allConds.length === 1 ? allConds[0] : and(...allConds);
    const orderExpr = this.buildCrmOrderBy(sortBy, sortDir);
    const rows = await db.select({
      c: customersMirror,
      rep_name: users.name,
      primary_rep_name: primaryRepUser.name,
      secondary_rep_name: secondaryRepUser.name,
      last_follow_up_date: sql<string | null>`(SELECT n.created_at FROM crm_customer_notes n WHERE n.customer_id = customers_mirror.id AND n.note_type = 'Follow Up' ORDER BY n.created_at DESC LIMIT 1)`,
      last_follow_up_by: sql<string | null>`(SELECT u.name FROM crm_customer_notes n LEFT JOIN users u ON u.id = n.created_by WHERE n.customer_id = customers_mirror.id AND n.note_type = 'Follow Up' ORDER BY n.created_at DESC LIMIT 1)`,
    })
      .from(customersMirror)
      .leftJoin(customerSalesRep, eq(customerSalesRep.customer_id, customersMirror.id))
      .leftJoin(users, eq(users.id, customerSalesRep.assigned_user_id))
      .leftJoin(primaryRepUser, eq(primaryRepUser.id, customersMirror.primary_rep_id))
      .leftJoin(secondaryRepUser, eq(secondaryRepUser.id, customersMirror.secondary_rep_id))
      .where(where)
      .orderBy(orderExpr as any);
    return rows.map(r => ({
      ...r.c,
      sales_rep_name: r.rep_name ?? null,
      primary_rep_name: r.primary_rep_name ?? null,
      secondary_rep_name: r.secondary_rep_name ?? null,
      last_follow_up_date: r.last_follow_up_date ?? null,
      last_follow_up_by: r.last_follow_up_by ?? null,
    }));
  }

  async updateCrmCustomerMasterFields(id: number, data: {
    primary_rep_id?: number | null;
    secondary_rep_id?: number | null;
    customer_type?: string;
  }): Promise<void> {
    const updates: Record<string, any> = { updated_at: new Date() };
    if ('primary_rep_id' in data) updates.primary_rep_id = data.primary_rep_id ?? null;
    if ('secondary_rep_id' in data) updates.secondary_rep_id = data.secondary_rep_id ?? null;
    if (data.customer_type !== undefined) updates.customer_type = data.customer_type;
    await db.update(customersMirror).set(updates).where(eq(customersMirror.id, id));
  }

  async getCrmFilterOptions(): Promise<{ groups: string[]; states: string[]; reps: { id: number; name: string }[] }> {
    const [groupRows, stateRows, repRows] = await Promise.all([
      db.selectDistinct({ name: customersMirror.customer_group_name })
        .from(customersMirror)
        .where(isNotNull(customersMirror.customer_group_name))
        .orderBy(asc(customersMirror.customer_group_name)),
      db.selectDistinct({
        state: sql<string>`coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state')`,
      })
        .from(customersMirror)
        .where(sql`coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') IS NOT NULL AND coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') != ''`)
        .orderBy(sql`1`),
      db.selectDistinct({ id: users.id, name: users.name })
        .from(customerSalesRep)
        .innerJoin(users, eq(users.id, customerSalesRep.assigned_user_id))
        .orderBy(asc(users.name)),
    ]);
    return {
      groups: (groupRows.map(r => r.name).filter(Boolean) as string[]),
      states: (stateRows.map(r => r.state).filter(Boolean) as string[]).sort(),
      reps: repRows.map(r => ({ id: r.id!, name: r.name! })),
    };
  }

  async getCrmOrdersByBcCustomerId(bcCustomerId: number, limit = 10000): Promise<CrmOrder[]> {
    return db.select().from(customerOrdersMirror)
      .where(eq(customerOrdersMirror.bigcommerce_customer_id, bcCustomerId))
      .orderBy(sql`${customerOrdersMirror.order_date} DESC NULLS LAST`)
      .limit(limit);
  }

  async upsertCrmOrder(data: InsertCrmOrder): Promise<CrmOrder> {
    const result = await db.insert(customerOrdersMirror).values(data)
      .onConflictDoUpdate({
        target: customerOrdersMirror.bigcommerce_order_id,
        set: {
          bigcommerce_customer_id: data.bigcommerce_customer_id,
          order_number: data.order_number,
          order_date: data.order_date,
          order_total: data.order_total,
          status: data.status,
          payment_status: data.payment_status,
          customer_name: data.customer_name,
          customer_email: data.customer_email,
          staff_notes: data.staff_notes,
          customer_order_notes: data.customer_order_notes,
          updated_at: new Date(),
        },
      }).returning();
    return result[0];
  }

  async getCrmOrderCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(customerOrdersMirror);
    return result[0]?.count ?? 0;
  }

  async updateCrmCustomerStats(bcCustomerId: number, stats: { lifetime_orders: number; lifetime_revenue: string; last_order_date: Date | null }): Promise<void> {
    await db.update(customersMirror).set({
      lifetime_orders: stats.lifetime_orders,
      lifetime_revenue: stats.lifetime_revenue,
      last_order_date: stats.last_order_date,
      updated_at: new Date(),
    }).where(eq(customersMirror.bigcommerce_customer_id, bcCustomerId));
  }

  async getCrmSalesRep(customerId: number): Promise<CrmSalesRep | undefined> {
    const result = await db.select().from(customerSalesRep).where(eq(customerSalesRep.customer_id, customerId));
    return result[0];
  }

  async setCrmSalesRep(data: InsertCrmSalesRep): Promise<CrmSalesRep> {
    await db.delete(customerSalesRep).where(eq(customerSalesRep.customer_id, data.customer_id));
    const result = await db.insert(customerSalesRep).values(data).returning();
    return result[0];
  }

  async removeCrmSalesRep(customerId: number): Promise<void> {
    await db.delete(customerSalesRep).where(eq(customerSalesRep.customer_id, customerId));
  }

  async recalculateCrmCustomerStats(): Promise<{ updated: number; customers_in_orders: number; duration_ms: number }> {
    const start = Date.now();

    const countRes = await db
      .select({ n: sql<number>`count(distinct ${customerOrdersMirror.bigcommerce_customer_id})::int` })
      .from(customerOrdersMirror);
    const customers_in_orders = countRes[0]?.n ?? 0;

    // Load configured thresholds
    const thresholds = await this.getHealthThresholds();
    const healthyDays = thresholds.healthy_days;
    const watchDays   = thresholds.watch_days;
    const atRiskDays  = thresholds.at_risk_days;

    // Update customers that have orders — compute stats + account_health in single pass
    const result = await db.execute(sql`
      UPDATE customers_mirror cm
      SET
        lifetime_orders  = agg.order_count,
        lifetime_revenue = agg.total_revenue,
        last_order_date  = agg.last_order,
        account_health   = CASE
          WHEN agg.last_order IS NULL THEN 'Lost'
          WHEN (EXTRACT(EPOCH FROM (NOW() - agg.last_order)) / 86400)::int <= ${healthyDays} THEN 'Healthy'
          WHEN (EXTRACT(EPOCH FROM (NOW() - agg.last_order)) / 86400)::int <= ${watchDays} THEN 'Watch'
          WHEN (EXTRACT(EPOCH FROM (NOW() - agg.last_order)) / 86400)::int <= ${atRiskDays} THEN 'At Risk'
          ELSE 'Lost'
        END,
        updated_at       = NOW()
      FROM (
        SELECT
          bigcommerce_customer_id,
          COUNT(*)::int                 AS order_count,
          COALESCE(SUM(order_total), 0) AS total_revenue,
          MAX(order_date)               AS last_order
        FROM customer_orders_mirror
        GROUP BY bigcommerce_customer_id
      ) agg
      WHERE cm.bigcommerce_customer_id = agg.bigcommerce_customer_id
    `);

    // Customers with no orders at all → Lost
    await db.execute(sql`
      UPDATE customers_mirror
      SET account_health = 'Lost', updated_at = NOW()
      WHERE bigcommerce_customer_id NOT IN (
        SELECT DISTINCT bigcommerce_customer_id FROM customer_orders_mirror
      )
    `);

    const updated = Number((result as any).count ?? (result as any).rowCount ?? 0);
    const duration_ms = Date.now() - start;
    return { updated, customers_in_orders, duration_ms };
  }

  // ─── CRM Notes ────────────────────────────────────────────────────────────────

  async createCrmNote(data: InsertCrmNote): Promise<CrmNote> {
    const result = await db.insert(crmCustomerNotes).values(data).returning();
    return result[0];
  }

  async getCrmNotes(customerId: number): Promise<(CrmNote & { created_by_name?: string | null })[]> {
    const rows = await db.select({ n: crmCustomerNotes, u: users })
      .from(crmCustomerNotes)
      .leftJoin(users, eq(users.id, crmCustomerNotes.created_by))
      .where(eq(crmCustomerNotes.customer_id, customerId))
      .orderBy(desc(crmCustomerNotes.created_at));
    return rows.map(r => ({ ...r.n, created_by_name: r.u?.name ?? null }));
  }

  async getCrmNoteById(id: number): Promise<CrmNote | undefined> {
    const rows = await db.select().from(crmCustomerNotes).where(eq(crmCustomerNotes.id, id)).limit(1);
    return rows[0];
  }

  async updateCrmNote(id: number, data: { note?: string; note_type?: string; order_id?: number | null }): Promise<CrmNote> {
    const result = await db.update(crmCustomerNotes)
      .set({ ...data, updated_at: new Date() })
      .where(eq(crmCustomerNotes.id, id))
      .returning();
    return result[0];
  }

  async deleteCrmNote(id: number): Promise<void> {
    await db.delete(crmCustomerNotes).where(eq(crmCustomerNotes.id, id));
  }

  async getAllCrmNotes(opts: { search?: string; type?: string; createdBy?: number; customerId?: number; orderId?: number; customerGroup?: string; state?: string; dateFrom?: string; dateTo?: string; limit?: number; offset?: number }): Promise<{ notes: any[]; total: number }> {
    const { search, type, createdBy, customerId, orderId, customerGroup, state, dateFrom, dateTo, limit = 50, offset = 0 } = opts;
    const conditions: any[] = [];

    if (search?.trim()) {
      const s = `%${search.trim()}%`;
      conditions.push(or(
        ilike(customersMirror.company, s),
        ilike(customersMirror.first_name, s),
        ilike(customersMirror.last_name, s),
        ilike(crmCustomerNotes.note, s),
      ));
    }
    if (type) conditions.push(eq(crmCustomerNotes.note_type, type));
    if (createdBy) conditions.push(eq(crmCustomerNotes.created_by, createdBy));
    if (customerId) conditions.push(eq(crmCustomerNotes.customer_id, customerId));
    if (orderId) conditions.push(eq(crmCustomerNotes.order_id, orderId));
    if (customerGroup) conditions.push(eq(customersMirror.customer_group_name, customerGroup));
    if (state) {
      conditions.push(sql`coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') = ${state}`);
    }
    if (dateFrom) conditions.push(sql`${crmCustomerNotes.created_at} >= ${dateFrom}::timestamptz`);
    if (dateTo) conditions.push(sql`${crmCustomerNotes.created_at} <= ${dateTo}::timestamptz + interval '1 day'`);

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRows, rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` })
        .from(crmCustomerNotes)
        .innerJoin(customersMirror, eq(customersMirror.id, crmCustomerNotes.customer_id))
        .leftJoin(users, eq(users.id, crmCustomerNotes.created_by))
        .where(where),
      db.select({
        n: crmCustomerNotes,
        customer_company: customersMirror.company,
        customer_first_name: customersMirror.first_name,
        customer_last_name: customersMirror.last_name,
        customer_bc_id: customersMirror.bigcommerce_customer_id,
        customer_group_name: customersMirror.customer_group_name,
        billing_address: customersMirror.billing_address,
        shipping_address: customersMirror.shipping_address,
        created_by_name: users.name,
      })
        .from(crmCustomerNotes)
        .innerJoin(customersMirror, eq(customersMirror.id, crmCustomerNotes.customer_id))
        .leftJoin(users, eq(users.id, crmCustomerNotes.created_by))
        .where(where)
        .orderBy(desc(crmCustomerNotes.created_at))
        .limit(limit)
        .offset(offset),
    ]);

    return {
      notes: rows.map(r => ({
        ...r.n,
        customer_company: r.customer_company,
        customer_first_name: r.customer_first_name,
        customer_last_name: r.customer_last_name,
        customer_bc_id: r.customer_bc_id,
        customer_group_name: r.customer_group_name,
        created_by_name: r.created_by_name ?? null,
      })),
      total: countRows[0]?.count ?? 0,
    };
  }

  async getCrmNotesKpis(opts: {
    search?: string; createdBy?: number; customerGroup?: string;
    state?: string; dateFrom?: string; dateTo?: string;
  } = {}): Promise<{ notesToday: number; followUps: number; salesCalls: number; issues: number; internalNotes: number }> {
    const { search, createdBy, customerGroup, state, dateFrom, dateTo } = opts;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const baseConds: any[] = [];
    if (search?.trim()) {
      const s = `%${search.trim()}%`;
      baseConds.push(or(
        ilike(customersMirror.company, s),
        ilike(customersMirror.first_name, s),
        ilike(customersMirror.last_name, s),
        ilike(crmCustomerNotes.note, s),
      ));
    }
    if (createdBy) baseConds.push(eq(crmCustomerNotes.created_by, createdBy));
    if (customerGroup) baseConds.push(eq(customersMirror.customer_group_name, customerGroup));
    if (state) baseConds.push(sql`coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') = ${state}`);
    if (dateFrom) baseConds.push(sql`${crmCustomerNotes.created_at} >= ${dateFrom}::timestamptz`);
    if (dateTo) baseConds.push(sql`${crmCustomerNotes.created_at} <= ${dateTo}::timestamptz + interval '1 day'`);

    const todayConds = [...baseConds, sql`${crmCustomerNotes.created_at} >= ${todayStart.toISOString()}::timestamptz`];
    const baseWhere = baseConds.length > 0 ? and(...baseConds) : undefined;
    const todayWhere = and(...todayConds);

    const [todayCount, typeRows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` })
        .from(crmCustomerNotes)
        .innerJoin(customersMirror, eq(customersMirror.id, crmCustomerNotes.customer_id))
        .where(todayWhere),
      db.select({ type: crmCustomerNotes.note_type, count: sql<number>`count(*)::int` })
        .from(crmCustomerNotes)
        .innerJoin(customersMirror, eq(customersMirror.id, crmCustomerNotes.customer_id))
        .where(baseWhere)
        .groupBy(crmCustomerNotes.note_type),
    ]);

    const typeCounts: Record<string, number> = {};
    for (const r of typeRows) typeCounts[r.type] = r.count;

    return {
      notesToday: todayCount[0]?.count ?? 0,
      followUps: typeCounts['Follow Up'] ?? 0,
      salesCalls: typeCounts['Sales'] ?? 0,
      issues: typeCounts['Issue'] ?? 0,
      internalNotes: typeCounts['Internal'] ?? 0,
    };
  }

  // ─── CRM Timeline ─────────────────────────────────────────────────────────────

  async getCrmTimeline(customerId: number): Promise<any[]> {
    const custRow = await db.select({ bc_id: customersMirror.bigcommerce_customer_id })
      .from(customersMirror).where(eq(customersMirror.id, customerId)).limit(1);
    if (!custRow[0]) return [];
    const bcId = custRow[0].bc_id;

    const auditActions = [
      'sales_rep_assigned', 'sales_rep_removed', 'sales_rep_reassigned',
      'primary_rep_assigned', 'primary_rep_changed', 'primary_rep_removed',
      'secondary_rep_assigned', 'secondary_rep_changed', 'secondary_rep_removed',
      'customer_type_changed', 'address_type_updated',
      'note_created', 'note_edited', 'note_deleted',
      'order_note_created', 'staff_note_updated', 'customer_note_updated',
    ];

    const [orders, notes, auditRows] = await Promise.all([
      db.select().from(customerOrdersMirror)
        .where(eq(customerOrdersMirror.bigcommerce_customer_id, bcId))
        .orderBy(desc(customerOrdersMirror.order_date))
        .limit(50),
      db.select({ n: crmCustomerNotes, u: users })
        .from(crmCustomerNotes)
        .leftJoin(users, eq(users.id, crmCustomerNotes.created_by))
        .where(eq(crmCustomerNotes.customer_id, customerId))
        .orderBy(desc(crmCustomerNotes.created_at)),
      db.select({ a: crmAuditLog, u: users })
        .from(crmAuditLog)
        .leftJoin(users, eq(users.id, crmAuditLog.user_id))
        .where(and(
          eq(crmAuditLog.customer_id, customerId),
          inArray(crmAuditLog.action, auditActions),
        ))
        .orderBy(desc(crmAuditLog.created_at))
        .limit(50),
    ]);

    const timeline: any[] = [
      ...orders.map(o => ({
        id: `order-${o.id}`,
        type: 'order',
        date: o.order_date?.toISOString() ?? o.created_at.toISOString(),
        order_number: o.order_number,
        order_total: o.order_total,
        status: o.status,
        bc_order_id: o.bigcommerce_order_id,
        staff_notes: o.staff_notes,
        customer_order_notes: o.customer_order_notes,
      })),
      ...notes.map(row => ({
        id: `note-${row.n.id}`,
        type: 'note',
        date: row.n.created_at.toISOString(),
        note_id: row.n.id,
        note_type: row.n.note_type,
        note_content: row.n.note,
        order_id: row.n.order_id,
        created_by_name: row.u?.name ?? null,
      })),
      ...auditRows.map(row => ({
        id: `audit-${row.a.id}`,
        type: 'audit',
        date: row.a.created_at.toISOString(),
        action: row.a.action,
        detail: row.a.detail,
        user_id: row.a.user_id,
        user_name: row.u?.name ?? null,
      })),
    ];

    return timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  // ─── CRM Reactivation ─────────────────────────────────────────────────────────

  async getReactivationCustomers(opts: { search?: string; group?: string; state?: string; health?: string; rep?: number; sortBy?: string; sortDir?: string; limit?: number; offset?: number; visibilityScope?: string; visibilityUserId?: number }): Promise<{ customers: (CrmCustomer & { sales_rep_name?: string | null })[]; total: number }> {
    const { search, group, state, health, rep, sortBy = 'last_order_date', sortDir = 'asc', limit = 50, offset = 0, visibilityScope, visibilityUserId } = opts;

    const healthFilter = health && ['At Risk', 'Lost'].includes(health) ? [health] : ['At Risk', 'Lost'];
    const conditions: any[] = [inArray(customersMirror.account_health, healthFilter)];

    if (search?.trim()) {
      const s = `%${search.trim()}%`;
      conditions.push(or(
        ilike(customersMirror.company, s),
        ilike(customersMirror.first_name, s),
        ilike(customersMirror.last_name, s),
        ilike(customersMirror.email, s),
      ));
    }
    if (group) conditions.push(eq(customersMirror.customer_group_name, group));
    if (state) {
      if (state === 'Unknown') {
        conditions.push(sql`(coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') IS NULL OR coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') = '')`);
      } else {
        conditions.push(sql`coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') = ${state}`);
      }
    }
    if (rep) conditions.push(eq(customerSalesRep.assigned_user_id, rep));
    const repVisConds = this.buildCrmRepConditions(undefined, visibilityScope, visibilityUserId);
    conditions.push(...repVisConds);

    const where = and(...conditions);

    const orderExpr = sortDir === 'asc'
      ? sql`${customersMirror.last_order_date} ASC NULLS LAST`
      : sql`${customersMirror.last_order_date} DESC NULLS LAST`;

    const [countRows, rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` })
        .from(customersMirror)
        .leftJoin(customerSalesRep, eq(customerSalesRep.customer_id, customersMirror.id))
        .where(where),
      db.select({ c: customersMirror, rep_name: users.name })
        .from(customersMirror)
        .leftJoin(customerSalesRep, eq(customerSalesRep.customer_id, customersMirror.id))
        .leftJoin(users, eq(users.id, customerSalesRep.assigned_user_id))
        .where(where)
        .orderBy(orderExpr as any)
        .limit(limit)
        .offset(offset),
    ]);

    return {
      customers: rows.map(r => ({ ...r.c, sales_rep_name: r.rep_name ?? null })),
      total: countRows[0]?.count ?? 0,
    };
  }

  // ─── CRM Metrics ──────────────────────────────────────────────────────────────

  async getCrmMetrics(opts: { search?: string; group?: string; state?: string; primaryRep?: number | "unassigned"; secondaryRep?: number | "unassigned"; customerType?: string; addressType?: string; assignedRep?: number | "unassigned"; visibilityScope?: string; visibilityUserId?: number }): Promise<{ total: number; healthy: number; watch: number; at_risk: number; lost: number; needs_follow_up: number }> {
    const { search, group, state, primaryRep, secondaryRep, customerType, addressType, assignedRep, visibilityScope, visibilityUserId } = opts;
    const baseWhere = this.buildCrmWhereClause(search, group, state, undefined, customerType, addressType, primaryRep, secondaryRep);
    const repConds = this.buildCrmRepConditions(assignedRep, visibilityScope, visibilityUserId);
    const needsRepJoin = repConds.length > 0;
    const allConds = [...(baseWhere ? [baseWhere] : []), ...repConds];
    const where = allConds.length === 0 ? undefined : allConds.length === 1 ? allConds[0] : and(...allConds);

    const rows = needsRepJoin
      ? await db.select({ account_health: customersMirror.account_health, count: sql<number>`count(*)::int` })
          .from(customersMirror)
          .leftJoin(customerSalesRep, eq(customerSalesRep.customer_id, customersMirror.id))
          .where(where)
          .groupBy(customersMirror.account_health)
      : await db.select({ account_health: customersMirror.account_health, count: sql<number>`count(*)::int` })
          .from(customersMirror)
          .where(where)
          .groupBy(customersMirror.account_health);

    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.account_health ?? '__null__'] = r.count;

    const healthy = counts['Healthy'] ?? 0;
    const watch = counts['Watch'] ?? 0;
    const at_risk = counts['At Risk'] ?? 0;
    const lost = (counts['Lost'] ?? 0) + (counts['__null__'] ?? 0);
    const total = healthy + watch + at_risk + lost;
    return { total, healthy, watch, at_risk, lost, needs_follow_up: at_risk + lost };
  }

  // ─── CRM Users ────────────────────────────────────────────────────────────────

  async getCrmUsers(): Promise<{ id: number; name: string }[]> {
    const rows = await db.select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.is_enabled, true))
      .orderBy(asc(users.name));
    return rows.map(r => ({ id: r.id, name: r.name ?? '' }));
  }

  // ─── CRM Order Notes ──────────────────────────────────────────────────────────

  async updateCrmOrderNotes(bcOrderId: number, data: { staff_notes?: string; customer_order_notes?: string }): Promise<void> {
    await db.update(customerOrdersMirror)
      .set({ ...data, updated_at: new Date() })
      .where(eq(customerOrdersMirror.bigcommerce_order_id, bcOrderId));
  }

  // ─── CRM Audit Log ────────────────────────────────────────────────────────────

  async createCrmAuditLog(data: InsertCrmAuditLog): Promise<void> {
    await db.insert(crmAuditLog).values(data);
  }

  async truncateCrmCustomers(): Promise<void> {
    await db.delete(customersMirror);
  }

  async truncateCrmOrders(): Promise<void> {
    await db.delete(customerOrdersMirror);
  }
}

export const storage = new DatabaseStorage();
