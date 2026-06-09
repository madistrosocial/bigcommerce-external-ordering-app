import { pgTable, text, integer, boolean, decimal, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── RBAC ────────────────────────────────────────────────────────────────────

export const roles = pgTable("roles", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  description: text("description"),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export const permissions = pgTable("permissions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  module: text("module").notNull(),
  action: text("action").notNull(),
  description: text("description"),
});

export const rolePermissions = pgTable("role_permissions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  role_id: integer("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  permission_id: integer("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
});

export const userPermissions = pgTable("user_permissions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  user_id: integer("user_id").notNull(),
  permission_id: integer("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
});

// ─── Core ─────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(), // 'admin' or 'agent'
  is_enabled: boolean("is_enabled").notNull().default(true),
  allow_bigcommerce_search: boolean("allow_bigcommerce_search").notNull().default(false),
  role_id: integer("role_id"), // nullable FK to roles
});

export const products = pgTable("products", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  bigcommerce_id: integer("bigcommerce_id").notNull().unique(),
  name: text("name").notNull(),
  sku: text("sku").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  image: text("image").notNull(),
  description: text("description").notNull(),
  stock_level: integer("stock_level").notNull().default(0),
  is_pinned: boolean("is_pinned").notNull().default(false),
  is_promotion: boolean("is_promotion").notNull().default(false),
  variants: jsonb("variants").notNull().default([]), // Array of variants
});

export const orders = pgTable("orders", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  customer_name: text("customer_name").notNull(),
  customer_email: text("customer_email"),
  bigcommerce_customer_id: integer("bigcommerce_customer_id"),
  billing_address: jsonb("billing_address"),
  status: text("status").notNull(), // 'draft', 'pending_sync', 'failed', or 'synced'
  sync_error: text("sync_error"), // Error message from failed BigCommerce sync
  order_note: text("order_note"), // Agent internal/staff note
  customer_note: text("customer_note"), // Customer-visible note (synced to BC customer_message)
  items: jsonb("items").notNull(), // Array of order items including variant info
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  date: timestamp("date").notNull().defaultNow(),
  created_by_user_id: integer("created_by_user_id").notNull().references(() => users.id),
  bigcommerce_order_id: integer("bigcommerce_order_id"),
  google_sheets_logged: boolean("google_sheets_logged").notNull().default(false),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  key: text("key").notNull().unique(),
  value: jsonb("value").notNull(),
});

export const priceHistoryCache = pgTable("price_history_cache", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  customer_id: integer("customer_id").notNull(),
  product_id: integer("product_id").notNull(),
  variant_id: integer("variant_id"),
  price: text("price").notNull(),
  order_id: integer("order_id").notNull(),
  order_date: text("order_date"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  sku: text("sku"),
});

export const productLinkLogs = pgTable("product_link_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  main_product_id: integer("main_product_id").notNull(),
  main_product_name: text("main_product_name").notNull(),
  linked_product_id: integer("linked_product_id").notNull(),
  linked_product_name: text("linked_product_name").notNull(),
  bidirectional: boolean("bidirectional").notNull().default(false),
  created_by_user_id: integer("created_by_user_id").notNull().references(() => users.id),
  created_by_name: text("created_by_name").notNull().default(""),
  status: text("status").notNull().default("success"), // 'success' | 'partial' | 'failed'
  results: jsonb("results").notNull().default([]),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export const inventoryPushLogs = pgTable("inventory_push_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  user_id: integer("user_id").notNull().references(() => users.id),
  username: text("username").notNull().default(""),
  sku: text("sku").notNull(),
  product_id: integer("product_id").notNull(),
  variant_id: integer("variant_id").notNull(),
  product_name: text("product_name").notNull().default(""),
  variant_name: text("variant_name").notNull().default(""),
  previous_inventory: integer("previous_inventory").notNull(),
  new_inventory: integer("new_inventory").notNull(),
  quantity_added: integer("quantity_added").notNull(),
  reason: text("reason"),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export const promoFreeSkuTracker = pgTable("promo_free_sku_tracker", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  sku: text("sku").notNull().unique(),
  product_id: integer("product_id").notNull(),
  variant_id: integer("variant_id"),
  product_name: text("product_name").notNull(),
  variant_name: text("variant_name"),
  promo_note: text("promo_note"),
  created_by: integer("created_by"),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export const shipstationExportHistory = pgTable("shipstation_export_history", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  export_date: timestamp("export_date").notNull().defaultNow(),
  file_name: text("file_name").notNull(),
  record_count: integer("record_count").notNull().default(0),
  status: text("status").notNull(), // 'success' | 'failed'
  error_message: text("error_message"),
  file_content: text("file_content"), // CSV/TXT content for download
  created_at: timestamp("created_at").notNull().defaultNow(),
});

// Insert schemas — RBAC
export const insertRoleSchema = createInsertSchema(roles).omit({ id: true, created_at: true });
export const insertPermissionSchema = createInsertSchema(permissions).omit({ id: true });
export const insertRolePermissionSchema = createInsertSchema(rolePermissions).omit({ id: true });
export const insertUserPermissionSchema = createInsertSchema(userPermissions).omit({ id: true });

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertProductSchema = createInsertSchema(products).omit({ id: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, date: true });
export const insertPriceHistoryCacheSchema = createInsertSchema(priceHistoryCache).omit({ id: true, created_at: true });
export const insertInventoryPushLogSchema = createInsertSchema(inventoryPushLogs).omit({ id: true, created_at: true });
export const insertProductLinkLogSchema = createInsertSchema(productLinkLogs).omit({ id: true, created_at: true });
export const insertPromoFreeSkuTrackerSchema = createInsertSchema(promoFreeSkuTracker).omit({ id: true, created_at: true, updated_at: true });
export const insertShipstationExportHistorySchema = createInsertSchema(shipstationExportHistory).omit({ id: true, created_at: true, export_date: true });

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

export type InsertPriceHistoryCache = z.infer<typeof insertPriceHistoryCacheSchema>;
export type PriceHistoryCacheEntry = typeof priceHistoryCache.$inferSelect;

export type InsertInventoryPushLog = z.infer<typeof insertInventoryPushLogSchema>;
export type InventoryPushLog = typeof inventoryPushLogs.$inferSelect;

export type InsertProductLinkLog = z.infer<typeof insertProductLinkLogSchema>;
export type ProductLinkLog = typeof productLinkLogs.$inferSelect;

export type InsertPromoFreeSkuTracker = z.infer<typeof insertPromoFreeSkuTrackerSchema>;
export type PromoFreeSkuTracker = typeof promoFreeSkuTracker.$inferSelect;

export type InsertShipstationExportHistory = z.infer<typeof insertShipstationExportHistorySchema>;
export type ShipstationExportHistory = typeof shipstationExportHistory.$inferSelect;

// RBAC types
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Role = typeof roles.$inferSelect;

export type InsertPermission = z.infer<typeof insertPermissionSchema>;
export type Permission = typeof permissions.$inferSelect;

export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;
export type RolePermission = typeof rolePermissions.$inferSelect;

export type InsertUserPermission = z.infer<typeof insertUserPermissionSchema>;
export type UserPermission = typeof userPermissions.$inferSelect;
