import { db } from "../db";
import { type User, type InsertUser, type Product, type InsertProduct, type Order, type InsertOrder, type InsertPriceHistoryCache, type PriceHistoryCacheEntry, type InsertInventoryPushLog, type InventoryPushLog, type InsertProductLinkLog, type ProductLinkLog, type Role, type InsertRole, type Permission, type InsertPermission, type InsertRolePermission, type InsertUserPermission, users, products, orders, settings, priceHistoryCache, inventoryPushLogs, productLinkLogs, roles, permissions, rolePermissions, userPermissions } from "@shared/schema";
import { eq, desc, and, inArray, gt, asc } from "drizzle-orm";

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
  getProductByBigCommerceId(bcId: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProductPin(id: number, is_pinned: boolean): Promise<void>;
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
}

export const storage = new DatabaseStorage();
