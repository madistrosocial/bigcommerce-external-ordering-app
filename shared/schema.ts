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
  default_landing_page: text("default_landing_page").notNull().default("/dashboard"),
});

export const products = pgTable("products", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  bigcommerce_id: integer("bigcommerce_id").notNull().unique(),
  name: text("name").notNull(),
  sku: text("sku").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  image: text("image").notNull(),
  description: text("description").notNull(),
  cost_price: decimal("cost_price", { precision: 10, scale: 2 }),
  stock_level: integer("stock_level").notNull().default(0),
  is_pinned: boolean("is_pinned").notNull().default(false),
  is_promotion: boolean("is_promotion").notNull().default(false),
  variants: jsonb("variants").notNull().default([]), // Array of variants
  brand_id: integer("brand_id"),
  brand_name: text("brand_name"),
  categories: jsonb("categories").default([]), // Array of category IDs
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

// ─── CRM ──────────────────────────────────────────────────────────────────────

export const customersMirror = pgTable("customers_mirror", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  bigcommerce_customer_id: integer("bigcommerce_customer_id").notNull().unique(),
  company: text("company"),
  first_name: text("first_name").notNull().default(""),
  last_name: text("last_name").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone"),
  customer_group_id: integer("customer_group_id"),
  customer_group_name: text("customer_group_name"),
  billing_address: jsonb("billing_address"),
  shipping_address: jsonb("shipping_address"),
  created_date: timestamp("created_date"),
  last_order_date: timestamp("last_order_date"),
  lifetime_orders: integer("lifetime_orders").notNull().default(0),
  lifetime_revenue: decimal("lifetime_revenue", { precision: 14, scale: 2 }).notNull().default("0"),
  store_credit_balance: decimal("store_credit_balance", { precision: 14, scale: 2 }).notNull().default("0"),
  is_active: boolean("is_active").notNull().default(true),
  account_health: text("account_health"),
  primary_rep_id: integer("primary_rep_id"),
  secondary_rep_id: integer("secondary_rep_id"),
  customer_type: text("customer_type").notNull().default("Store"),
  address_type: text("address_type").notNull().default("Unknown"),
  // SalesCore-only ERP fields — never overwritten by BC sync
  account_type: text("account_type").notNull().default("customer"),
  inactive_reason: text("inactive_reason"),
  inactive_at: timestamp("inactive_at"),
  inactive_notes: text("inactive_notes"),
  inactivated_by_user_id: integer("inactivated_by_user_id"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export const customerOrdersMirror = pgTable("customer_orders_mirror", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  bigcommerce_order_id: integer("bigcommerce_order_id").notNull().unique(),
  bigcommerce_customer_id: integer("bigcommerce_customer_id").notNull(),
  order_number: integer("order_number"),
  order_date: timestamp("order_date"),
  order_total: decimal("order_total", { precision: 14, scale: 2 }).notNull().default("0"),
  status: text("status"),
  payment_status: text("payment_status"),
  customer_name: text("customer_name"),
  customer_email: text("customer_email"),
  staff_notes: text("staff_notes"),
  customer_order_notes: text("customer_order_notes"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export const customerSalesRep = pgTable("customer_sales_rep", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  customer_id: integer("customer_id").notNull().references(() => customersMirror.id, { onDelete: "cascade" }),
  assigned_user_id: integer("assigned_user_id").notNull().references(() => users.id),
  assigned_at: timestamp("assigned_at").notNull().defaultNow(),
  assigned_by: integer("assigned_by"),
});

export const crmCustomerNotes = pgTable("crm_customer_notes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  customer_id: integer("customer_id").references(() => customersMirror.id, { onDelete: "cascade" }),
  note_type: text("note_type").notNull().default("General"),
  note: text("note").notNull().default(""),
  order_id: integer("order_id"),
  created_by: integer("created_by").references(() => users.id),
  // To Do / Actions extended fields
  activity_type: text("activity_type").notNull().default("note"), // 'note' | 'todo'
  title: text("title"),
  assigned_to_user_id: integer("assigned_to_user_id").references(() => users.id),
  priority: text("priority"), // 'low' | 'medium' | 'high'
  due_date: timestamp("due_date"),
  completed_at: timestamp("completed_at"),
  reminder_at: timestamp("reminder_at"),
  todo_status: text("todo_status"), // 'pending' | 'completed'
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  user_id: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  customer_id: integer("customer_id").references(() => customersMirror.id, { onDelete: "set null" }),
  message: text("message").notNull(),
  notification_type: text("notification_type").notNull().default("info"),
  is_read: boolean("is_read").notNull().default(false),
  link_url: text("link_url"),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export const crmAuditLog = pgTable("crm_audit_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  user_id: integer("user_id").references(() => users.id),
  action: text("action").notNull(),
  customer_id: integer("customer_id").references(() => customersMirror.id, { onDelete: "set null" }),
  detail: jsonb("detail"),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

// ─── POS Enhancements (Price Protection / Store Credit) ───────────────────────

export const posPriceOverrideAudit = pgTable("pos_price_override_audit", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  user_id: integer("user_id").notNull().references(() => users.id),
  customer_id: integer("customer_id"),
  customer_name: text("customer_name"),
  order_id: integer("order_id"),
  bigcommerce_order_id: integer("bigcommerce_order_id"),
  product_id: integer("product_id").notNull(),
  product_name: text("product_name").notNull(),
  sku: text("sku").notNull(),
  product_cost: decimal("product_cost", { precision: 10, scale: 2 }).notNull(),
  selling_price: decimal("selling_price", { precision: 10, scale: 2 }).notNull(),
  loss_amount: decimal("loss_amount", { precision: 10, scale: 2 }).notNull(),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export const posStoreCreditUsage = pgTable("pos_store_credit_usage", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  order_id: integer("order_id"),
  bigcommerce_order_id: integer("bigcommerce_order_id"),
  customer_id: integer("customer_id").notNull(),
  customer_name: text("customer_name"),
  cashier_id: integer("cashier_id").notNull().references(() => users.id),
  credit_before: decimal("credit_before", { precision: 14, scale: 2 }).notNull(),
  credit_used: decimal("credit_used", { precision: 14, scale: 2 }).notNull(),
  credit_remaining: decimal("credit_remaining", { precision: 14, scale: 2 }).notNull(),
  order_total_before: decimal("order_total_before", { precision: 10, scale: 2 }).notNull(),
  final_order_total: decimal("final_order_total", { precision: 10, scale: 2 }).notNull(),
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

// ─── Store Credit Ledger ──────────────────────────────────────────────────────
export const storeCreditLedger = pgTable("store_credit_ledger", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  customer_id: integer("customer_id").references(() => customersMirror.id, { onDelete: "set null" }),
  bigcommerce_customer_id: integer("bigcommerce_customer_id"),
  bigcommerce_order_id: integer("bigcommerce_order_id"),
  order_id: integer("order_id"),
  type: text("type").notNull().default("issued"), // 'issued' | 'redeemed' | 'adjusted'
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  tax: decimal("tax", { precision: 14, scale: 2 }).notNull().default("0"),
  reason: text("reason"),
  products: jsonb("products"), // { name, sku, qty, unit_price, tax, line_total }[]
  issued_by: integer("issued_by").references(() => users.id),
  issued_by_name: text("issued_by_name"),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

// ─── Email Templates ──────────────────────────────────────────────────────────
export const emailTemplates = pgTable("email_templates", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  subject_template: text("subject_template").notNull().default(""),
  body: text("body").notNull().default(""),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
  updated_by: integer("updated_by").references(() => users.id),
});

// Insert schemas — POS Enhancements
export const insertPosPriceOverrideAuditSchema = createInsertSchema(posPriceOverrideAudit).omit({ id: true, created_at: true });
export const insertPosStoreCreditUsageSchema = createInsertSchema(posStoreCreditUsage).omit({ id: true, created_at: true });
export const insertStoreCreditLedgerSchema = createInsertSchema(storeCreditLedger).omit({ id: true, created_at: true });
export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({ id: true });

// Insert schemas — CRM
export const insertCrmCustomerSchema = createInsertSchema(customersMirror).omit({ id: true, created_at: true, updated_at: true });
export const insertCrmOrderSchema = createInsertSchema(customerOrdersMirror).omit({ id: true, created_at: true, updated_at: true });
export const insertCrmSalesRepSchema = createInsertSchema(customerSalesRep).omit({ id: true, assigned_at: true });
export const insertCrmNoteSchema = createInsertSchema(crmCustomerNotes).omit({ id: true, created_at: true, updated_at: true });
export const insertCrmAuditLogSchema = createInsertSchema(crmAuditLog).omit({ id: true, created_at: true });

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

// POS Enhancement types
export type InsertPosPriceOverrideAudit = z.infer<typeof insertPosPriceOverrideAuditSchema>;
export type PosPriceOverrideAudit = typeof posPriceOverrideAudit.$inferSelect;
export type InsertPosStoreCreditUsage = z.infer<typeof insertPosStoreCreditUsageSchema>;
export type PosStoreCreditUsage = typeof posStoreCreditUsage.$inferSelect;

// Store Credit + Email Template types
export type InsertStoreCreditLedger = z.infer<typeof insertStoreCreditLedgerSchema>;
export type StoreCreditLedgerEntry = typeof storeCreditLedger.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type EmailTemplate = typeof emailTemplates.$inferSelect;

// CRM types
export type InsertCrmCustomer = z.infer<typeof insertCrmCustomerSchema>;
export type CrmCustomer = typeof customersMirror.$inferSelect;
export type InsertCrmOrder = z.infer<typeof insertCrmOrderSchema>;
export type CrmOrder = typeof customerOrdersMirror.$inferSelect;
export type InsertCrmSalesRep = z.infer<typeof insertCrmSalesRepSchema>;
export type CrmSalesRep = typeof customerSalesRep.$inferSelect;
export type InsertCrmNote = z.infer<typeof insertCrmNoteSchema>;
export type CrmNote = typeof crmCustomerNotes.$inferSelect;
export type InsertCrmAuditLog = z.infer<typeof insertCrmAuditLogSchema>;
export type CrmAuditLogEntry = typeof crmAuditLog.$inferSelect;

// ─── BigCommerce Order Line Items Mirror ──────────────────────────────────────

export const bcOrderLineItems = pgTable("bc_order_line_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  bigcommerce_order_id: integer("bigcommerce_order_id").notNull(),
  bigcommerce_product_id: integer("bigcommerce_product_id").notNull(),
  variant_id: integer("variant_id"),
  product_name: text("product_name").notNull().default(""),
  sku: text("sku").notNull().default(""),
  variant_label: text("variant_label"),
  quantity: integer("quantity").notNull().default(0),
  base_price: decimal("base_price", { precision: 10, scale: 2 }).notNull().default("0"),
  order_date: timestamp("order_date"),
  customer_name: text("customer_name"),
  customer_email: text("customer_email"),
  bigcommerce_customer_id: integer("bigcommerce_customer_id"),
  created_at: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  // UNIQUE business-key index — enforces no duplicates at write time.
  // Functional expression COALESCE(variant_id, 0) means this index was created
  // directly via raw SQL: CREATE UNIQUE INDEX uq_bc_order_line_items_business_key
  // ON bc_order_line_items (bigcommerce_order_id, bigcommerce_product_id, COALESCE(variant_id, 0))
  // Drizzle does not support functional unique indexes in schema syntax; created manually.
  // Covers date-range WHERE clause on order_date
  orderDateIdx: index("idx_bc_order_line_items_order_date").on(t.order_date),
  // Covers product-level filtering
  productIdx: index("idx_bc_order_line_items_product").on(t.bigcommerce_product_id),
}));

export const insertBcOrderLineItemSchema = createInsertSchema(bcOrderLineItems).omit({ id: true, created_at: true });
export type InsertBcOrderLineItem = z.infer<typeof insertBcOrderLineItemSchema>;
export type BcOrderLineItem = typeof bcOrderLineItems.$inferSelect;

// ─── Report Export Audit Log ──────────────────────────────────────────────────

export const reportExportLogs = pgTable("report_export_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  user_id: integer("user_id"),
  user_name: text("user_name").notNull().default(""),
  report_name: text("report_name").notNull(),
  view_name: text("view_name").notNull().default(""),
  filters: jsonb("filters").notNull().default({}),
  export_type: text("export_type").notNull(), // 'csv' | 'excel'
  row_count: integer("row_count").notNull().default(0),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export const insertReportExportLogSchema = createInsertSchema(reportExportLogs).omit({ id: true, created_at: true });
export type InsertReportExportLog = z.infer<typeof insertReportExportLogSchema>;
export type ReportExportLog = typeof reportExportLogs.$inferSelect;

// RBAC types
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Role = typeof roles.$inferSelect;

export type InsertPermission = z.infer<typeof insertPermissionSchema>;
export type Permission = typeof permissions.$inferSelect;

export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;
export type RolePermission = typeof rolePermissions.$inferSelect;

export type InsertUserPermission = z.infer<typeof insertUserPermissionSchema>;
export type UserPermission = typeof userPermissions.$inferSelect;
