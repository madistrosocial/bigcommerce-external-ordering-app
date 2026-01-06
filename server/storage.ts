import { db } from "../db";
import { type User, type InsertUser, type Product, type InsertProduct, type Order, type InsertOrder, users, products, orders, settings } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllAgents(): Promise<User[]>;
  getAllAdmins(): Promise<User[]>;
  getAllUsers(): Promise<User[]>;
  updateUserStatus(id: number, is_enabled: boolean): Promise<void>;

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
  updateOrderStatus(id: number, status: string, bcOrderId?: number): Promise<void>;

  // Setting operations
  getSetting(key: string): Promise<any>;
  setSetting(key: string, value: any): Promise<void>;
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

  async updateOrderStatus(id: number, status: string, bcOrderId?: number): Promise<void> {
    await db.update(orders).set({ 
      status, 
      ...(bcOrderId && { bigcommerce_order_id: bcOrderId }) 
    }).where(eq(orders.id, id));
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
}

export const storage = new DatabaseStorage();
