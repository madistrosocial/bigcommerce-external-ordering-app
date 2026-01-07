import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, decimal, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(), // 'admin' or 'agent'
  is_enabled: boolean("is_enabled").notNull().default(true),
  allow_bigcommerce_search: boolean("allow_bigcommerce_search").notNull().default(false),
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
  order_note: text("order_note"), // Agent order notes
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

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertProductSchema = createInsertSchema(products).omit({ id: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, date: true });

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;
