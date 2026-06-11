import { db } from "../db";
import { type User, type InsertUser, type Product, type InsertProduct, type Order, type InsertOrder, type InsertPriceHistoryCache, type PriceHistoryCacheEntry, type InsertInventoryPushLog, type InventoryPushLog, type InsertProductLinkLog, type ProductLinkLog, type Role, type InsertRole, type Permission, type InsertPermission, type InsertRolePermission, type InsertUserPermission, type InsertShipstationExportHistory, type ShipstationExportHistory, type InsertPromoFreeSkuTracker, type PromoFreeSkuTracker, type CrmCustomer, type InsertCrmCustomer, type CrmOrder, type InsertCrmOrder, type CrmSalesRep, type InsertCrmSalesRep, users, products, orders, settings, priceHistoryCache, inventoryPushLogs, productLinkLogs, roles, permissions, rolePermissions, userPermissions, shipstationExportHistory, promoFreeSkuTracker, customersMirror, customerOrdersMirror, customerSalesRep } from "@shared/schema";
import { eq, desc, and, inArray, gt, asc, or, ilike, sql, isNotNull } from "drizzle-orm";

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
  updateUserDetails(id: number, data: Partial<{ name: string; username: string; password: string; role: string; is_enabled: boolean; allow_bigcommerce_search: boolean }>): Promise<User>;

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
  getCrmCustomers(opts: { search?: string; group?: string; state?: string; sortBy?: string; sortDir?: string; limit?: number; offset?: number }): Promise<{ customers: (CrmCustomer & { sales_rep_name?: string | null })[]; total: number }>;
  getCrmCustomerById(id: number): Promise<(CrmCustomer & { sales_rep_name?: string | null }) | undefined>;
  getCrmCustomerByBcId(bcId: number): Promise<CrmCustomer | undefined>;
  upsertCrmCustomer(data: InsertCrmCustomer): Promise<CrmCustomer>;
  getCrmCustomerCount(): Promise<number>;
  getAllCrmCustomersForExport(opts: { search?: string; group?: string; state?: string; sortBy?: string; sortDir?: string }): Promise<(CrmCustomer & { sales_rep_name?: string | null })[]>;
  getCrmFilterOptions(): Promise<{ groups: string[]; states: string[] }>;
  getCrmOrdersByBcCustomerId(bcCustomerId: number, limit?: number): Promise<CrmOrder[]>;
  upsertCrmOrder(data: InsertCrmOrder): Promise<CrmOrder>;
  getCrmOrderCount(): Promise<number>;
  updateCrmCustomerStats(bcCustomerId: number, stats: { lifetime_orders: number; lifetime_revenue: string; last_order_date: Date | null }): Promise<void>;
  recalculateCrmCustomerStats(): Promise<{ updated: number; customers_in_orders: number; duration_ms: number }>;
  getCrmSalesRep(customerId: number): Promise<CrmSalesRep | undefined>;
  setCrmSalesRep(data: InsertCrmSalesRep): Promise<CrmSalesRep>;
  removeCrmSalesRep(customerId: number): Promise<void>;
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

  async updateUserDetails(id: number, data: Partial<{ name: string; username: string; password: string; role: string; is_enabled: boolean; allow_bigcommerce_search: boolean }>): Promise<User> {
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

  private buildCrmWhereClause(search?: string, group?: string, state?: string) {
    const conditions: any[] = [];
    if (search?.trim()) {
      const s = `%${search.trim()}%`;
      conditions.push(or(
        ilike(customersMirror.company, s),
        ilike(customersMirror.first_name, s),
        ilike(customersMirror.last_name, s),
        ilike(customersMirror.email, s),
        ilike(customersMirror.phone, s),
      ));
    }
    if (group) {
      conditions.push(eq(customersMirror.customer_group_name, group));
    }
    if (state) {
      if (state === "Unknown") {
        conditions.push(sql`coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') IS NULL OR coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') = ''`);
      } else {
        conditions.push(sql`coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') = ${state}`);
      }
    }
    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];
    return and(...conditions);
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
      default:
        return sortDir === "asc"
          ? sql`${customersMirror.last_order_date} ASC NULLS LAST`
          : sql`${customersMirror.last_order_date} DESC NULLS LAST`;
    }
  }

  async getCrmCustomers(opts: { search?: string; group?: string; state?: string; sortBy?: string; sortDir?: string; limit?: number; offset?: number }): Promise<{ customers: (CrmCustomer & { sales_rep_name?: string | null })[]; total: number }> {
    const { search, group, state, sortBy = "last_order_date", sortDir = "desc", limit = 50, offset = 0 } = opts;
    const where = this.buildCrmWhereClause(search, group, state);
    const orderExpr = this.buildCrmOrderBy(sortBy, sortDir);
    const countRows = await db.select({ count: sql<number>`count(*)::int` }).from(customersMirror).where(where);
    const total = countRows[0]?.count ?? 0;
    const rows = await db.select({ c: customersMirror, rep_name: users.name })
      .from(customersMirror)
      .leftJoin(customerSalesRep, eq(customerSalesRep.customer_id, customersMirror.id))
      .leftJoin(users, eq(users.id, customerSalesRep.assigned_user_id))
      .where(where)
      .orderBy(orderExpr as any)
      .limit(limit)
      .offset(offset);
    return { customers: rows.map(r => ({ ...r.c, sales_rep_name: r.rep_name ?? null })), total };
  }

  async getCrmCustomerById(id: number): Promise<(CrmCustomer & { sales_rep_name?: string | null }) | undefined> {
    const rows = await db.select({ c: customersMirror, rep_name: users.name })
      .from(customersMirror)
      .leftJoin(customerSalesRep, eq(customerSalesRep.customer_id, customersMirror.id))
      .leftJoin(users, eq(users.id, customerSalesRep.assigned_user_id))
      .where(eq(customersMirror.id, id));
    if (!rows[0]) return undefined;
    return { ...rows[0].c, sales_rep_name: rows[0].rep_name ?? null };
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
          updated_at: new Date(),
        },
      }).returning();
    return result[0];
  }

  async getCrmCustomerCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(customersMirror);
    return result[0]?.count ?? 0;
  }

  async getAllCrmCustomersForExport(opts: { search?: string; group?: string; state?: string; sortBy?: string; sortDir?: string }): Promise<(CrmCustomer & { sales_rep_name?: string | null })[]> {
    const { search, group, state, sortBy = "last_order_date", sortDir = "desc" } = opts;
    const where = this.buildCrmWhereClause(search, group, state);
    const orderExpr = this.buildCrmOrderBy(sortBy, sortDir);
    const rows = await db.select({ c: customersMirror, rep_name: users.name })
      .from(customersMirror)
      .leftJoin(customerSalesRep, eq(customerSalesRep.customer_id, customersMirror.id))
      .leftJoin(users, eq(users.id, customerSalesRep.assigned_user_id))
      .where(where)
      .orderBy(orderExpr as any);
    return rows.map(r => ({ ...r.c, sales_rep_name: r.rep_name ?? null }));
  }

  async getCrmFilterOptions(): Promise<{ groups: string[]; states: string[] }> {
    const [groupRows, stateRows] = await Promise.all([
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
    ]);
    return {
      groups: (groupRows.map(r => r.name).filter(Boolean) as string[]),
      states: (stateRows.map(r => r.state).filter(Boolean) as string[]).sort(),
    };
  }

  async getCrmOrdersByBcCustomerId(bcCustomerId: number, limit = 20): Promise<CrmOrder[]> {
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

    // Count distinct customers that have orders (for logging)
    const countRes = await db
      .select({ n: sql<number>`count(distinct ${customerOrdersMirror.bigcommerce_customer_id})::int` })
      .from(customerOrdersMirror);
    const customers_in_orders = countRes[0]?.n ?? 0;

    // Single-pass UPDATE using proven raw SQL — avoids Drizzle timestamp serialization issues
    const result = await db.execute(sql`
      UPDATE customers_mirror cm
      SET
        lifetime_orders  = agg.order_count,
        lifetime_revenue = agg.total_revenue,
        last_order_date  = agg.last_order,
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

    const updated = Number((result as any).count ?? (result as any).rowCount ?? 0);
    const duration_ms = Date.now() - start;
    return { updated, customers_in_orders, duration_ms };
  }
}

export const storage = new DatabaseStorage();
