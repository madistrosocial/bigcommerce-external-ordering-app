import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertProductSchema,
  insertOrderSchema,
  type InsertProduct,
  type InsertOrder,
  type InsertPriceHistoryCache,
  type InsertInventoryPushLog,
  type InsertProductLinkLog,
} from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import cron from "node-cron";
import * as FtpClientLib from "basic-ftp";
import SftpClient from "ssh2-sftp-client";
import { Readable } from "stream";

// ─── Default invoice HTML template ───────────────────────────────────────────
const DEFAULT_INVOICE_TEMPLATE = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Invoice {{invoice_number}}</title><style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #222; background: #fff; padding: 28px 36px; max-width: 820px; margin: 0 auto; }
.header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
.company-name { font-size: 20px; font-weight: bold; }
.logo-area img { max-height: 75px; max-width: 180px; object-fit: contain; }
.parties { display: flex; justify-content: space-between; margin-bottom: 24px; gap: 24px; }
.customer-block { font-size: 12px; line-height: 1.8; flex: 1; }
.company-block { text-align: right; font-size: 12px; line-height: 1.8; }
.invoice-center { text-align: center; margin: 24px 0; }
.invoice-center h2 { font-size: 15px; font-weight: bold; letter-spacing: 1px; margin-bottom: 5px; }
.invoice-center .inv-sub { font-size: 12px; margin-top: 3px; }
.invoice-center .inv-date { font-size: 12px; color: #555; margin-top: 2px; }
table.items { width: 100%; border-collapse: collapse; margin: 16px 0 12px; }
table.items th { border-bottom: 2px solid #222; padding: 8px 6px; text-align: left; font-size: 12px; }
table.items th:nth-child(2) { text-align: center; width: 40px; }
table.items th:nth-child(3), table.items th:nth-child(4) { text-align: right; }
table.items td { padding: 9px 6px; border-bottom: 1px solid #efefef; vertical-align: top; font-size: 12px; }
table.items td:nth-child(2) { text-align: center; white-space: nowrap; }
table.items td:nth-child(3), table.items td:nth-child(4) { text-align: right; white-space: nowrap; }
.item-name { font-size: 12px; line-height: 1.5; }
.item-meta { font-size: 10px; color: #888; margin-top: 3px; }
.price-original { display: block; text-decoration: line-through; color: #bbb; font-size: 10px; }
.price-sale { display: block; font-weight: 600; }
.totals-wrap { display: flex; justify-content: flex-end; margin: 8px 0 18px; }
table.totals { width: 275px; border-collapse: collapse; }
table.totals td { padding: 4px 8px; font-size: 12px; }
table.totals td:last-child { text-align: right; }
.grand-total td { font-weight: bold; font-size: 13px; border-top: 2px solid #222; border-bottom: 2px solid #222; padding: 6px 8px; }
.outstanding-row { display: flex; justify-content: space-between; align-items: baseline; padding: 9px 0; border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; margin-bottom: 14px; }
.outstanding-label { font-weight: bold; font-size: 13px; }
.outstanding-amount { font-weight: bold; font-size: 13px; margin-left: 10px; }
.items-count { font-size: 11px; color: #555; }
.notes-section { font-size: 11px; color: #666; margin-bottom: 18px; }
.barcode-section { text-align: center; margin: 22px 0 18px; }
.barcode-number { font-size: 13px; margin-top: 7px; letter-spacing: 2px; }
.barcode-meta { font-size: 11px; color: #666; margin-top: 4px; }
.footer-terms { background: #2a2a2a; color: #ddd; font-size: 10px; padding: 14px 22px; margin: 20px -36px -28px; text-align: center; line-height: 1.7; }
.footer-terms .thank-you { font-size: 14px; font-weight: bold; color: #fff; margin-top: 9px; }
@media print { .no-print { display: none !important; } }
</style></head><body>
<div class="header">
  <div><div class="company-name">{{company_name}}</div></div>
  <div class="logo-area">{{logo_html}}</div>
</div>
<div class="parties">
  <div class="customer-block">
    <strong>Customer: {{customer_name}}</strong><br>
    {{customer_company}}<br>
    {{customer_street}}<br>
    {{customer_city_state}}<br>
    Email : {{customer_email}}<br>
    Phone : {{customer_phone}}
  </div>
  <div class="company-block">{{company_address}}</div>
</div>
<div class="invoice-center">
  <h2>TAX INVOICE/RECEIPT</h2>
  <div class="inv-sub">Invoice# {{invoice_number}}</div>
  <div class="inv-date">{{order_date}}</div>
</div>
<table class="items">
  <thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Line Total</th></tr></thead>
  <tbody>{{items_rows}}</tbody>
</table>
<div class="totals-wrap">
  <table class="totals">
    <tr><td>Subtotal</td><td>{{subtotal}}</td></tr>
    <tr><td>Discount</td><td>{{discount}}</td></tr>
    <tr><td>Tax</td><td>{{tax}}</td></tr>
    <tr class="grand-total"><td>Total</td><td>{{total}}</td></tr>
    <tr><td>Unpaid</td><td>{{unpaid}}</td></tr>
  </table>
</div>
<div class="outstanding-row">
  <div><span class="outstanding-label">Outstanding:</span> <span class="outstanding-amount">{{outstanding}}</span></div>
  <span class="items-count">Total items: {{total_items}}</span>
</div>
{{notes_html}}
<div class="barcode-section">
  {{barcode_svg}}
  <div class="barcode-number">{{invoice_number}}</div>
  <div class="barcode-meta">Served by {{served_by}}</div>
  <div class="barcode-meta">{{timestamp}}</div>
</div>
<div class="footer-terms">
  <p>{{terms}}</p>
  <div class="thank-you">Thank You for Your Business!</div>
</div>
</body></html>`;

// ─── BC pre-flight stock validator ────────────────────────────────────────────
// BigCommerce v2 order creation is NOT atomic: it deducts inventory per line
// item sequentially and, if it hits an out-of-stock variant, it returns 409
// but does NOT roll back the decrements that already happened. For large carts
// (300+ items) this silently corrupts inventory. We fetch fresh stock from BC
// BEFORE submitting and block the order early so nothing is ever deducted.
async function checkBcStock(
  storeHash: string,
  token: string,
  cartItems: any[],
): Promise<string[]> {
  const allBcProductIds = [
    ...new Set(
      cartItems
        .filter((i) => i.bigcommerce_product_id)
        .map((i) => Number(i.bigcommerce_product_id)),
    ),
  ];
  if (allBcProductIds.length === 0) return [];

  // Map productId → { inventory_tracking, inventory_level, variants: Map<variantId, inventory_level> }
  type PInfo = {
    inventory_tracking: string;
    inventory_level: number;
    variants: Map<number, number>;
  };
  const productStockInfo = new Map<number, PInfo>();

  // Batch fetch products+variants from BC v3 (100 products per request)
  for (let ci = 0; ci < allBcProductIds.length; ci += 100) {
    const chunk = allBcProductIds.slice(ci, ci + 100);
    try {
      const pr = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products?id:in=${chunk.join(",")}&include=variants&limit=250`,
        { headers: { "X-Auth-Token": String(token), Accept: "application/json" } },
      );
      if (!pr.ok) continue;
      const pj = await pr.json();
      for (const p of pj.data ?? []) {
        const variantMap = new Map<number, number>();
        for (const v of p.variants ?? []) {
          variantMap.set(v.id, v.inventory_level ?? 0);
        }
        productStockInfo.set(p.id, {
          inventory_tracking: p.inventory_tracking ?? "none",
          inventory_level: p.inventory_level ?? 0,
          variants: variantMap,
        });
      }
    } catch {
      // If we can't reach BC for the stock check, skip validation for this chunk
    }
  }

  const stockErrors: string[] = [];
  for (const item of cartItems) {
    const needed = Number(item.quantity) || 1;
    const bcPid = Number(item.bigcommerce_product_id);
    const bcVid = item.variant_id ? Number(item.variant_id) : null;
    const pInfo = productStockInfo.get(bcPid);
    if (!pInfo || pInfo.inventory_tracking === "none") continue;
    const available =
      pInfo.inventory_tracking === "variant" && bcVid
        ? (pInfo.variants.get(bcVid) ?? 0)
        : pInfo.inventory_level;
    if (available < needed) {
      stockErrors.push(
        `${item.name || item.sku || `Product ${bcPid}`}: need ${needed}, available ${available}`,
      );
    }
  }
  return stockErrors;
}
// ──────────────────────────────────────────────────────────────────────────────

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // ===== AUTH MIDDLEWARE =====

  /**
   * Reads x-user-id from the request header, looks up the user in the DB,
   * and verifies the account is active. Attaches the user to req as (req as any).authUser.
   */
  const requireAuth = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    const userId = req.headers["x-user-id"];
    if (!userId)
      return res.status(401).json({ error: "Authentication required" });

    const user = await storage
      .getUser(parseInt(userId as string))
      .catch(() => null);
    if (!user || !user.is_enabled) {
      return res.status(401).json({ error: "Authentication required" });
    }

    (req as any).authUser = user;
    next();
  };

  /**
   * Extends requireAuth — additionally verifies the caller has role === 'admin'.
   */
  const requireAdmin = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    const userId = req.headers["x-user-id"];
    if (!userId)
      return res.status(401).json({ error: "Authentication required" });

    const user = await storage
      .getUser(parseInt(userId as string))
      .catch(() => null);
    if (!user || !user.is_enabled) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    (req as any).authUser = user;
    next();
  };

  /**
   * Permission-based middleware — allows system admins always, otherwise
   * checks that the authenticated user has the given module:action permission.
   */
  const requirePermission = (module: string, action = "view") =>
    async (req: Request, res: Response, next: NextFunction) => {
      const rawId = req.headers["x-user-id"];
      const rawRole = req.headers["x-user-role"];
      if (!rawId) return res.status(401).json({ error: "Authentication required" });
      const userId = parseInt(rawId as string);
      if (isNaN(userId)) return res.status(401).json({ error: "Authentication required" });
      // Fast-path: trust the role header for admins to skip DB lookup
      if (rawRole === "admin") {
        const user = await storage.getUser(userId).catch(() => null);
        if (!user || !user.is_enabled) return res.status(401).json({ error: "Authentication required" });
        (req as any).authUser = user;
        return next();
      }
      const user = await storage.getUser(userId).catch(() => null);
      if (!user || !user.is_enabled) return res.status(401).json({ error: "Authentication required" });
      if (user.role === "admin") { (req as any).authUser = user; return next(); }
      const perms = await storage.getUserPermissionStrings(user.id);
      if (!perms.includes(`${module}:${action}`)) return res.status(403).json({ error: "Forbidden" });
      (req as any).authUser = user;
      next();
    };

  // ===== PRODUCT ROUTES =====

  // Get all products (for admin view)
  app.get("/api/products", requireAdmin, async (req, res) => {
    try {
      const products = await storage.getAllProducts();
      res.json(products);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get pinned products only (for agent catalog)
  app.get("/api/products/pinned", async (req, res) => {
    try {
      const products = await storage.getPinnedProducts();
      res.json(products);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get pinned products with live data fetched directly from BigCommerce
  app.get("/api/products/pinned/fresh", async (req, res) => {
    try {
      const pinnedProducts = await storage.getPinnedProducts();
      if (pinnedProducts.length === 0) return res.json([]);

      const setting = await storage.getSetting("bigcommerce_config");
      let storeHash = process.env.BC_STORE_HASH;
      let token = process.env.BC_TOKEN;
      if (setting?.value) {
        const config = typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value;
        storeHash = config.storeHash || storeHash;
        token = config.token || token;
      }

      if (!token || !storeHash) {
        // No BC config — fall back to cached DB data
        return res.json(pinnedProducts);
      }

      const bcHeaders = {
        "X-Auth-Token": String(token),
        "Content-Type": "application/json",
        Accept: "application/json",
      };

      // Fetch all products from BC in parallel
      const results = await Promise.all(
        pinnedProducts.map(async (product) => {
          try {
            const bcRes = await fetch(
              `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products/${product.bigcommerce_id}?include=variants`,
              { headers: bcHeaders }
            );
            if (!bcRes.ok) return product; // fall back to DB row on error

            const { data: p } = await bcRes.json();

            const variants =
              p.variants && p.variants.length > 0
                ? p.variants.map((v: any) => ({
                    id: v.id,
                    sku: v.sku,
                    price: v.price?.toString() || p.price?.toString() || product.price,
                    stock_level: v.inventory_level ?? 0,
                    min_purchase_quantity: v.order_quantity_minimum ?? null,
                    max_purchase_quantity: v.order_quantity_maximum ?? null,
                    option_values: (v.option_values || []).map((ov: any) => ({
                      id: ov.id,
                      option_id: ov.option_id,
                      label: ov.label,
                      option_display_name: ov.option_display_name,
                    })),
                  }))
                : product.variants;

            return {
              ...product,
              name: p.name ?? product.name,
              price: p.price?.toString() ?? product.price,
              stock_level: p.inventory_level ?? product.stock_level,
              min_purchase_quantity: p.order_quantity_minimum ?? product.min_purchase_quantity ?? null,
              max_purchase_quantity: p.order_quantity_maximum ?? product.max_purchase_quantity ?? null,
              sku: p.sku ?? product.sku,
              image: p.primary_image?.url_standard ?? product.image,
              description: p.description
                ? p.description.replace(/<[^>]*>?/gm, "")
                : product.description,
              variants,
            };
          } catch {
            return product; // fall back to DB row on any error
          }
        })
      );

      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create/Import product from BigCommerce search
  app.post("/api/products", requireAdmin, async (req, res) => {
    try {
      const productData = insertProductSchema.parse(req.body) as InsertProduct;

      // Check if product already exists by BigCommerce ID
      const existing = await storage.getProductByBigCommerceId(
        productData.bigcommerce_id,
      );

      if (existing) {
        // If exists, just pin it
        await storage.updateProductPin(existing.id, true);
        res.json({ ...existing, is_pinned: true });
      } else {
        // Create new product
        const product = await storage.createProduct(productData);
        res.json(product);
      }
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Toggle product pin status
  app.patch("/api/products/:id/pin", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { is_pinned } = req.body;
      await storage.updateProductPin(id, is_pinned);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Toggle product promotion status
  app.patch("/api/products/:id/promotion", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { is_promotion } = req.body;
      await storage.updateProductPromotion(id, is_promotion);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get promotion products (DB cache)
  app.get("/api/products/promotions", async (req, res) => {
    try {
      const prods = await storage.getPromotionProducts();
      res.json(prods);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get promotion products with live BC data (legacy - kept for compatibility)
  app.get("/api/products/promotions/fresh", async (req, res) => {
    res.json([]);
  });

  // Fetch all products from the BC "Promotions" category (/promotions slug) live
  app.get("/api/products/sale-category", async (req, res) => {
    try {
      const setting = await storage.getSetting("bigcommerce_config");
      let storeHash = process.env.BC_STORE_HASH;
      let token = process.env.BC_TOKEN;
      if (setting?.value) {
        const config = typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value;
        storeHash = config.storeHash || storeHash;
        token = config.token || token;
      }

      if (!token || !storeHash) {
        return res.status(400).json({ error: "BigCommerce credentials not configured" });
      }

      const bcHeaders = {
        "X-Auth-Token": String(token),
        "Content-Type": "application/json",
        Accept: "application/json",
      };

      // Step 1: Find category by URL path "/promotions"
      const catRes = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/trees/categories?url_path=%2Fpromotions`,
        { headers: bcHeaders }
      );

      let categoryId: number | null = null;

      if (catRes.ok) {
        const catData = await catRes.json();
        const cats = catData.data ?? [];
        if (cats.length > 0) categoryId = cats[0].category_id ?? cats[0].id ?? null;
      }

      // Fallback: search via v2 categories API
      if (!categoryId) {
        const v2Res = await fetch(
          `https://api.bigcommerce.com/stores/${storeHash}/v2/categories?url_path=%2Fpromotions&limit=10`,
          { headers: bcHeaders }
        );
        if (v2Res.ok) {
          const v2Cats = await v2Res.json();
          if (Array.isArray(v2Cats) && v2Cats.length > 0) {
            categoryId = v2Cats[0].id;
          }
        }
      }

      // Fallback: search by name "Promotions"
      if (!categoryId) {
        const nameRes = await fetch(
          `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/categories?name=Promotions&limit=10`,
          { headers: bcHeaders }
        );
        if (nameRes.ok) {
          const nameData = await nameRes.json();
          const cats = nameData.data ?? [];
          if (cats.length > 0) categoryId = cats[0].id;
        }
      }

      if (!categoryId) {
        return res.status(404).json({ error: "Promotions category not found in BigCommerce. Make sure a category named 'Promotions' exists." });
      }

      // Step 2: Fetch all products in that category with variants
      let page = 1;
      const allProducts: any[] = [];
      while (true) {
        const prodRes = await fetch(
          `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products?categories:in=${categoryId}&include=variants,images&limit=50&page=${page}&is_visible=true`,
          { headers: bcHeaders }
        );
        if (!prodRes.ok) break;
        const prodData = await prodRes.json();
        const items = prodData.data ?? [];
        allProducts.push(...items);
        if (items.length < 50 || !prodData.meta?.pagination?.total_pages || page >= prodData.meta.pagination.total_pages) break;
        page++;
      }

      // Step 3: Shape into our Product format
      const shaped = allProducts.map((p: any) => {
        const primaryImage = (p.images ?? []).find((img: any) => img.is_thumbnail) ?? (p.images ?? [])[0];
        const variants = (p.variants ?? []).map((v: any) => ({
          id: v.id,
          sku: v.sku,
          price: v.price?.toString() || p.price?.toString() || "0",
          stock_level: v.inventory_level ?? 0,
          option_values: (v.option_values ?? []).map((ov: any) => ({
            id: ov.id,
            option_id: ov.option_id,
            label: ov.label,
            option_display_name: ov.option_display_name,
          })),
        }));
        return {
          id: p.id,
          bigcommerce_id: p.id,
          name: p.name,
          sku: p.sku,
          price: p.price?.toString() ?? "0",
          image: primaryImage?.url_standard ?? "",
          description: p.description ? p.description.replace(/<[^>]*>?/gm, "") : "",
          stock_level: p.inventory_level ?? 0,
          is_pinned: false,
          is_promotion: false,
          variants,
        };
      });

      res.json(shaped);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Re-sync all pinned products from BigCommerce
  app.post("/api/products/resync", requireAdmin, async (req, res) => {
    try {
      const pinnedProducts = await storage.getPinnedProducts();

      if (pinnedProducts.length === 0) {
        return res.json({
          message: "No pinned products to re-sync",
          updated: 0,
        });
      }

      const setting = await storage.getSetting("bigcommerce_config");
      let storeHash = process.env.BC_STORE_HASH;
      let token = process.env.BC_TOKEN;

      if (setting && setting.value) {
        const config =
          typeof setting.value === "string"
            ? JSON.parse(setting.value)
            : setting.value;
        storeHash = config.storeHash || storeHash;
        token = config.token || token;
      }

      if (!token || !storeHash) {
        return res
          .status(400)
          .json({ error: "BigCommerce credentials not configured" });
      }

      let updated = 0;
      let errors = 0;

      // Re-fetch each product from BigCommerce
      for (const product of pinnedProducts) {
        try {
          const response = await fetch(
            `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products/${product.bigcommerce_id}?include=variants`,
            {
              headers: {
                "X-Auth-Token": String(token),
                "Content-Type": "application/json",
                Accept: "application/json",
              },
            },
          );

          if (!response.ok) {
            console.error(
              `Failed to fetch product ${product.bigcommerce_id}:`,
              response.status,
              response.statusText,
            );
            errors++;
            continue;
          }

          const { data: p } = await response.json();

          // Transform variant data with full option_values
          // Always preserve at least one variant (base variant if no variants returned)
          const variants =
            p.variants && p.variants.length > 0
              ? p.variants.map((v: any) => ({
                  id: v.id,
                  sku: v.sku,
                  price:
                    v.price?.toString() || p.price?.toString() || product.price,
                  stock_level: v.inventory_level || 0,
                  option_values: (v.option_values || []).map((ov: any) => ({
                    id: ov.id,
                    option_id: ov.option_id,
                    label: ov.label,
                    option_display_name: ov.option_display_name,
                  })),
                }))
              : product.variants; // Keep existing variants if none returned

          // Update the product with fresh variant data
          await storage.updateProductByBigCommerceId(product.bigcommerce_id, {
            variants,
            price: p.price?.toString() || product.price,
            stock_level: p.inventory_level || 0,
            name: p.name || product.name,
            sku: p.sku || product.sku,
            image: p.primary_image?.url_standard || product.image,
            description: p.description
              ? p.description.replace(/<[^>]*>?/gm, "")
              : product.description,
          });

          updated++;
        } catch (err) {
          console.error(
            `Failed to re-sync product ${product.bigcommerce_id}:`,
            err,
          );
          errors++;
        }
      }

      if (errors > 0 && updated === 0) {
        return res.status(502).json({
          error: `Failed to re-sync all ${pinnedProducts.length} products. Check server logs for details.`,
          updated: 0,
          errors,
        });
      }

      res.json({
        message:
          errors > 0
            ? `Re-synced ${updated} products (${errors} failed)`
            : `Re-synced ${updated} products successfully`,
        updated,
        errors,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== USER ROUTES =====

  // Get all agents (for admin user management)
  app.get("/api/users/agents", requireAdmin, async (req, res) => {
    try {
      const agents = await storage.getAllAgents();
      const safeAgents = agents.map(({ password, ...user }) => user);
      res.json(safeAgents);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all admins
  app.get("/api/users/admins", requireAdmin, async (req, res) => {
    try {
      const admins = await storage.getAllAdmins();
      const safeAdmins = admins.map(({ password, ...user }) => user);
      res.json(safeAdmins);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all users
  app.get("/api/users", requireAdmin, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const safeUsers = allUsers.map(({ password, ...user }) => user);
      res.json(safeUsers);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create user (admin only)
  app.post("/api/users", requireAdmin, async (req, res) => {
    try {
      const { username, password, name, role } = req.body;

      // Validate role
      const validRoles = ["admin", "agent"];
      const normalizedRole = (role || "agent").toLowerCase();
      if (!validRoles.includes(normalizedRole)) {
        return res.status(400).json({
          error: `Invalid role. Must be one of: ${validRoles.join(", ")}`,
        });
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({
        username,
        password: hashedPassword,
        name,
        role: normalizedRole,
        is_enabled: true,
      });

      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update all user details (name, username, password, role, is_enabled, allow_bigcommerce_search)
  app.put("/api/users/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, username, password, role, is_enabled, allow_bigcommerce_search } = req.body;
      const update: Record<string, any> = {};
      if (name !== undefined) update.name = name;
      if (username !== undefined) update.username = username;
      if (role !== undefined) update.role = role;
      if (is_enabled !== undefined) update.is_enabled = is_enabled;
      if (allow_bigcommerce_search !== undefined) update.allow_bigcommerce_search = allow_bigcommerce_search;
      if (password && password.trim()) {
        const bcrypt = await import("bcryptjs");
        update.password = await bcrypt.hash(password, 10);
      }
      const updated = await storage.updateUserDetails(id, update);
      res.json(updated);
    } catch (error: any) {
      if (error.code === "23505") {
        res.status(409).json({ error: "Username already taken." });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  });

  // Update user enabled status
  app.patch("/api/users/:id/status", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { is_enabled } = req.body;

      await storage.updateUserStatus(id, is_enabled);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update user BigCommerce search permission
  app.patch("/api/users/:id/permission", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { allow_bigcommerce_search } = req.body;

      await storage.updateUserPermission(id, allow_bigcommerce_search);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Login endpoint
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;

      const user = await storage.getUserByUsername(username);

      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Check if user is enabled
      if (!user.is_enabled) {
        return res.status(403).json({ error: "Account is disabled" });
      }

      // Verify password
      const isValid = await bcrypt.compare(password, user.password);

      if (!isValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Don't send password to frontend
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== ORDER ROUTES =====

  // Create order with immediate sync attempt
  app.post("/api/orders", requireAuth, async (req, res) => {
    try {
      // Parse and create order with status 'pending_sync'
      const orderData = insertOrderSchema.parse(req.body) as InsertOrder;

      // Validate billing address is provided for BigCommerce orders
      if (!orderData.billing_address || !orderData.billing_address.street_1) {
        return res
          .status(400)
          .json({ error: "Billing address is required for order creation" });
      }

      orderData.status = "pending_sync";
      const order = await storage.createOrder(orderData);

      // Get settings
      const bcSetting = await storage.getSetting("bigcommerce_config");
      const webhookSetting = await storage.getSetting("google_sheets_webhook");

      let bcSuccess = false;
      let bcOrderId: number | undefined;
      let bcError = "";
      let sheetsSuccess = false;
      let sheetsError = "";

      // Try to sync to BigCommerce
      if (bcSetting && bcSetting.value) {
        const config =
          typeof bcSetting.value === "string"
            ? JSON.parse(bcSetting.value)
            : bcSetting.value;
        const storeHash = config.storeHash;
        const token = config.token;

        if (storeHash && token) {
          try {
            const nameParts = order.customer_name.trim().split(/\s+/);
            const firstName = nameParts[0] || "Customer";
            const lastName = nameParts.slice(1).join(" ") || "Customer";

            const cartDiscountAmt = parseFloat((req.body as any).cart_discount_amount ?? "0") || 0;
            const bcOrderData: any = {
              status_id: 1,
              customer_id: order.bigcommerce_customer_id || 0,
              billing_address: order.billing_address,
              staff_notes: order.order_note || undefined,
              customer_message: (order as any).customer_note || undefined,
              products: (order.items as any[]).map((item) => {
                const productData: any = {
                  product_id: item.bigcommerce_product_id,
                  quantity: item.quantity,
                  price_inc_tax: parseFloat(item.price_at_sale),
                  price_ex_tax: parseFloat(item.price_at_sale),
                };
                if (
                  item.variant_option_values &&
                  Array.isArray(item.variant_option_values) &&
                  item.variant_option_values.length > 0
                ) {
                  productData.product_options = item.variant_option_values.map(
                    (ov: any) => ({
                      id: ov.option_id,
                      value: String(ov.id),
                    }),
                  );
                }
                return productData;
              }),
            };
            if (cartDiscountAmt > 0) {
              bcOrderData.discount_amount = cartDiscountAmt.toFixed(4);
            }

            // ── Pre-flight stock check (prevents BC partial inventory deduction) ──
            const stockErrors = await checkBcStock(
              storeHash,
              token,
              order.items as any[],
            );

            if (stockErrors.length > 0) {
              const preview = stockErrors.slice(0, 5).join("; ");
              const suffix =
                stockErrors.length > 5
                  ? ` …and ${stockErrors.length - 5} more`
                  : "";
              bcError = `[{"status":409,"message":"Quantities of one or more products are out of stock or did not meet quantity requirements.","details":{"errors":[{"type":"OutOfStock","message":"Pre-validation: ${stockErrors.length} item(s) with insufficient stock: ${preview}${suffix}"}]}}]`;
              await storage.updateOrderSyncError(order.id!, bcError);
            } else {
              const response = await fetch(
                `https://api.bigcommerce.com/stores/${storeHash}/v2/orders`,
                {
                  method: "POST",
                  headers: {
                    "X-Auth-Token": String(token),
                    "Content-Type": "application/json",
                    Accept: "application/json",
                  },
                  body: JSON.stringify(bcOrderData),
                },
              );

              if (response.ok) {
                const data = await response.json();
                bcOrderId = data.id;
                bcSuccess = true;
                await storage.updateOrderStatus(order.id!, "synced", bcOrderId);
              } else {
                const errorText = await response.text();
                bcError = `BigCommerce sync failed: ${errorText}`;
                await storage.updateOrderSyncError(order.id!, bcError);
              }
            }
          } catch (e: any) {
            bcError = `BigCommerce sync error: ${e.message}`;
            await storage.updateOrderSyncError(order.id!, bcError);
          }
        }
      }

      // Log to Google Sheets webhook
      if (webhookSetting && webhookSetting.value) {
        try {
          const webhookUrl =
            typeof webhookSetting.value === "string"
              ? webhookSetting.value
              : null;
          if (webhookUrl) {
            const sheetsData = {
              order_id: order.id,
              customer_name: order.customer_name,
              total: order.total,
              date: order.date,
              bigcommerce_order_id: bcOrderId || null,
              bigcommerce_synced: bcSuccess,
              items: order.items,
            };

            const sheetsResponse = await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(sheetsData),
            });

            sheetsSuccess = sheetsResponse.ok;
            if (!sheetsSuccess) {
              sheetsError = `Google Sheets logging failed: ${sheetsResponse.statusText}`;
            }
          }
        } catch (e: any) {
          sheetsError = `Google Sheets logging error: ${e.message}`;
        }
      }

      // Return comprehensive status
      const updatedOrder = await storage.getOrder(order.id!);
      res.json({
        order: updatedOrder,
        bigcommerce: {
          success: bcSuccess,
          order_id: bcOrderId,
          error: bcError || undefined,
        },
        google_sheets: {
          success: sheetsSuccess,
          error: sheetsError || undefined,
        },
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get orders by user
  app.get("/api/orders/user/:userId", requireAuth, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const orders = await storage.getOrdersByUser(userId);
      res.json(orders);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/orders/pending", requireAuth, async (req, res) => {
    try {
      const orders = await storage.getPendingSyncOrders();
      res.json(orders);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/orders/drafts", requireAuth, async (req, res) => {
    try {
      const drafts = await storage.getDraftOrders();
      res.json(drafts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete order (draft only)
  app.delete("/api/orders/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const order = await storage.getOrder(id);
      if (!order) return res.status(404).json({ error: "Order not found" });
      await storage.deleteOrder(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Price history: recent prices a BC customer paid for a specific product/variant
  app.get(
    "/api/orders/customer/:bcCustomerId/price-history",
    requireAuth,
    async (req, res) => {
      try {
        const bcCustomerId = parseInt(req.params.bcCustomerId);
        const bcProductId = req.query.bcProductId
          ? parseInt(req.query.bcProductId as string)
          : null;
        const variantId = req.query.variantId
          ? parseInt(req.query.variantId as string)
          : null;

        console.log("PRICE HISTORY REQUEST:", { customerId: bcCustomerId, productId: bcProductId, variantId });

        // BC scans newest → cutoff date, stops at BC_FETCH_GOAL fresh results.
        // • BC finds ≥5  → display those 5 only (BC-only mode).
        // • BC finds <5  → supplement from local DB / app DB up to DISPLAY_LIMIT_SUPP (10).
        // BC results are ALWAYS saved to Postgres cache regardless of display outcome.
        const BC_FETCH_GOAL = 5;
        const DISPLAY_LIMIT_BC   = 5;   // shown when BC goal is met
        const DISPLAY_LIMIT_SUPP = 10;  // shown when supplementing from DB

        // BC results accumulate here; supplemental entries added below if needed.
        const history: { price: string; date: string; orderId?: number }[] = [];

        // ── Layer 1: Postgres price_history_cache — loaded for dedup + supplement ─
        // NO date restriction — holds all imported/synced history regardless of age.
        // bc_scan_cutoff_date NEVER applies here.
        let cachedEntries: { price: string; order_date: string | null; order_id: number }[] = [];
        const seenOrderIds = new Set<number>();
        if (bcProductId) {
          const raw = await storage.getCachedPriceHistory(bcCustomerId, bcProductId);
          raw.sort(
            (a, b) =>
              new Date(b.order_date || 0).getTime() -
              new Date(a.order_date || 0).getTime(),
          );
          cachedEntries = raw;
          for (const e of raw) seenOrderIds.add(e.order_id);
        }

        // ── Layer 2: BigCommerce scan — cutoff date applies HERE ONLY ─────────────
        // Scans orders newest-first and stops when it hits the cutoff date.
        // bc_scan_cutoff_date restricts BC API calls only — not Postgres or app orders.
        let newBcEntries = 0;
        {
          const [bcCfg, cutoffSetting] = await Promise.all([
            storage.getSetting("bigcommerce_config"),
            storage.getSetting("bc_scan_cutoff_date"),
          ]);
          // Cutoff is ONLY for BC API — skip orders that predate it (already in DB)
          const cutoffDate: Date | null = cutoffSetting?.value
            ? new Date(cutoffSetting.value)
            : null;
          if (cutoffDate) cutoffDate.setUTCHours(0, 0, 0, 0);
          let cfg: any = {};
          try {
            if (bcCfg?.value) {
              cfg = typeof bcCfg.value === "string" ? JSON.parse(bcCfg.value) : bcCfg.value;
            }
          } catch {
            console.error("Invalid BigCommerce config: could not parse stored value");
          }
          if (!cfg?.storeHash || !cfg?.token) {
            console.error("Missing or invalid BigCommerce config: storeHash or token not found");
          }
          const storeHash = cfg.storeHash;
          const token = cfg.token;
          if (storeHash && token) {
            const newCacheEntries: InsertPriceHistoryCache[] = [];
            const seenCacheKeys = new Set<string>();
            try {
              const bcHeaders = {
                "X-Auth-Token": String(token),
                "Content-Type": "application/json",
                Accept: "application/json",
              };
              const PAGE_SIZE = 25;
              let page = 1;
              let morePages = true;
              while (morePages && newBcEntries < BC_FETCH_GOAL) {
                const ordersRes = await fetch(
                  `https://api.bigcommerce.com/stores/${storeHash}/v2/orders?customer_id=${bcCustomerId}&sort=date_created:desc&limit=${PAGE_SIZE}&page=${page}`,
                  { headers: bcHeaders },
                );
                if (!ordersRes.ok) {
                  const text = await ordersRes.text().catch(() => "");
                  console.error("BC API ERROR (orders):", ordersRes.status, text);
                  break;
                }
                const bcOrders: any[] = await ordersRes.json();
                if (!Array.isArray(bcOrders) || bcOrders.length === 0) break;
                if (bcOrders.length < PAGE_SIZE) morePages = false;
                for (const bcOrder of bcOrders) {
                  if (newBcEntries >= BC_FETCH_GOAL) break;
                  // Stop at cutoff — all subsequent orders will also be older
                  if (cutoffDate && bcOrder.date_created) {
                    if (new Date(bcOrder.date_created) < cutoffDate) {
                      morePages = false;
                      break;
                    }
                  }
                  if (seenOrderIds.has(bcOrder.id)) continue;
                  seenOrderIds.add(bcOrder.id);
                  try {
                    const itemsRes = await fetch(
                      `https://api.bigcommerce.com/stores/${storeHash}/v2/orders/${bcOrder.id}/products?limit=250`,
                      { headers: bcHeaders },
                    );
                    if (!itemsRes.ok) continue;
                    const bcItems: any[] = await itemsRes.json();
                    let exactTargetItem: any | null = null;
                    let fallbackTargetItem: any | null = null;
                    for (const item of bcItems) {
                      const itemProductId: number = item.product_id;
                      const itemVariantId: number = item.variant_id || 0;
                      const price = String(item.price_ex_tax ?? item.base_price ?? 0);
                      if (bcProductId && itemProductId === bcProductId) {
                        const isExact = variantId ? itemVariantId === variantId : true;
                        if (isExact && !exactTargetItem) exactTargetItem = item;
                        else if (!isExact && variantId && !fallbackTargetItem) fallbackTargetItem = item;
                      }
                      // Cache ALL products in the order — deduplicate by (product_id, order_id)
                      const cacheKey = `${itemProductId}-${bcOrder.id}`;
                      if (!seenCacheKeys.has(cacheKey)) {
                        seenCacheKeys.add(cacheKey);
                        newCacheEntries.push({
                          customer_id: bcCustomerId,
                          product_id: itemProductId,
                          variant_id: itemVariantId || null,
                          price,
                          order_id: bcOrder.id,
                          order_date: bcOrder.date_created || null,
                          sku: item.sku || item.variant_sku || null,
                        });
                      }
                    }
                    const resultItem = exactTargetItem ?? fallbackTargetItem;
                    if (resultItem) {
                      history.push({
                        price: String(resultItem.price_ex_tax ?? resultItem.base_price ?? 0),
                        date: bcOrder.date_created || "",
                        orderId: bcOrder.id,
                      });
                      newBcEntries++;
                    }
                  } catch (err) {
                    console.error("BC FETCH FAILED (items):", err);
                  }
                }
                page++;
              }
            } catch (err) {
              console.error("BC FETCH FAILED (orders loop):", err);
            }
            // Always save newly found BC prices to Postgres cache (non-blocking)
            if (newCacheEntries.length > 0) {
              storage.savePriceHistoryCacheEntries(newCacheEntries).catch(() => {});
            }
          }
        }

        // ── BC goal met → return only BC results (5), skip supplementing ──────────
        if (newBcEntries >= BC_FETCH_GOAL) {
          history.sort(
            (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime(),
          );
          return res.json(history.slice(0, DISPLAY_LIMIT_BC));
        }

        // ── BC found <5 → supplement from Postgres cache (NO date restriction) ────
        const historySeen = new Set<number>(
          history.map((h) => h.orderId).filter((id): id is number => id != null),
        );
        for (const e of cachedEntries) {
          if (history.length >= DISPLAY_LIMIT_SUPP) break;
          if (historySeen.has(e.order_id)) continue;
          historySeen.add(e.order_id);
          history.push({ price: e.price, date: e.order_date || "", orderId: e.order_id });
        }

        // ── Layer 3: App synced orders (NO date restriction) ─────────────────────
        // Fills remaining slots from orders created via this app.
        // bc_scan_cutoff_date does NOT apply here.
        if (history.length < DISPLAY_LIMIT_SUPP) {
          const appOrders = await storage.getOrdersByBcCustomerId(bcCustomerId, ["synced"]);
          for (const o of appOrders) {
            if (history.length >= DISPLAY_LIMIT_SUPP) break;
            const items = Array.isArray(o.items) ? o.items : [];
            let matched = false;
            for (const item of items as any[]) {
              const productMatch = bcProductId ? item.bigcommerce_product_id === bcProductId : true;
              const variantMatch = variantId ? item.variant_id === variantId : true;
              if (productMatch && variantMatch) {
                history.push({
                  price: item.price_at_sale,
                  date: o.date ? String(o.date) : "",
                  orderId: o.bigcommerce_order_id ?? o.id,
                });
                matched = true;
                break;
              }
            }
            if (!matched && variantId && bcProductId) {
              for (const item of items as any[]) {
                if (item.bigcommerce_product_id === bcProductId) {
                  history.push({
                    price: item.price_at_sale,
                    date: o.date ? String(o.date) : "",
                    orderId: o.bigcommerce_order_id ?? o.id,
                  });
                  break;
                }
              }
            }
          }
        }

        history.sort(
          (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime(),
        );
        // Deduplicate by orderId
        const seenIds = new Set<number | undefined>();
        const deduped = history.filter((h) => {
          if (h.orderId == null) return true;
          if (seenIds.has(h.orderId)) return false;
          seenIds.add(h.orderId);
          return true;
        });
        res.json(deduped.slice(0, DISPLAY_LIMIT_SUPP));
      } catch (error: any) {
        console.error("PRICE HISTORY ERROR:", error);
        res.status(500).json({
          error: error.message,
          stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
        });
      }
    },
  );

  // ── Price history sync endpoint (for client-side IndexedDB cache) ──────────
  app.get("/api/price-history/sync", requireAuth, async (req, res) => {
    try {
      const afterMs = req.query.after
        ? parseInt(req.query.after as string)
        : null;
      const limit = Math.min(
        parseInt((req.query.limit as string) || "10000"),
        10000,
      );
      console.log("SYNC REQUEST:", { afterMs, limit });
      const records = await storage.getPriceHistoryForSync(afterMs, limit);
      console.log("SYNC RESULT COUNT:", records.length);
      res.json(records);
    } catch (error: any) {
      console.error("SYNC ERROR:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ── BigCommerce Price List Records ─────────────────────────────────────────
  app.get(
    "/api/bigcommerce/price-list/:priceListId/records",
    requireAuth,
    async (req, res) => {
      try {
        const priceListId = parseInt(req.params.priceListId);
        const variantIdsStr = req.query.variantIds as string;
        if (!variantIdsStr) {
          console.warn(
            "Missing variantIds in price list request for priceListId:",
            priceListId,
          );
          return res.json({});
        }
        const variantIds = variantIdsStr
          .split(",")
          .map(Number)
          .filter((n) => !isNaN(n) && n > 0);
        if (variantIds.length === 0) return res.json({});

        const bcCfg = await storage.getSetting("bigcommerce_config");
        if (!bcCfg?.value) return res.json({});
        const cfg =
          typeof bcCfg.value === "string"
            ? JSON.parse(bcCfg.value)
            : bcCfg.value;
        if (!cfg.storeHash || !cfg.token) return res.json({});

        const params = new URLSearchParams();
        params.set("variant_id:in", variantIds.join(","));
        params.set("limit", "50");

        const bcRes = await fetch(
          `https://api.bigcommerce.com/stores/${cfg.storeHash}/v3/pricelists/${priceListId}/records?${params}`,
          {
            headers: {
              "X-Auth-Token": String(cfg.token),
              Accept: "application/json",
            },
          },
        );
        if (!bcRes.ok) return res.json({});

        const data = await bcRes.json();
        const result: Record<number, string> = {};
        for (const record of data.data ?? []) {
          if (!record.variant_id) continue;
          const price = record.calculated_price ?? record.price ?? null;
          if (price != null) {
            result[record.variant_id] = String(price);
          }
        }
        res.json(result);
      } catch {
        res.json({});
      }
    },
  );

  // Create draft order (for offline mode)
  app.post("/api/orders/draft", requireAuth, async (req, res) => {
    try {
      const orderData = insertOrderSchema.parse(req.body) as InsertOrder;
      orderData.status = "draft";
      const order = await storage.createOrder(orderData);
      res.json(order);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Submit draft order (when back online)
  app.post("/api/orders/:id/submit-draft", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { bigcommerce_customer_id, billing_address } = req.body;

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      if (order.status !== "draft") {
        return res.status(400).json({ error: "Order is not a draft" });
      }

      // Update order with customer data
      await storage.updateOrderForSubmission(id, {
        bigcommerce_customer_id,
        billing_address,
        status: "pending_sync",
      });

      // Get updated order
      const updatedOrder = await storage.getOrder(id);

      // Get settings
      const bcSetting = await storage.getSetting("bigcommerce_config");
      const webhookSetting = await storage.getSetting("google_sheets_webhook");

      let bcSuccess = false;
      let bcOrderId: number | undefined;
      let bcError = "";
      let sheetsSuccess = false;
      let sheetsError = "";

      // Try to sync to BigCommerce
      if (bcSetting && bcSetting.value) {
        const config =
          typeof bcSetting.value === "string"
            ? JSON.parse(bcSetting.value)
            : bcSetting.value;
        const storeHash = config.storeHash;
        const token = config.token;

        if (storeHash && token) {
          try {
            const bcOrderData = {
              status_id: 1,
              customer_id: bigcommerce_customer_id || 0,
              billing_address: billing_address,
              staff_notes: updatedOrder!.order_note || undefined,
              customer_message: (updatedOrder as any)?.customer_note || undefined,
              products: (updatedOrder!.items as any[]).map((item) => {
                const productData: any = {
                  product_id: item.bigcommerce_product_id,
                  quantity: item.quantity,
                  price_inc_tax: parseFloat(item.price_at_sale),
                  price_ex_tax: parseFloat(item.price_at_sale),
                };
                if (
                  item.variant_option_values &&
                  Array.isArray(item.variant_option_values) &&
                  item.variant_option_values.length > 0
                ) {
                  productData.product_options = item.variant_option_values.map(
                    (ov: any) => ({
                      id: ov.option_id,
                      value: String(ov.id),
                    }),
                  );
                }
                return productData;
              }),
            };

            // ── Pre-flight stock check (prevents BC partial inventory deduction) ──
            const stockErrors = await checkBcStock(
              storeHash,
              token,
              updatedOrder!.items as any[],
            );

            if (stockErrors.length > 0) {
              const preview = stockErrors.slice(0, 5).join("; ");
              const suffix =
                stockErrors.length > 5
                  ? ` …and ${stockErrors.length - 5} more`
                  : "";
              bcError = `[{"status":409,"message":"Quantities of one or more products are out of stock or did not meet quantity requirements.","details":{"errors":[{"type":"OutOfStock","message":"Pre-validation: ${stockErrors.length} item(s) with insufficient stock: ${preview}${suffix}"}]}}]`;
              await storage.updateOrderSyncError(id, bcError);
            } else {
              const response = await fetch(
                `https://api.bigcommerce.com/stores/${storeHash}/v2/orders`,
                {
                  method: "POST",
                  headers: {
                    "X-Auth-Token": String(token),
                    "Content-Type": "application/json",
                    Accept: "application/json",
                  },
                  body: JSON.stringify(bcOrderData),
                },
              );

              if (response.ok) {
                const data = await response.json();
                bcOrderId = data.id;
                bcSuccess = true;
                await storage.updateOrderStatus(id, "synced", bcOrderId);
              } else {
                const errorText = await response.text();
                bcError = `BigCommerce sync failed: ${errorText}`;
                await storage.updateOrderSyncError(id, bcError);
              }
            }
          } catch (e: any) {
            bcError = `BigCommerce sync error: ${e.message}`;
            await storage.updateOrderSyncError(id, bcError);
          }
        }
      }

      // Log to Google Sheets webhook
      if (webhookSetting && webhookSetting.value && bcSuccess) {
        try {
          const webhookUrl =
            typeof webhookSetting.value === "string"
              ? webhookSetting.value
              : null;
          if (webhookUrl) {
            const sheetsData = {
              order_id: id,
              customer_name: updatedOrder!.customer_name,
              total: updatedOrder!.total,
              date: updatedOrder!.date,
              bigcommerce_order_id: bcOrderId || null,
              bigcommerce_synced: bcSuccess,
              items: updatedOrder!.items,
            };

            const sheetsResponse = await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(sheetsData),
            });

            sheetsSuccess = sheetsResponse.ok;
            if (!sheetsSuccess) {
              sheetsError = `Google Sheets logging failed: ${sheetsResponse.statusText}`;
            }
          }
        } catch (e: any) {
          sheetsError = `Google Sheets logging error: ${e.message}`;
        }
      }

      // Return comprehensive status
      const finalOrder = await storage.getOrder(id);
      res.json({
        order: finalOrder,
        bigcommerce: {
          success: bcSuccess,
          order_id: bcOrderId,
          error: bcError || undefined,
        },
        google_sheets: {
          success: sheetsSuccess,
          error: sheetsError || undefined,
        },
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Sync order to BigCommerce
  app.post("/api/orders/:id/sync", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const order = await storage.getOrder(id);

      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Get BigCommerce credentials from DB
      const setting = await storage.getSetting("bigcommerce_config");
      let storeHash = process.env.BC_STORE_HASH;
      let token = process.env.BC_TOKEN;

      if (setting && setting.value) {
        const config =
          typeof setting.value === "string"
            ? JSON.parse(setting.value)
            : setting.value;
        storeHash = config.storeHash || storeHash;
        token = config.token || token;
      }

      if (!storeHash || !token) {
        return res
          .status(400)
          .json({ error: "BigCommerce credentials not configured" });
      }

      // Split customer name into first and last name
      const nameParts = order.customer_name.trim().split(/\s+/);
      const firstName = nameParts[0] || "Customer";
      const lastName = nameParts.slice(1).join(" ") || "Customer";

      // Prepare BigCommerce order data using v2 API format
      const bcOrderData = {
        status_id: 1, // Pending
        customer_id: 0, // Guest checkout
        billing_address: {
          first_name: firstName,
          last_name: lastName,
          street_1: "123 Main St",
          city: "Austin",
          state: "Texas",
          zip: "78701",
          country: "United States",
          country_iso2: "US",
          email: "customer@example.com",
        },
        products: (order.items as any[]).map((item) => {
          const productData: any = {
            product_id: item.bigcommerce_product_id,
            quantity: item.quantity,
            price_inc_tax: parseFloat(item.price_at_sale),
            price_ex_tax: parseFloat(item.price_at_sale),
          };

          // Include product_options if variant has option_values
          // Note: We need to fetch the variant details to get option_values
          // For now, if item has variant info with option_values, map them
          if (
            item.variant_option_values &&
            Array.isArray(item.variant_option_values) &&
            item.variant_option_values.length > 0
          ) {
            productData.product_options = item.variant_option_values.map(
              (ov: any) => ({
                id: ov.option_id,
                value: String(ov.id),
              }),
            );
          }

          return productData;
        }),
      };

      //console.log(
      //  "Creating BigCommerce order:",
      //  JSON.stringify(bcOrderData, null, 2),
      //);

      // Use v2 Orders API for creation
      const response = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v2/orders`,
        {
          method: "POST",
          headers: {
            "X-Auth-Token": String(token),
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(bcOrderData),
        },
      );

      const responseText = await response.text();
      //console.log("BigCommerce API response:", response.status, responseText);

      if (response.ok) {
        const data = JSON.parse(responseText);
        const bcOrderId = data.id;
        //console.log("✅ BigCommerce order created successfully:", bcOrderId);
        await storage.updateOrderStatus(id, "synced", bcOrderId);
        return res.json({ success: true, bigcommerce_order_id: bcOrderId });
      } else {
        // Parse error response
        let errorMessage = `BigCommerce API error: ${response.status}`;
        try {
          const errorData = JSON.parse(responseText);
          errorMessage =
            errorData.title || errorData.message || JSON.stringify(errorData);
        } catch (e) {
          errorMessage = responseText || errorMessage;
        }

        console.error("❌ BigCommerce order creation failed:", errorMessage);
        return res.status(response.status).json({
          error: errorMessage,
          details: responseText,
        });
      }
    } catch (error: any) {
      console.error("❌ Order sync error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===== BIGCOMMERCE PROXY =====

  // Agent-facing BigCommerce product search (requires permission)
  app.get("/api/agent/bigcommerce/search", async (req, res) => {
    try {
      const { query, userId } = req.query;

      if (!userId) {
        return res.status(401).json({ error: "User ID required" });
      }

      const user = await storage.getUser(parseInt(userId as string));
      if (!user || !user.allow_bigcommerce_search) {
        return res
          .status(403)
          .json({ error: "BigCommerce search not permitted for this user" });
      }

      const setting = await storage.getSetting("bigcommerce_config");
      let storeHash = process.env.BC_STORE_HASH;
      let token = process.env.BC_TOKEN;
      if (setting && setting.value) {
        const config =
          typeof setting.value === "string"
            ? JSON.parse(setting.value)
            : setting.value;
        storeHash = config.storeHash || storeHash;
        token = config.token || token;
      }
      if (!token || !storeHash || !query) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      const q = (query as string).trim();
      const bcHeaders = {
        "X-Auth-Token": String(token),
        "Content-Type": "application/json",
        Accept: "application/json",
      };

      // ── Helpers ──

      const effectivePrice = (
        basePrice: number | null,
        salePrice: number | null,
        fallback: number,
      ): number => {
        const base = basePrice != null ? basePrice : fallback;
        if (salePrice != null && salePrice > 0 && salePrice < base)
          return salePrice;
        return base;
      };

      const shapeVariant = (
        v: any,
        fallbackPrice: string,
        productSalePrice?: number | null,
      ) => {
        const base = v.price != null ? v.price : parseFloat(fallbackPrice);
        let price: number;
        if (v.sale_price != null && v.sale_price > 0) {
          // Variant has its own sale price — use it
          price = v.sale_price;
        } else if (
          productSalePrice != null &&
          productSalePrice > 0 &&
          productSalePrice < base
        ) {
          // No variant-level sale price — inherit from parent product
          price = productSalePrice;
        } else {
          price = base;
        }
        return {
          id: v.id,
          sku: v.sku,
          upc: v.upc || "",
          price: price.toString(),
          sale_price: v.sale_price != null && v.sale_price > 0 ? v.sale_price.toString() : undefined,
          stock_level: v.inventory_level || 0,
          min_purchase_quantity: v.order_quantity_minimum ?? null,
          max_purchase_quantity: v.order_quantity_maximum ?? null,
          option_values: (v.option_values || []).map((ov: any) => ({
            id: ov.id,
            option_id: ov.option_id,
            label: ov.label,
            option_display_name: ov.option_display_name,
          })),
        };
      };

      const shapeProduct = (p: any) => ({
        id: p.id,
        bigcommerce_id: p.id,
        name: p.name,
        sku: p.sku,
        price: effectivePrice(
          p.price,
          p.sale_price ?? null,
          p.price,
        ).toString(),
        image: p.primary_image?.url_standard || "",
        description: p.description
          ? p.description.replace(/<[^>]*>?/gm, "")
          : "",
        stock_level: p.inventory_level || 0,
        min_purchase_quantity: p.order_quantity_minimum ?? null,
        max_purchase_quantity: p.order_quantity_maximum ?? null,
        is_pinned: false,
        variants: [] as any[],
      });

      // Fetch parent product details for a variant that was found via variants endpoint
      const buildVariantResultFromId = async (
        variant: any,
        parentProductId: number,
      ) => {
        const productRes = await fetch(
          `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products/${parentProductId}?include=primary_image`,
          { headers: bcHeaders },
        );
        if (!productRes.ok) throw new Error("Failed to fetch parent product");
        const pd = (await productRes.json()).data;
        return {
          resultType: "variant" as const,
          product: shapeProduct(pd),
          variant: shapeVariant(variant, pd.price.toString(), pd.sale_price),
        };
      };

      // Build a variant result directly from keyword-search product data (no extra API call)
      const buildVariantResultFromProductData = (p: any, v: any) => ({
        resultType: "variant" as const,
        product: shapeProduct(p),
        variant: shapeVariant(v, p.price.toString(), p.sale_price),
      });

      // ── Step 1: Direct SKU lookup via variants endpoint ──
      const skuRes = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/variants?sku=${encodeURIComponent(q)}`,
        { headers: bcHeaders },
      );
      if (skuRes.ok) {
        const skuData = await skuRes.json();
        if (skuData.data && skuData.data.length > 0) {
          // Exact SKU match — always return as direct variant, never as product card
          const result = await buildVariantResultFromId(
            skuData.data[0],
            skuData.data[0].product_id,
          );
          return res.json(result);
        }
      }

      // ── Step 2: UPC lookup (purely numeric queries only) ──
      if (/^\d+$/.test(q)) {
        const upcRes = await fetch(
          `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/variants?upc=${encodeURIComponent(q)}`,
          { headers: bcHeaders },
        );
        if (upcRes.ok) {
          const upcData = await upcRes.json();
          if (upcData.data && upcData.data.length > 0) {
            const result = await buildVariantResultFromId(
              upcData.data[0],
              upcData.data[0].product_id,
            );
            return res.json(result);
          }
        }
      }

      // ── Step 3: Keyword search — but rescue exact SKU/UPC hits before returning product cards ──
      const kwRes = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products?keyword=${encodeURIComponent(q)}&include=primary_image,variants`,
        { headers: bcHeaders },
      );
      if (!kwRes.ok)
        throw new Error(`BigCommerce API error: ${kwRes.statusText}`);

      const kwData = await kwRes.json();
      const kwProducts: any[] = kwData.data || [];

      // Secondary exact-match rescue: if any variant inside keyword results matches the query
      // exactly by SKU or UPC, return it as a direct variant (not a product card)
      const qLower = q.toLowerCase();
      const isNumeric = /^\d+$/.test(q);
      for (const p of kwProducts) {
        for (const v of p.variants || []) {
          const skuMatch = v.sku && v.sku.toLowerCase() === qLower;
          const upcMatch = isNumeric && v.upc && v.upc === q;
          if (skuMatch || upcMatch) {
            return res.json(buildVariantResultFromProductData(p, v));
          }
        }
      }

      // ── No exact match found — return keyword product list ──
      const products = kwProducts.map((p: any) => ({
        ...shapeProduct(p),
        variants: (p.variants || []).map((v: any) =>
          shapeVariant(v, p.price.toString(), p.sale_price),
        ),
      }));

      res.json({ resultType: "products", products });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // BigCommerce proxy for products (admin use)
  app.get(
    "/api/bigcommerce/products/search",
    requireAdmin,
    async (req, res) => {
      try {
        const { query } = req.query;

        // Fetch setting from database instead of localStorage
        const setting = await storage.getSetting("bigcommerce_config");
        let storeHash = process.env.BC_STORE_HASH;
        let token = process.env.BC_TOKEN;

        if (setting && setting.value) {
          const config =
            typeof setting.value === "string"
              ? JSON.parse(setting.value)
              : setting.value;
          storeHash = config.storeHash || storeHash;
          token = config.token || token;
        }

        if (!token || !storeHash || !query) {
          return res.status(400).json({
            error: "Missing required parameters (search query or credentials)",
          });
        }

        // Call BigCommerce API for products
        const response = await fetch(
          `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products?keyword=${encodeURIComponent(query as string)}&include=primary_image,variants`,
          {
            headers: {
              "X-Auth-Token": String(token),
              "Content-Type": "application/json",
              Accept: "application/json",
            },
          },
        );

        if (!response.ok) {
          throw new Error(`BigCommerce API error: ${response.statusText}`);
        }

        const data = await response.json();

        // Transform to our format
        const products = data.data.map((p: any) => ({
          id: p.id,
          bigcommerce_id: p.id,
          name: p.name,
          sku: p.sku,
          price: p.price.toString(),
          image: p.primary_image?.url_standard || "",
          description: p.description.replace(/<[^>]*>?/gm, ""),
          stock_level: p.inventory_level || 0,
          is_pinned: false,
          // Always include variants array, regardless of option count
          variants: (p.variants || []).map((v: any) => ({
            id: v.id,
            sku: v.sku,
            price: v.price?.toString() || p.price.toString(),
            stock_level: v.inventory_level || 0,
            min_purchase_quantity: v.order_quantity_minimum ?? null,
            max_purchase_quantity: v.order_quantity_maximum ?? null,
            option_values: (v.option_values || []).map((ov: any) => ({
              id: ov.id, // option value ID - needed for BigCommerce order API
              option_id: ov.option_id, // option ID - needed for BigCommerce order API
              label: ov.label,
              option_display_name: ov.option_display_name,
            })),
          })),
        }));

        res.json(products);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  // BigCommerce categories (all visible, paginated fetch)
  app.get("/api/bigcommerce/categories", requireAuth, async (req, res) => {
    try {
      const setting = await storage.getSetting("bigcommerce_config");
      let storeHash = process.env.BC_STORE_HASH;
      let token = process.env.BC_TOKEN;
      if (setting?.value) {
        const cfg =
          typeof setting.value === "string"
            ? JSON.parse(setting.value)
            : setting.value;
        storeHash = cfg.storeHash || storeHash;
        token = cfg.token || token;
      }
      if (!storeHash || !token)
        return res.status(400).json({ error: "BigCommerce not configured" });

      const headers = {
        "X-Auth-Token": String(token),
        "Content-Type": "application/json",
        Accept: "application/json",
      };

      let allCategories: any[] = [];
      let page = 1;
      while (true) {
        const r = await fetch(
          `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/categories?is_visible=true&limit=250&page=${page}`,
          { headers },
        );
        if (!r.ok) throw new Error(`BigCommerce API error: ${r.statusText}`);
        const data = await r.json();
        if (!Array.isArray(data.data) || data.data.length === 0) break;
        allCategories = allCategories.concat(data.data);
        if (
          !data.meta?.pagination ||
          data.meta.pagination.current_page >= data.meta.pagination.total_pages
        )
          break;
        page++;
      }

      res.json(
        allCategories.map((c: any) => ({
          id: c.id,
          name: c.name,
          parent_id: c.parent_id ?? 0,
          is_visible: c.is_visible,
          sort_order: c.sort_order ?? 0,
        })),
      );
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // BigCommerce category products — paginated, loaded on demand
  app.get(
    "/api/bigcommerce/category-products",
    requireAuth,
    async (req, res) => {
      try {
        const {
          categoryId,
          page = "1",
          limit = "12",
        } = req.query as Record<string, string>;
        if (!categoryId)
          return res.status(400).json({ error: "categoryId is required" });

        const setting = await storage.getSetting("bigcommerce_config");
        let storeHash = process.env.BC_STORE_HASH;
        let token = process.env.BC_TOKEN;
        if (setting?.value) {
          const cfg =
            typeof setting.value === "string"
              ? JSON.parse(setting.value)
              : setting.value;
          storeHash = cfg.storeHash || storeHash;
          token = cfg.token || token;
        }
        if (!storeHash || !token)
          return res.status(400).json({ error: "BigCommerce not configured" });

        const headers = {
          "X-Auth-Token": String(token),
          "Content-Type": "application/json",
          Accept: "application/json",
        };

        const r = await fetch(
          `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products` +
            `?categories:in=${categoryId}&is_visible=true&include=variants,images` +
            `&sort=id&direction=desc&page=${page}&limit=${limit}`,
          { headers },
        );
        if (!r.ok) throw new Error(`BigCommerce API error: ${r.statusText}`);
        const data = await r.json();

        const products = (data.data ?? []).map((p: any) => {
          const primaryImage =
            (p.images ?? []).find((img: any) => img.is_thumbnail) ??
            (p.images ?? [])[0];
          const salePrice =
            p.sale_price != null &&
            p.sale_price > 0 &&
            p.sale_price < p.price
              ? p.sale_price
              : null;
          const displayPrice = salePrice ?? p.price ?? 0;
          const variants = (p.variants ?? []).map((v: any) => {
            const vBase = v.price ?? p.price ?? 0;
            const vSale =
              v.sale_price != null && v.sale_price > 0 ? v.sale_price : null;
            const vPrice =
              vSale != null && vSale < vBase
                ? vSale
                : salePrice != null && salePrice < vBase
                  ? salePrice
                  : vBase;
            return {
              id: v.id,
              sku: v.sku,
              upc: v.upc || "",
              price: vPrice.toString(),
              stock_level: v.inventory_level ?? 0,
              min_purchase_quantity: v.order_quantity_minimum ?? null,
              max_purchase_quantity: v.order_quantity_maximum ?? null,
              option_values: (v.option_values ?? []).map((ov: any) => ({
                id: ov.id,
                option_id: ov.option_id,
                label: ov.label,
                option_display_name: ov.option_display_name,
              })),
            };
          });
          return {
            id: p.id,
            bigcommerce_id: p.id,
            name: p.name,
            sku: p.sku,
            price: displayPrice.toString(),
            image: primaryImage?.url_standard ?? "",
            description: p.description
              ? p.description.replace(/<[^>]*>?/gm, "")
              : "",
            stock_level: p.inventory_level ?? 0,
            min_purchase_quantity: p.order_quantity_minimum ?? null,
            max_purchase_quantity: p.order_quantity_maximum ?? null,
            is_pinned: false,
            variants,
          };
        });

        res.json({
          products,
          total: data.meta?.pagination?.total ?? 0,
          total_pages: data.meta?.pagination?.total_pages ?? 1,
          current_page: data.meta?.pagination?.current_page ?? 1,
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  // BigCommerce customer search
  app.get(
    "/api/bigcommerce/customers/search",
    requireAuth,
    async (req, res) => {
      try {
        const { query } = req.query;
        if (!query) {
          return res.json([]);
        }

        const setting = await storage.getSetting("bigcommerce_config");
        let storeHash = process.env.BC_STORE_HASH;
        let token = process.env.BC_TOKEN;

        if (setting && setting.value) {
          const config =
            typeof setting.value === "string"
              ? JSON.parse(setting.value)
              : setting.value;
          storeHash = config.storeHash || storeHash;
          token = config.token || token;
        }

        if (!storeHash || !token) {
          return res
            .status(400)
            .json({ error: "BigCommerce credentials not configured" });
        }

        // BC v3 Customers API: use name:like for names, email:in for email addresses
        const q = query as string;
        const filterParam = q.includes("@")
          ? `email:in=${encodeURIComponent(q)}`
          : `name:like=${encodeURIComponent(q)}`;
        const bcUrl = `https://api.bigcommerce.com/stores/${storeHash}/v3/customers?${filterParam}&limit=10`;
        console.log("[BC customer search] Fetching:", bcUrl);

        const response = await fetch(bcUrl, {
          headers: {
            "X-Auth-Token": String(token),
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        });

        // Read raw text first so we can log it if JSON parsing fails
        const rawText = await response.text();
        console.log("[BC customer search] Status:", response.status, "Body:", rawText.slice(0, 400));

        let data: any = null;
        try {
          data = JSON.parse(rawText);
        } catch {
          throw new Error(`BigCommerce returned non-JSON response (HTTP ${response.status}): ${rawText.slice(0, 200)}`);
        }

        if (!response.ok) {
          const bcMsg = data?.title || data?.detail || data?.errors?.[0] || data?.message || response.statusText;
          throw new Error(`BigCommerce API error (${response.status}): ${bcMsg}`);
        }

        const rows: any[] = Array.isArray(data?.data) ? data.data : [];

        const customers = rows.map((c: any) => ({
          id: c.id,
          first_name: c.first_name,
          last_name: c.last_name,
          email: c.email,
          phone: c.phone || "",
          company: c.company || "",
          customer_group_id: c.customer_group_id ?? null,
          store_credit_amount: 0,
        }));

        res.json(customers);
      } catch (error: any) {
        console.error("[BC customer search] Caught error:", error.message);
        res.status(500).json({ error: error.message });
      }
    },
  );

  // Get BigCommerce customer addresses
  app.get(
    "/api/bigcommerce/customers/:customerId/addresses",
    requireAuth,
    async (req, res) => {
      try {
        const { customerId } = req.params;

        const setting = await storage.getSetting("bigcommerce_config");
        let storeHash = process.env.BC_STORE_HASH;
        let token = process.env.BC_TOKEN;

        if (setting && setting.value) {
          const config =
            typeof setting.value === "string"
              ? JSON.parse(setting.value)
              : setting.value;
          storeHash = config.storeHash || storeHash;
          token = config.token || token;
        }

        if (!storeHash || !token) {
          return res
            .status(400)
            .json({ error: "BigCommerce credentials not configured" });
        }

        const response = await fetch(
          `https://api.bigcommerce.com/stores/${storeHash}/v3/customers/addresses?customer_id:in=${customerId}`,
          {
            headers: {
              "X-Auth-Token": String(token),
              "Content-Type": "application/json",
              Accept: "application/json",
            },
          },
        );

        if (!response.ok) {
          throw new Error(`BigCommerce API error: ${response.statusText}`);
        }

        const data = await response.json();

        // Return addresses
        const addresses = data.data.map((a: any) => ({
          id: a.id,
          first_name: a.first_name,
          last_name: a.last_name,
          company: a.company || "",
          street_1: a.address1,
          street_2: a.address2 || "",
          city: a.city,
          state: a.state_or_province,
          zip: a.postal_code,
          country: a.country,
          country_iso2: a.country_code,
          phone: a.phone || "",
        }));

        res.json(addresses);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  // Look up a single BigCommerce customer by their BC ID
  app.get(
    "/api/bigcommerce/customers/by-bc-id/:bcId",
    requireAuth,
    async (req, res) => {
      try {
        const { bcId } = req.params;
        const setting = await storage.getSetting("bigcommerce_config");
        let storeHash = process.env.BC_STORE_HASH;
        let token = process.env.BC_TOKEN;
        if (setting?.value) {
          const config =
            typeof setting.value === "string"
              ? JSON.parse(setting.value)
              : setting.value;
          storeHash = config.storeHash || storeHash;
          token = config.token || token;
        }
        if (!storeHash || !token)
          return res
            .status(400)
            .json({ error: "BigCommerce credentials not configured" });
        const response = await fetch(
          `https://api.bigcommerce.com/stores/${storeHash}/v3/customers?id:in=${bcId}`,
          {
            headers: {
              "X-Auth-Token": String(token),
              "Content-Type": "application/json",
              Accept: "application/json",
            },
          },
        );
        if (!response.ok)
          throw new Error(`BigCommerce API error: ${response.statusText}`);
        const data = await response.json();
        if (!data.data || data.data.length === 0)
          return res.status(404).json({ error: "Customer not found" });
        const c = data.data[0];
        // For scopeMode "all": also fetch the BC price list assignment for this customer's group
        let price_list_id: number | null = null;
        if (c.customer_group_id) {
          try {
            const plRes = await fetch(
              `https://api.bigcommerce.com/stores/${storeHash}/v3/pricelists/assignments?customer_group_id:in=${c.customer_group_id}&limit=1`,
              {
                headers: {
                  "X-Auth-Token": String(token),
                  Accept: "application/json",
                },
              },
            );
            if (plRes.ok) {
              const plData = await plRes.json();
              price_list_id = plData.data?.[0]?.price_list_id ?? null;
            }
          } catch {}
        }
        res.json({
          id: c.id,
          first_name: c.first_name,
          last_name: c.last_name,
          email: c.email,
          phone: c.phone || "",
          company: c.company || "",
          customer_group_id: c.customer_group_id,
          price_list_id,
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  // Refresh stock levels for given BigCommerce product IDs
  app.post("/api/products/refresh-stock", requireAuth, async (req, res) => {
    try {
      const { bigcommerce_ids } = req.body as { bigcommerce_ids: number[] };
      if (!Array.isArray(bigcommerce_ids) || bigcommerce_ids.length === 0)
        return res.json([]);
      const setting = await storage.getSetting("bigcommerce_config");
      let storeHash = process.env.BC_STORE_HASH;
      let token = process.env.BC_TOKEN;
      if (setting?.value) {
        const config =
          typeof setting.value === "string"
            ? JSON.parse(setting.value)
            : setting.value;
        storeHash = config.storeHash || storeHash;
        token = config.token || token;
      }
      if (!storeHash || !token)
        return res
          .status(400)
          .json({ error: "BigCommerce credentials not configured" });
      const results = await Promise.all(
        bigcommerce_ids.map(async (bcId: number) => {
          try {
            const r = await fetch(
              `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products/${bcId}?include=variants`,
              {
                headers: {
                  "X-Auth-Token": String(token),
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
              },
            );
            if (!r.ok)
              return { bigcommerce_id: bcId, stock_level: 0, variants: [] };
            const d = await r.json();
            const p = d.data;
            return {
              bigcommerce_id: bcId,
              stock_level: p.inventory_level ?? 0,
              min_purchase_quantity: p.order_quantity_minimum ?? null,
              max_purchase_quantity: p.order_quantity_maximum ?? null,
              variants: (p.variants || []).map((v: any) => ({
                id: v.id,
                stock_level: v.inventory_level ?? 0,
                min_purchase_quantity: v.order_quantity_minimum ?? null,
                max_purchase_quantity: v.order_quantity_maximum ?? null,
              })),
            };
          } catch {
            return { bigcommerce_id: bcId, stock_level: 0, variants: [] };
          }
        }),
      );
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== PUBLIC BUSINESS LOGO (no auth required for login page) =====
  app.get("/api/public/business-logo", async (_req, res) => {
    try {
      const setting = await storage.getSetting("business_logo");
      res.json({ value: setting?.value ?? null });
    } catch {
      res.json({ value: null });
    }
  });

  // ===== SETTINGS ROUTES =====
  app.get("/api/settings/:key", requireAuth, async (req, res) => {
    try {
      const setting = await storage.getSetting(req.params.key);
      res.json(setting || { key: req.params.key, value: null });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/settings", requireAdmin, async (req, res) => {
    try {
      const { key, value } = req.body;
      await storage.setSetting(key, value);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== BIGCOMMERCE PRODUCT MAX QTY OVERRIDE =====

  // Set (or remove) max_purchase_quantity at PRODUCT level (not variant)
  // Used for checkout override: set to null to remove limit, then restore original after order
  app.post("/api/bigcommerce/products/set-product-max-qty", requireAuth, async (req, res) => {
    try {
      const { items } = req.body as {
        items: Array<{ product_id: number; max_purchase_quantity: number | null }>;
      };
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "items array required" });
      }
      const setting = await storage.getSetting("bigcommerce_config");
      let storeHash = process.env.BC_STORE_HASH;
      let token = process.env.BC_TOKEN;
      if (setting?.value) {
        const cfg = typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value;
        storeHash = cfg.storeHash || storeHash;
        token = cfg.token || token;
      }
      if (!storeHash || !token) {
        return res.status(400).json({ error: "BigCommerce credentials not configured" });
      }
      const results = await Promise.all(
        items.map(async ({ product_id, max_purchase_quantity }) => {
          try {
            const r = await fetch(
              `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products/${product_id}`,
              {
                method: "PUT",
                headers: {
                  "X-Auth-Token": String(token),
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                body: JSON.stringify({ order_quantity_maximum: max_purchase_quantity }),
              }
            );
            return { product_id, ok: r.ok, status: r.status };
          } catch (err: any) {
            return { product_id, ok: false, error: err.message };
          }
        })
      );
      res.json({ results });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Set (or remove) max_purchase_quantity for a list of variants (kept for backward compat)
  app.post("/api/bigcommerce/products/set-variant-max-qty", requireAuth, async (req, res) => {
    try {
      const { items } = req.body as {
        items: Array<{ product_id: number; variant_id: number; max_purchase_quantity: number | null }>;
      };
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "items array required" });
      }
      const setting = await storage.getSetting("bigcommerce_config");
      let storeHash = process.env.BC_STORE_HASH;
      let token = process.env.BC_TOKEN;
      if (setting?.value) {
        const cfg = typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value;
        storeHash = cfg.storeHash || storeHash;
        token = cfg.token || token;
      }
      if (!storeHash || !token) {
        return res.status(400).json({ error: "BigCommerce credentials not configured" });
      }
      const results = await Promise.all(
        items.map(async ({ product_id, variant_id, max_purchase_quantity }) => {
          try {
            const r = await fetch(
              `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products/${product_id}/variants/${variant_id}`,
              {
                method: "PUT",
                headers: {
                  "X-Auth-Token": String(token),
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                body: JSON.stringify({ order_quantity_maximum: max_purchase_quantity }),
              }
            );
            return { product_id, variant_id, ok: r.ok, status: r.status };
          } catch (err: any) {
            return { product_id, variant_id, ok: false, error: err.message };
          }
        })
      );
      res.json({ results });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== INVENTORY PUSH =====

  app.post("/api/inventory/push", requireAuth, async (req, res) => {
    try {
      const { product_id, variant_id, sku, quantity_added, reason, product_name, variant_name } = req.body as {
        product_id: number;
        variant_id: number;
        sku: string;
        quantity_added: number;
        reason?: string;
        product_name?: string;
        variant_name?: string;
      };
      const authUser = (req as any).authUser;

      if (!product_id || !variant_id || !quantity_added || quantity_added <= 0) {
        return res.status(400).json({ error: "product_id, variant_id, and quantity_added (>0) are required" });
      }

      const setting = await storage.getSetting("bigcommerce_config");
      let storeHash = process.env.BC_STORE_HASH;
      let token = process.env.BC_TOKEN;
      if (setting?.value) {
        const cfg = typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value;
        storeHash = cfg.storeHash || storeHash;
        token = cfg.token || token;
      }
      if (!storeHash || !token) {
        return res.status(400).json({ error: "BigCommerce credentials not configured" });
      }

      // 1. Fetch current inventory
      const getRes = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products/${product_id}/variants/${variant_id}`,
        {
          headers: {
            "X-Auth-Token": String(token),
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        }
      );
      if (!getRes.ok) {
        throw new Error(`Failed to fetch variant: ${getRes.statusText}`);
      }
      const variantData = await getRes.json();
      const previous_inventory: number = variantData.data?.inventory_level ?? 0;
      const new_inventory = previous_inventory + quantity_added;

      // 2. Update BC inventory
      const putRes = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products/${product_id}/variants/${variant_id}`,
        {
          method: "PUT",
          headers: {
            "X-Auth-Token": String(token),
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ inventory_level: new_inventory }),
        }
      );
      if (!putRes.ok) {
        const errData = await putRes.json().catch(() => ({}));
        throw new Error(`Failed to update inventory: ${JSON.stringify(errData)}`);
      }

      // 3. Log the push
      const logEntry: InsertInventoryPushLog = {
        user_id: authUser.id,
        username: authUser.username || "",
        sku,
        product_id,
        variant_id,
        product_name: product_name || "",
        variant_name: variant_name || "",
        previous_inventory,
        new_inventory,
        quantity_added,
        reason: reason || null,
      };
      const log = await storage.createInventoryPushLog(logEntry);

      res.json({ success: true, previous_inventory, new_inventory, log });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/inventory/push-logs", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await storage.getInventoryPushLogs(limit);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== DASHBOARD / ADMIN DATA ROUTES ======================================

  app.get("/api/admin/orders", requireAdmin, async (_req, res) => {
    try {
      res.json(await storage.getAllOrders());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // All orders — accessible to any authenticated user (permission gating on frontend)
  app.get("/api/orders/all", requireAuth, async (_req, res) => {
    try {
      res.json(await storage.getAllOrders());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // User summary — userId, name, role, group_name — accessible to any authenticated user
  app.get("/api/users/summary", requireAuth, async (_req, res) => {
    try {
      const [allUsers, allRoles] = await Promise.all([
        storage.getAllUsers(),
        storage.getAllRoles(),
      ]);
      const roleMap = new Map(allRoles.map((r) => [r.id, r.name]));
      res.json(
        allUsers.map((u) => ({
          id: u.id,
          name: u.name,
          role: u.role,
          group_name: u.role_id ? (roleMap.get(u.role_id) ?? null) : null,
        })),
      );
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== RBAC ROUTES (admin-protected new routes only) ======================

  // Roles
  app.get("/api/roles", requireAdmin, async (_req, res) => {
    try {
      const allRoles = await storage.getAllRoles();
      // Attach permissions to each role
      const result = await Promise.all(
        allRoles.map(async (r) => ({
          ...r,
          permissions: await storage.getPermissionsForRole(r.id),
        })),
      );
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/roles", requireAdmin, async (req, res) => {
    try {
      const { name, description } = req.body;
      if (!name) return res.status(400).json({ error: "name required" });
      const role = await storage.createRole({ name, description: description || null });
      res.json(role);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/roles/:id", requireAdmin, async (req, res) => {
    try {
      const { name, description } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: "name required" });
      const role = await storage.updateRole(parseInt(req.params.id), { name: name.trim(), description: description || null });
      res.json(role);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/roles/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteRole(parseInt(req.params.id));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Permissions
  app.get("/api/permissions", requireAdmin, async (_req, res) => {
    try {
      res.json(await storage.getAllPermissions());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/permissions", requireAdmin, async (req, res) => {
    try {
      const { module, action, description } = req.body;
      if (!module || !action) return res.status(400).json({ error: "module and action required" });
      const perm = await storage.createPermission({ module, action, description: description || null });
      res.json(perm);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/permissions/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deletePermission(parseInt(req.params.id));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Role ↔ Permission assignments
  app.post("/api/roles/:roleId/permissions/:permId", requireAdmin, async (req, res) => {
    try {
      await storage.addPermissionToRole({
        role_id: parseInt(req.params.roleId),
        permission_id: parseInt(req.params.permId),
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/roles/:roleId/permissions/:permId", requireAdmin, async (req, res) => {
    try {
      await storage.removePermissionFromRole(
        parseInt(req.params.roleId),
        parseInt(req.params.permId),
      );
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Admin user management (RBAC)
  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const result = await Promise.all(
        allUsers.map(async (u) => ({
          ...u,
          permissions: await storage.getPermissionsForUser(u.id),
        })),
      );
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/admin/users/:id/role", requireAdmin, async (req, res) => {
    try {
      const roleId = req.body.role_id != null ? parseInt(req.body.role_id) : null;
      await storage.setUserRole(parseInt(req.params.id), roleId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/users/:id/permissions/:permId", requireAdmin, async (req, res) => {
    try {
      await storage.addPermissionToUser({
        user_id: parseInt(req.params.id),
        permission_id: parseInt(req.params.permId),
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/admin/users/:id/permissions/:permId", requireAdmin, async (req, res) => {
    try {
      await storage.removePermissionFromUser(
        parseInt(req.params.id),
        parseInt(req.params.permId),
      );
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── BigCommerce Orders (list / detail / edit) ─────────────────────────────

  // Helper to get BC creds inline
  async function getBcCreds() {
    const setting = await storage.getSetting("bigcommerce_config");
    let storeHash = process.env.BC_STORE_HASH || "";
    let token = process.env.BC_TOKEN || "";
    if (setting?.value) {
      const cfg = typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value;
      storeHash = cfg.storeHash || storeHash;
      token = cfg.token || token;
    }
    if (!storeHash || !token) throw new Error("BigCommerce credentials not configured");
    const headers = { "X-Auth-Token": token, "Content-Type": "application/json", Accept: "application/json" };
    return { storeHash, token, headers };
  }

  // List BC orders (paginated, sortable, filterable by status)
  app.get("/api/bigcommerce/orders/list", requireAuth, async (req, res) => {
    try {
      const { storeHash, headers } = await getBcCreds();
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
      const sort = req.query.sort === "oldest" ? "date_created:asc" : "date_created:desc";
      const statusId = req.query.status_id !== undefined && req.query.status_id !== "" ? req.query.status_id : undefined;

      let url = `https://api.bigcommerce.com/stores/${storeHash}/v2/orders?limit=${limit}&page=${page}&sort=${sort}`;
      if (statusId !== undefined) url += `&status_id=${statusId}`;

      const r = await fetch(url, { headers });
      if (r.status === 204) return res.json({ orders: [], hasMore: false, page, limit });
      if (!r.ok) throw new Error(`BigCommerce API error: ${r.statusText}`);
      const data = await r.json();
      const orders = Array.isArray(data) ? data : [];

      const shaped = orders.map((o: any) => ({
        id: o.id,
        status: o.status,
        status_id: o.status_id,
        date_created: o.date_created,
        customer_id: o.customer_id,
        billing_address: {
          first_name: o.billing_address?.first_name || "",
          last_name: o.billing_address?.last_name || "",
          email: o.billing_address?.email || "",
          company: o.billing_address?.company || "",
        },
        total_inc_tax: o.total_inc_tax,
        subtotal_inc_tax: o.subtotal_inc_tax,
        items_total: o.items_total,
        payment_method: o.payment_method || "",
        staff_notes: o.staff_notes || "",
        customer_message: o.customer_message || "",
      }));

      res.json({ orders: shaped, hasMore: orders.length === limit, page, limit });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get pending (unfulfilled) BC orders by SKU — used by POS inventory shortfall dialog
  app.get("/api/bigcommerce/orders/pending-by-sku", requireAuth, async (req, res) => {
    try {
      const { storeHash, headers } = await getBcCreds();
      const skusParam = req.query.skus as string;
      if (!skusParam) return res.json({});
      const targetSkus = new Set(skusParam.split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean));
      if (targetSkus.size === 0) return res.json({});

      // Exclude: shipped(7), cancelled(8), declined(9), refunded(10), partially_refunded(13)
      const EXCLUDED = new Set([7, 8, 9, 10, 13]);

      // Fetch last 50 BC orders, newest first
      const ordersRes = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v2/orders?limit=50&sort=date_created:desc`,
        { headers }
      );
      const empty: Record<string, any[]> = {};
      targetSkus.forEach(s => { empty[s] = []; });
      if (!ordersRes.ok || ordersRes.status === 204) return res.json(empty);

      const allOrders: any[] = await ordersRes.json();
      const openOrders = Array.isArray(allOrders) ? allOrders.filter((o: any) => !EXCLUDED.has(o.status_id)) : [];

      // Fetch products for each open order (cap at 25 to limit BC API load)
      const toCheck = openOrders.slice(0, 25);
      const productLists = await Promise.all(
        toCheck.map(async (order: any) => {
          try {
            const r = await fetch(
              `https://api.bigcommerce.com/stores/${storeHash}/v2/orders/${order.id}/products?limit=250`,
              { headers }
            );
            if (!r.ok) return { order, products: [] as any[] };
            const products = await r.json();
            return { order, products: Array.isArray(products) ? products : [] };
          } catch {
            return { order, products: [] as any[] };
          }
        })
      );

      // Build result keyed by lowercase SKU
      const result: Record<string, any[]> = {};
      targetSkus.forEach(s => { result[s] = []; });

      for (const { order, products } of productLists) {
        for (const product of (products as any[])) {
          const sku = (product.sku || "").toLowerCase().trim();
          if (Object.prototype.hasOwnProperty.call(result, sku)) {
            result[sku].push({
              order_id: order.id,
              status: order.status,
              status_id: order.status_id,
              quantity: product.quantity,
              customer: `${order.billing_address?.first_name || ""} ${order.billing_address?.last_name || ""}`.trim(),
              date: order.date_created,
            });
          }
        }
      }

      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get a single BC order detail with line items
  app.get("/api/bigcommerce/orders/:orderId/detail", requireAuth, async (req, res) => {
    try {
      const { storeHash, headers } = await getBcCreds();
      const { orderId } = req.params;
      const [orderRes, productsRes] = await Promise.all([
        fetch(`https://api.bigcommerce.com/stores/${storeHash}/v2/orders/${orderId}`, { headers }),
        fetch(`https://api.bigcommerce.com/stores/${storeHash}/v2/orders/${orderId}/products?limit=250`, { headers }),
      ]);
      if (!orderRes.ok) throw new Error(`Order fetch failed: ${orderRes.statusText}`);
      if (!productsRes.ok) throw new Error(`Products fetch failed: ${productsRes.statusText}`);
      const order = await orderRes.json();
      const rawProductsData = await productsRes.json();
      const rawProducts: any[] = Array.isArray(rawProductsData) ? rawProductsData : [];

      // Fetch catalogue prices for each unique product so we can detect manual discounts.
      // BC overwrites base_price with the adjusted price on orders, so we must look up the
      // original catalogue price separately.
      const uniqueProductIds = [...new Set(rawProducts.map((p: any) => p.product_id).filter(Boolean))];
      const cataloguePriceMap: Record<string, number> = {}; // key: `${productId}_${variantId}`

      if (uniqueProductIds.length > 0) {
        try {
          const catRes = await fetch(
            `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products?id:in=${uniqueProductIds.join(",")}&include=variants&limit=50`,
            { headers }
          );
          if (catRes.ok) {
            const catData = await catRes.json();
            const catProducts: any[] = catData?.data ?? [];
            for (const cp of catProducts) {
              // Store base product price (used when variant price is 0 / falls back to parent)
              const basePrice = parseFloat(cp.price ?? "0");
              cataloguePriceMap[`${cp.id}_0`] = basePrice;
              for (const v of (cp.variants ?? [])) {
                // Variant price of 0 means "use parent price"
                const vPrice = parseFloat(v.price ?? "0");
                cataloguePriceMap[`${cp.id}_${v.id}`] = vPrice > 0 ? vPrice : basePrice;
              }
            }
          }
        } catch {
          // Catalogue lookup is best-effort; fail silently — invoice still renders
        }
      }

      // Attach catalogue_price to each order product
      const enrichedProducts = rawProducts.map((p: any) => {
        const key = `${p.product_id}_${p.variant_id ?? 0}`;
        const keyBase = `${p.product_id}_0`;
        const cataloguePrice = cataloguePriceMap[key] ?? cataloguePriceMap[keyBase] ?? null;
        return { ...p, catalogue_price: cataloguePrice };
      });

      res.json({ order, products: enrichedProducts });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Update a BC order line item (qty / price)
  app.put("/api/bigcommerce/orders/:orderId/products/:lineId", requireAuth, async (req, res) => {
    try {
      const { storeHash, headers } = await getBcCreds();
      const { orderId, lineId } = req.params;
      const { quantity, price_inc_tax, price_ex_tax } = req.body;
      const body: any = {};
      if (quantity !== undefined) body.quantity = quantity;
      if (price_inc_tax !== undefined) { body.price_inc_tax = price_inc_tax; body.price_ex_tax = price_ex_tax ?? price_inc_tax; }
      const r = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v2/orders/${orderId}/products/${lineId}`,
        { method: "PUT", headers, body: JSON.stringify(body) }
      );
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: data?.title || r.statusText });
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Delete a BC order line item
  app.delete("/api/bigcommerce/orders/:orderId/products/:lineId", requireAuth, async (req, res) => {
    try {
      const { storeHash, headers } = await getBcCreds();
      const { orderId, lineId } = req.params;
      const r = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v2/orders/${orderId}/products/${lineId}`,
        { method: "DELETE", headers }
      );
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: data?.title || r.statusText });
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Add a product to an existing BC order
  app.post("/api/bigcommerce/orders/:orderId/products", requireAuth, async (req, res) => {
    try {
      const { storeHash, headers } = await getBcCreds();
      const { orderId } = req.params;
      const { product_id, variant_id, quantity, price_inc_tax, price_ex_tax, name, sku } = req.body;
      if (!product_id || !quantity) return res.status(400).json({ error: "product_id and quantity are required" });
      const payload: any = {
        product_id,
        quantity,
        price_inc_tax: price_inc_tax ?? undefined,
        price_ex_tax: price_ex_tax ?? price_inc_tax ?? undefined,
        name: name || undefined,
        sku: sku || undefined,
      };
      if (variant_id) payload.variant_id = variant_id;
      const r = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v2/orders/${orderId}/products`,
        { method: "POST", headers, body: JSON.stringify(payload) }
      );
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: data?.title || data?.message || r.statusText });
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── BigCommerce Customers ──────────────────────────────────────────────────

  // List all BC customers (v2 — includes orders_count, total_spent, date_last_order_placed)
  app.get("/api/bigcommerce/customers/all", requireAuth, async (_req, res) => {
    try {
      const setting = await storage.getSetting("bigcommerce_config");
      let storeHash = process.env.BC_STORE_HASH || "";
      let token = process.env.BC_TOKEN || "";
      if (setting?.value) {
        const cfg = typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value;
        storeHash = cfg.storeHash || storeHash;
        token = cfg.token || token;
      }
      if (!storeHash || !token) return res.status(400).json({ error: "BigCommerce credentials not configured" });

      const headers = { "X-Auth-Token": token, "Content-Type": "application/json", Accept: "application/json" };
      let all: any[] = [];
      let page = 1;
      while (true) {
        const r = await fetch(
          `https://api.bigcommerce.com/stores/${storeHash}/v2/customers?limit=250&page=${page}`,
          { headers }
        );
        if (!r.ok) throw new Error(`BigCommerce API error: ${r.statusText}`);
        const data = await r.json();
        if (!Array.isArray(data) || data.length === 0) break;
        all = all.concat(data);
        if (data.length < 250) break;
        page++;
      }

      const customers = all.map((c: any) => ({
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        email: c.email,
        company: c.company || "",
        phone: c.phone || "",
        customer_group_id: c.customer_group_id ?? null,
        orders_count: c.orders_count ?? 0,
        total_spent: parseFloat(c.total_spent ?? "0"),
        date_created: c.date_created || null,
        date_modified: c.date_modified || null,
        date_last_order_placed: c.date_last_order_placed || null,
      }));

      res.json(customers);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Fetch all BC customer groups
  app.get("/api/bigcommerce/customer-groups", requireAuth, async (_req, res) => {
    try {
      const setting = await storage.getSetting("bigcommerce_config");
      let storeHash = process.env.BC_STORE_HASH || "";
      let token = process.env.BC_TOKEN || "";
      if (setting?.value) {
        const cfg = typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value;
        storeHash = cfg.storeHash || storeHash;
        token = cfg.token || token;
      }
      if (!storeHash || !token) return res.status(400).json({ error: "BigCommerce credentials not configured" });
      const headers = { "X-Auth-Token": token, "Content-Type": "application/json", Accept: "application/json" };
      let all: any[] = [];
      let page = 1;
      while (true) {
        const r = await fetch(
          `https://api.bigcommerce.com/stores/${storeHash}/v2/customer_groups?limit=250&page=${page}`,
          { headers }
        );
        if (!r.ok) throw new Error(`BigCommerce API error: ${r.statusText}`);
        const data = await r.json();
        if (!Array.isArray(data) || data.length === 0) break;
        all = all.concat(data);
        if (data.length < 250) break;
        page++;
      }
      res.json(all.map((g: any) => ({ id: g.id, name: g.name })));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Create a new BC customer and assign to group 8 (Verification Pending)
  app.post("/api/bigcommerce/customers/create", requireAuth, async (req, res) => {
    try {
      const setting = await storage.getSetting("bigcommerce_config");
      let storeHash = process.env.BC_STORE_HASH || "";
      let token = process.env.BC_TOKEN || "";
      if (setting?.value) {
        const cfg = typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value;
        storeHash = cfg.storeHash || storeHash;
        token = cfg.token || token;
      }
      if (!storeHash || !token) return res.status(400).json({ error: "BigCommerce credentials not configured" });

      const { first_name, last_name, email, phone, company, address1, address2, city, state_or_province, postal_code, country_code } = req.body;
      if (!first_name || !last_name || !email) return res.status(400).json({ error: "first_name, last_name, and email are required" });

      const payload: any = [{
        first_name,
        last_name,
        email,
        phone: phone || "",
        company: company || "",
        customer_group_id: 8,
      }];

      if (address1) {
        payload[0].addresses = [{
          first_name,
          last_name,
          company: company || "",
          address1,
          address2: address2 || "",
          city: city || "",
          state_or_province: state_or_province || "",
          postal_code: postal_code || "",
          country_code: country_code || "US",
          phone: phone || "",
          address_type: "residential",
        }];
      }

      const r = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v3/customers`,
        {
          method: "POST",
          headers: { "X-Auth-Token": token, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await r.json();
      if (!r.ok) {
        const msg = data?.errors ? JSON.stringify(data.errors) : data?.title || r.statusText;
        return res.status(r.status).json({ error: msg });
      }

      res.json(data.data?.[0] ?? data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== TOOLS: BC PRODUCT LINK =====

  // Fetch existing custom fields for a BC product (to show already-linked products)
  app.get("/api/tools/bc/product-custom-fields/:productId", requirePermission("tools_bc_link"), async (req, res) => {
    try {
      const productId = parseInt(req.params.productId);
      if (isNaN(productId)) return res.status(400).json({ error: "Invalid product ID" });
      const setting = await storage.getSetting("bigcommerce_config");
      let cfg: any = {};
      try {
        if (setting?.value) cfg = typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value;
      } catch {}
      const { storeHash, token } = cfg;
      if (!storeHash || !token) return res.status(400).json({ error: "BigCommerce is not configured" });
      const resp = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products/${productId}/custom-fields`,
        { headers: { "X-Auth-Token": String(token), "Accept": "application/json" } },
      );
      if (!resp.ok) return res.status(502).json({ error: "BigCommerce API error" });
      const data = await resp.json();
      res.json(data.data ?? []);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Search BC products by keyword (Tools > BC Product Link)
  app.get("/api/tools/bc/product-search", requirePermission("tools_bc_link"), async (req, res) => {
    try {
      const q = (req.query.q as string) ?? "";
      if (q.trim().length < 2) return res.json([]);
      const setting = await storage.getSetting("bigcommerce_config");
      let cfg: any = {};
      try {
        if (setting?.value) cfg = typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value;
      } catch {}
      const { storeHash, token } = cfg;
      if (!storeHash || !token) return res.status(400).json({ error: "BigCommerce is not configured" });
      const bcHeaders = {
        "X-Auth-Token": String(token),
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      const resp = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products?keyword=${encodeURIComponent(q.trim())}&limit=12&include=custom_fields`,
        { headers: bcHeaders },
      );
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        console.error("BC product search error:", resp.status, txt);
        return res.status(502).json({ error: "BigCommerce API error" });
      }
      const data = await resp.json();
      const products = (data.data ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        slug: p.custom_url?.url ?? `/${p.name.toLowerCase().replace(/\s+/g, "-")}/`,
      }));
      res.json(products);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Add cross-reference custom fields to linked BC products
  app.post("/api/tools/bc/product-link", requirePermission("tools_bc_link"), async (req, res) => {
    try {
      const { mainProductId, links } = req.body as {
        mainProductId: number;
        links: Array<{
          linkedProductId: number;
          linkedProductName: string;
          linkedDisplayName: string;
          linkedProductSlug: string;
          mainProductName: string;
          mainProductSlug: string;
          bidirectional: boolean;
        }>;
      };
      if (!mainProductId || !Array.isArray(links) || links.length === 0) {
        return res.status(400).json({ error: "mainProductId and links[] are required" });
      }
      const setting = await storage.getSetting("bigcommerce_config");
      let cfg: any = {};
      try {
        if (setting?.value) cfg = typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value;
      } catch {}
      const { storeHash, token, storefrontUrl = "" } = cfg;
      if (!storeHash || !token) return res.status(400).json({ error: "BigCommerce is not configured" });
      const bcHeaders = {
        "X-Auth-Token": String(token),
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      const baseUrl = String(storefrontUrl).replace(/\/$/, "");
      const results: { productId: number; direction: string; success: boolean; error?: string }[] = [];

      for (const link of links) {
        const linkedUrl = `${baseUrl}${link.linkedProductSlug}`;
        const mainUrl = `${baseUrl}${link.mainProductSlug}`;

        // Add linked product as custom field on the main product
        try {
          const r = await fetch(
            `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products/${mainProductId}/custom-fields`,
            {
              method: "POST",
              headers: bcHeaders,
              body: JSON.stringify({
                name: link.linkedDisplayName || link.linkedProductName,
                value: `<a href="${linkedUrl}">Available Here</a>`,
              }),
            },
          );
          if (!r.ok) {
            const txt = await r.text().catch(() => "");
            results.push({ productId: mainProductId, direction: "main->linked", success: false, error: `BC ${r.status}: ${txt.slice(0, 120)}` });
          } else {
            results.push({ productId: mainProductId, direction: "main->linked", success: true });
          }
        } catch (e: any) {
          results.push({ productId: mainProductId, direction: "main->linked", success: false, error: e.message });
        }

        // If bidirectional: also add main product as custom field on the linked product
        if (link.bidirectional) {
          try {
            const r = await fetch(
              `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products/${link.linkedProductId}/custom-fields`,
              {
                method: "POST",
                headers: bcHeaders,
                body: JSON.stringify({
                  name: link.mainProductName,
                  value: `<a href="${mainUrl}">Available Here</a>`,
                }),
              },
            );
            if (!r.ok) {
              const txt = await r.text().catch(() => "");
              results.push({ productId: link.linkedProductId, direction: "linked->main", success: false, error: `BC ${r.status}: ${txt.slice(0, 120)}` });
            } else {
              results.push({ productId: link.linkedProductId, direction: "linked->main", success: true });
            }
          } catch (e: any) {
            results.push({ productId: link.linkedProductId, direction: "linked->main", success: false, error: e.message });
          }
        }
      }

      // Write one log entry per linked product
      const actor = (req as any).authUser;
      for (const link of links) {
        const forwardSuccess = results.some(
          (r) => r.productId === mainProductId && r.direction === "main->linked" && r.success,
        );
        const backSuccess = !link.bidirectional || results.some(
          (r) => r.productId === link.linkedProductId && r.direction === "linked->main" && r.success,
        );
        const status = forwardSuccess && backSuccess ? "success" : forwardSuccess || backSuccess ? "partial" : "failed";
        const logEntry: InsertProductLinkLog = {
          main_product_id: mainProductId,
          main_product_name: link.mainProductName,
          linked_product_id: link.linkedProductId,
          linked_product_name: link.linkedDisplayName || link.linkedProductName,
          bidirectional: link.bidirectional,
          created_by_user_id: actor?.id ?? 0,
          created_by_name: actor?.name ?? "Unknown",
          status,
          results: results.filter(
            (r) => r.productId === mainProductId || r.productId === link.linkedProductId,
          ),
        };
        await storage.createProductLinkLog(logEntry).catch(() => {});
      }

      res.json({ results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET product link logs
  app.get("/api/tools/bc/product-link-logs", requirePermission("tools_bc_link_logs"), async (_req, res) => {
    try {
      const logs = await storage.getProductLinkLogs(200);
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Current user's permission strings (for usePermissions hook)
  app.get("/api/auth/permissions", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).authUser.id as number;
      const perms = await storage.getUserPermissionStrings(userId);
      res.json({ permissions: perms });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Invoice Settings ────────────────────────────────────────────────────────

  app.get("/api/invoice/default-template", requireAuth, (_req, res) => {
    res.json({ template: DEFAULT_INVOICE_TEMPLATE });
  });

  app.get("/api/invoice/settings", requireAuth, async (_req, res) => {
    try {
      const setting = await storage.getSetting("invoice_settings").catch(() => null);
      const defaults = {
        company_name: "MA Distro, Inc.",
        company_address: "1000 Parliament Ct Ste. #300,\nDurham, NC, 27703",
        company_phone: "",
        company_email: "",
        logo_base64: "",
        terms: "By purchasing products from MID Atlantic Distribution, you acknowledge and agree that you are solely responsible for paying all applicable sales taxes, including, but not limited to, state, county, and municipal sales taxes, associated with your purchase",
        html_template: DEFAULT_INVOICE_TEMPLATE,
        smtp_host: "",
        smtp_port: 587,
        smtp_user: "",
        smtp_pass: "",
        smtp_from: "",
      };
      res.json({ ...defaults, ...(setting?.value ?? {}) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/invoice/settings", requireAuth, async (req, res) => {
    try {
      await storage.setSetting("invoice_settings", req.body);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Invoice Email ────────────────────────────────────────────────────────────

  app.post("/api/invoice/send-email", requireAuth, async (req, res) => {
    try {
      const { to, subject, pdf_base64 } = req.body as { to: string; subject: string; pdf_base64: string };
      if (!to || !subject || !pdf_base64) return res.status(400).json({ error: "Missing required fields: to, subject, pdf_base64" });

      const setting = await storage.getSetting("invoice_settings").catch(() => null);
      const cfg = setting?.value ?? {};

      const smtpHost = cfg.smtp_host || "";
      const smtpPort = Number(cfg.smtp_port) || 587;
      const smtpUser = cfg.smtp_user || "";
      const smtpPass = cfg.smtp_pass || "";
      const smtpFrom = cfg.smtp_from || smtpUser;
      const emailBody: string = cfg.email_body || "Please find your invoice attached as a PDF.";
      const companyName: string = cfg.company_name || "";

      if (!smtpHost || !smtpUser) {
        return res.status(400).json({ error: "SMTP is not configured. Please set SMTP settings in Invoice Settings." });
      }

      // Convert data URI to buffer
      const base64Data = pdf_base64.includes(",") ? pdf_base64.split(",")[1] : pdf_base64;
      const pdfBuffer = Buffer.from(base64Data, "base64");

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
        // Explicit timeouts so a blocked/unreachable SMTP server fails fast
        // instead of hanging the request indefinitely (common in cloud hosts).
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      });

      // Verify connectivity before attempting to send — gives a clear error message
      // if SMTP credentials or host are wrong in this environment.
      await transporter.verify();

      const filename = `${subject.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf`;
      const textBody = [emailBody, companyName ? `\n— ${companyName}` : ""].filter(Boolean).join("\n");

      await transporter.sendMail({
        from: smtpFrom,
        to,
        subject,
        text: textBody,
        attachments: [{ filename, content: pdfBuffer, contentType: "application/pdf" }],
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Promo SKU Tracker ────────────────────────────────────────────────────────

  async function getBcCredentials(): Promise<{ storeHash: string; token: string } | null> {
    const setting = await storage.getSetting("bigcommerce_config");
    let storeHash = process.env.BC_STORE_HASH;
    let token = process.env.BC_TOKEN;
    if (setting?.value) {
      const cfg = typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value;
      storeHash = cfg.storeHash || storeHash;
      token = cfg.token || token;
    }
    if (!storeHash || !token) return null;
    return { storeHash, token };
  }

  async function bcFetch(storeHash: string, token: string, path: string): Promise<any> {
    const res = await fetch(`https://api.bigcommerce.com/stores/${storeHash}${path}`, {
      headers: { "X-Auth-Token": token, "Content-Type": "application/json", Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`BC API error ${res.status}: ${res.statusText}`);
    return res.json();
  }

  // GET all promo SKUs
  app.get("/api/promo-skus", requireAuth, async (req, res) => {
    try {
      const skus = await storage.getAllPromoSkus();
      res.json(skus);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST add promo SKU (validates against BC)
  app.post("/api/promo-skus", requireAuth, async (req, res) => {
    try {
      const { sku, promo_note } = req.body as { sku: string; promo_note?: string };
      if (!sku?.trim()) return res.status(400).json({ error: "SKU is required" });
      const upperSku = sku.trim().toUpperCase();

      // Check duplicate
      const existing = await storage.getPromoSkuBySku(upperSku);
      if (existing) return res.status(409).json({ error: `SKU ${upperSku} is already being tracked` });

      // Validate against BigCommerce
      const creds = await getBcCredentials();
      if (!creds) return res.status(400).json({ error: "BigCommerce not configured" });

      const data = await bcFetch(creds.storeHash, creds.token,
        `/v3/catalog/products?sku=${encodeURIComponent(upperSku)}&include=variants&limit=1`
      );

      let product: any = null;
      let variant: any = null;
      let productName = "";
      let variantName: string | null = null;
      let productId = 0;
      let variantId: number | null = null;

      if (data.data?.length) {
        // Direct product SKU match
        product = data.data[0];
        productId = product.id;
        productName = product.name;

        // Check if SKU matches a variant
        const matchedVariant = (product.variants ?? []).find((v: any) => v.sku?.toUpperCase() === upperSku);
        if (matchedVariant) {
          variant = matchedVariant;
          variantId = matchedVariant.id;
          variantName = matchedVariant.option_values?.map((o: any) => o.label).join(" / ") || null;
        }
      } else {
        // Try variant search
        const vData = await bcFetch(creds.storeHash, creds.token,
          `/v3/catalog/variants?sku=${encodeURIComponent(upperSku)}&include_fields=id,product_id,sku,option_values&limit=1`
        );
        if (!vData.data?.length) {
          return res.status(404).json({ error: `SKU "${upperSku}" not found in BigCommerce` });
        }
        variant = vData.data[0];
        variantId = variant.id;
        productId = variant.product_id;

        const pData = await bcFetch(creds.storeHash, creds.token, `/v3/catalog/products/${productId}`);
        productName = pData.data?.name ?? `Product #${productId}`;
        variantName = variant.option_values?.map((o: any) => o.label).join(" / ") || null;
      }

      const userId = (req as any).user?.id ?? null;
      const entry = await storage.createPromoSku({
        sku: upperSku,
        product_id: productId,
        variant_id: variantId,
        product_name: productName,
        variant_name: variantName,
        promo_note: promo_note?.trim() || null,
        created_by: userId,
        is_active: true,
      });
      res.json(entry);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // PUT update promo SKU (note only)
  app.put("/api/promo-skus/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { promo_note } = req.body as { promo_note?: string };
      const updated = await storage.updatePromoSku(id, { promo_note: promo_note?.trim() || null });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // DELETE promo SKU
  app.delete("/api/promo-skus/:id", requireAuth, async (req, res) => {
    try {
      await storage.deletePromoSku(parseInt(req.params.id));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET live inventory for all promo SKUs
  app.get("/api/promo-skus/inventory", requireAuth, async (req, res) => {
    try {
      const skus = await storage.getAllPromoSkus();
      if (!skus.length) return res.json([]);

      const creds = await getBcCredentials();
      if (!creds) return res.json(skus.map((s) => ({ id: s.id, inventory: null })));

      const result: { id: number; inventory: number | null }[] = [];

      for (const s of skus) {
        try {
          if (s.variant_id) {
            const d = await bcFetch(creds.storeHash, creds.token,
              `/v3/catalog/products/${s.product_id}/variants/${s.variant_id}`
            );
            result.push({ id: s.id, inventory: d.data?.inventory_level ?? null });
          } else {
            const d = await bcFetch(creds.storeHash, creds.token,
              `/v3/catalog/products/${s.product_id}`
            );
            result.push({ id: s.id, inventory: d.data?.inventory_level ?? null });
          }
        } catch {
          result.push({ id: s.id, inventory: null });
        }
      }
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET thresholds
  app.get("/api/promo-skus/thresholds", requireAuth, async (req, res) => {
    try {
      const s = await storage.getSetting("promo_sku_thresholds");
      const val = s?.value ? (typeof s.value === "string" ? JSON.parse(s.value) : s.value) : { red: 2, yellow: 5 };
      res.json(val);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST save thresholds
  app.post("/api/promo-skus/thresholds", requireAuth, async (req, res) => {
    try {
      const { red, yellow } = req.body as { red: number; yellow: number };
      await storage.setSetting("promo_sku_thresholds", { red, yellow });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── ShipStation Export ──────────────────────────────────────────────────────

  let ssExportCronJob: cron.ScheduledTask | null = null;

  // ── Helpers ──
  async function getShipstationCreds(): Promise<{ apiKey: string; apiSecret: string } | null> {
    const s = await storage.getSetting("shipstation_config");
    if (!s?.value) return null;
    const cfg = typeof s.value === "string" ? JSON.parse(s.value) : s.value;
    if (!cfg.apiKey || !cfg.apiSecret) return null;
    return cfg;
  }

  async function ssApiGet(apiKey: string, apiSecret: string, path: string): Promise<any> {
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
    const res = await fetch(`https://ssapi.shipstation.com${path}`, {
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ShipStation API error ${res.status}: ${text}`);
    }
    return res.json();
  }

  const SS_FIELD_MAP: Record<string, (s: any) => string> = {
    order_number:    (s) => s.orderNumber ?? "",
    tracking_number: (s) => s.trackingNumber ?? "",
    shipping_cost:   (s) => (s.shipmentCost != null ? String(s.shipmentCost) : ""),
    ship_date:       (s) => s.shipDate ? s.shipDate.split("T")[0] : "",
    carrier:         (s) => s.carrierCode ?? "",
    service:         (s) => s.serviceCode ?? "",
    customer_name:   (s) => s.shipTo?.name ?? "",
    order_date:      (s) => s.createDate ? s.createDate.split("T")[0] : "",
    shipment_id:     (s) => String(s.shipmentId ?? ""),
  };

  const SS_FIELD_LABELS: Record<string, string> = {
    order_number:    "Order Number",
    tracking_number: "Tracking Number",
    shipping_cost:   "Shipping Cost",
    ship_date:       "Ship Date",
    carrier:         "Carrier",
    service:         "Service",
    customer_name:   "Customer Name",
    order_date:      "Order Date",
    shipment_id:     "Shipment ID",
  };

  function buildFileContent(shipments: any[], fields: string[], format: "csv" | "txt"): string {
    const sep = format === "csv" ? "," : "\t";
    const header = fields.map((f) => SS_FIELD_LABELS[f] ?? f).join(sep);
    const rows = shipments.map((s) =>
      fields.map((f) => {
        const val = SS_FIELD_MAP[f] ? SS_FIELD_MAP[f](s) : "";
        if (format === "csv") {
          const escaped = val.replace(/"/g, '""');
          return escaped.includes(",") || escaped.includes('"') || escaped.includes("\n") ? `"${escaped}"` : escaped;
        }
        return val;
      }).join(sep)
    );
    return [header, ...rows].join("\n");
  }

  function buildFileName(base: string, stamp: string, format: "csv" | "txt"): string {
    const ext = `.${format}`;
    if (!stamp || stamp === "none") return `${base}${ext}`;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const y = now.getFullYear();
    const m = pad(now.getMonth() + 1);
    const d = pad(now.getDate());
    const H = pad(now.getHours());
    const M = pad(now.getMinutes());
    if (stamp === "YYYY-MM-DD") return `${base}_${y}-${m}-${d}${ext}`;
    if (stamp === "YYYYMMDD") return `${base}_${y}${m}${d}${ext}`;
    if (stamp === "YYYYMMDD_HHmm") return `${base}_${y}${m}${d}_${H}${M}${ext}`;
    return `${base}${ext}`;
  }

  function buildDateRange(window: string, customStart?: string, customEnd?: string, lastExport?: string | null): { start: string; end: string } {
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} 00:00:00`;
    const fmtEnd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} 23:59:59`;
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (window === "today") return { start: fmt(today), end: fmtEnd(today) };
    if (window === "yesterday") return { start: fmt(yesterday), end: fmtEnd(yesterday) };
    if (window === "since_last_export") {
      const start = lastExport ? lastExport : fmt(yesterday);
      return { start, end: fmtEnd(today) };
    }
    if (window === "custom" && customStart && customEnd) {
      return { start: `${customStart} 00:00:00`, end: `${customEnd} 23:59:59` };
    }
    return { start: fmt(yesterday), end: fmtEnd(today) };
  }

  async function fetchAllShipments(apiKey: string, apiSecret: string, status: string, dateStart: string, dateEnd: string): Promise<any[]> {
    const pageSize = 500;
    let page = 1;
    const all: any[] = [];
    while (true) {
      const statusParam = status === "all" ? "" : `&shipmentStatus=${status === "shipped" ? "shipped" : "delivered"}`;
      const data = await ssApiGet(apiKey, apiSecret,
        `/shipments?shipDateStart=${encodeURIComponent(dateStart)}&shipDateEnd=${encodeURIComponent(dateEnd)}${statusParam}&pageSize=${pageSize}&page=${page}`
      );
      const items: any[] = data.shipments ?? [];
      all.push(...items);
      if (all.length >= (data.total ?? items.length) || items.length < pageSize) break;
      page++;
    }
    return all;
  }

  async function uploadFile(ftpCfg: any, fileName: string, content: string): Promise<void> {
    const host = ftpCfg.host ?? "";
    const port = parseInt(ftpCfg.port ?? "21");
    const username = ftpCfg.username ?? "";
    const password = ftpCfg.password ?? "";
    const remoteFolder = ftpCfg.remote_folder ?? "/";
    const remotePath = `${remoteFolder.replace(/\/+$/, "")}/${fileName}`;

    if (ftpCfg.protocol === "sftp") {
      const sftp = new SftpClient();
      try {
        await sftp.connect({ host, port: parseInt(ftpCfg.port ?? "22"), username, password });
        await sftp.put(Buffer.from(content, "utf-8"), remotePath);
      } finally {
        await sftp.end();
      }
    } else {
      const client = new FtpClientLib.Client();
      client.ftp.verbose = false;
      try {
        await client.access({ host, port, user: username, password, secure: false });
        const buf = Buffer.from(content, "utf-8");
        const readable = Readable.from(buf);
        await client.uploadFrom(readable, remotePath);
      } finally {
        client.close();
      }
    }
  }

  async function runShipstationExport(): Promise<void> {
    const creds = await getShipstationCreds();
    if (!creds) throw new Error("ShipStation not configured");

    const exportCfgSetting = await storage.getSetting("shipstation_export_config");
    const exportCfg = exportCfgSetting?.value
      ? (typeof exportCfgSetting.value === "string" ? JSON.parse(exportCfgSetting.value) : exportCfgSetting.value)
      : {};

    const ftpCfgSetting = await storage.getSetting("shipstation_ftp_config");
    const ftpCfg = ftpCfgSetting?.value
      ? (typeof ftpCfgSetting.value === "string" ? JSON.parse(ftpCfgSetting.value) : ftpCfgSetting.value)
      : null;

    const fields: string[] = exportCfg.fields ?? ["order_number", "tracking_number", "shipping_cost", "ship_date"];
    const format: "csv" | "txt" = exportCfg.format ?? "csv";
    const baseName: string = exportCfg.base_file_name ?? "shipping_feed";
    const dateStamp: string = exportCfg.date_stamp ?? "YYYYMMDD";
    const shipmentStatus: string = exportCfg.shipment_status ?? "shipped";
    const exportWindow: string = exportCfg.export_window ?? "since_last_export";
    const customStart: string = exportCfg.custom_start ?? "";
    const customEnd: string = exportCfg.custom_end ?? "";

    const lastExportSetting = await storage.getSetting("shipstation_last_export");
    const lastExport: string | null = lastExportSetting?.value?.timestamp ?? null;

    const { start, end } = buildDateRange(exportWindow, customStart, customEnd, lastExport);

    let shipments: any[] = [];
    let historyEntry: any;
    const fileName = buildFileName(baseName, dateStamp, format);

    try {
      shipments = await fetchAllShipments(creds.apiKey, creds.apiSecret, shipmentStatus, start, end);
      const content = buildFileContent(shipments, fields, format);

      if (ftpCfg?.host) {
        await uploadFile(ftpCfg, fileName, content);
      }

      historyEntry = {
        file_name: fileName,
        record_count: shipments.length,
        status: "success",
        file_content: content,
      };

      await storage.setSetting("shipstation_last_export", {
        timestamp: new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, ""),
      });
    } catch (err: any) {
      historyEntry = {
        file_name: fileName,
        record_count: 0,
        status: "failed",
        error_message: err.message,
        file_content: null,
      };
      throw err;
    } finally {
      await storage.createShipstationExportHistory(historyEntry);
    }
  }

  async function initShipstationScheduler(): Promise<void> {
    if (ssExportCronJob) { ssExportCronJob.stop(); ssExportCronJob = null; }
    const exportCfgSetting = await storage.getSetting("shipstation_export_config");
    if (!exportCfgSetting?.value) return;
    const cfg = typeof exportCfgSetting.value === "string" ? JSON.parse(exportCfgSetting.value) : exportCfgSetting.value;
    const schedule: string = cfg.schedule ?? "manual_only";
    if (schedule === "manual_only") return;

    let cronExpr = "0 * * * *";
    if (schedule === "every_2h")  cronExpr = "0 */2 * * *";
    else if (schedule === "every_4h") cronExpr = "0 */4 * * *";
    else if (schedule === "every_6h") cronExpr = "0 */6 * * *";
    else if (schedule === "daily") {
      const time: string = cfg.daily_time ?? "18:00";
      const [hStr, mStr] = time.split(":");
      const h = parseInt(hStr ?? "18");
      const m = parseInt(mStr ?? "0");
      cronExpr = `${m} ${h} * * *`;
    }

    ssExportCronJob = cron.schedule(cronExpr, async () => {
      try { await runShipstationExport(); } catch {}
    });
  }

  // Initialise scheduler on startup
  initShipstationScheduler().catch(() => {});

  // GET shipstation config (masked)
  app.get("/api/shipstation/config", requireAuth, async (req, res) => {
    try {
      const s = await storage.getSetting("shipstation_config");
      const val = s?.value ? (typeof s.value === "string" ? JSON.parse(s.value) : s.value) : {};
      const lastSyncSetting = await storage.getSetting("shipstation_last_sync");
      const lastExportSetting = await storage.getSetting("shipstation_last_export");
      res.json({
        apiKey: val.apiKey ?? "",
        apiSecret: val.apiSecret ? "••••••••" : "",
        hasSecret: !!(val.apiSecret),
        lastSync: lastSyncSetting?.value?.timestamp ?? null,
        lastExport: lastExportSetting?.value?.timestamp ?? null,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST save shipstation config
  app.post("/api/shipstation/config", requireAuth, async (req, res) => {
    try {
      const { apiKey, apiSecret } = req.body as { apiKey: string; apiSecret: string };
      const existing = await storage.getSetting("shipstation_config");
      const existingVal = existing?.value ? (typeof existing.value === "string" ? JSON.parse(existing.value) : existing.value) : {};
      const newSecret = apiSecret === "••••••••" ? (existingVal.apiSecret ?? "") : apiSecret;
      await storage.setSetting("shipstation_config", { apiKey: apiKey?.trim(), apiSecret: newSecret?.trim() });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST test ShipStation connection
  app.post("/api/shipstation/test-connection", requireAuth, async (req, res) => {
    try {
      const { apiKey, apiSecret } = req.body as { apiKey: string; apiSecret: string };
      let resolvedSecret = apiSecret;
      if (apiSecret === "••••••••") {
        const existing = await storage.getSetting("shipstation_config");
        const val = existing?.value ? (typeof existing.value === "string" ? JSON.parse(existing.value) : existing.value) : {};
        resolvedSecret = val.apiSecret ?? "";
      }
      const data = await ssApiGet(apiKey, resolvedSecret, "/accounts/listtags");
      await storage.setSetting("shipstation_last_sync", { timestamp: new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "") });
      res.json({ success: true, message: "Connection successful" });
    } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
  });

  // GET export config
  app.get("/api/shipstation/export-config", requireAuth, async (req, res) => {
    try {
      const s = await storage.getSetting("shipstation_export_config");
      const val = s?.value ? (typeof s.value === "string" ? JSON.parse(s.value) : s.value) : {};
      res.json({
        fields: val.fields ?? ["order_number", "tracking_number", "shipping_cost", "ship_date"],
        schedule: val.schedule ?? "manual_only",
        daily_time: val.daily_time ?? "18:00",
        shipment_status: val.shipment_status ?? "shipped",
        export_window: val.export_window ?? "since_last_export",
        custom_start: val.custom_start ?? "",
        custom_end: val.custom_end ?? "",
        base_file_name: val.base_file_name ?? "shipping_feed",
        date_stamp: val.date_stamp ?? "YYYYMMDD",
        format: val.format ?? "csv",
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST save export config
  app.post("/api/shipstation/export-config", requireAuth, async (req, res) => {
    try {
      await storage.setSetting("shipstation_export_config", req.body);
      await initShipstationScheduler();
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET FTP config (password masked)
  app.get("/api/shipstation/ftp-config", requireAuth, async (req, res) => {
    try {
      const s = await storage.getSetting("shipstation_ftp_config");
      const val = s?.value ? (typeof s.value === "string" ? JSON.parse(s.value) : s.value) : {};
      res.json({
        protocol: val.protocol ?? "ftp",
        host: val.host ?? "",
        port: val.port ?? (val.protocol === "sftp" ? "22" : "21"),
        username: val.username ?? "",
        password: val.password ? "••••••••" : "",
        hasPassword: !!(val.password),
        remote_folder: val.remote_folder ?? "/",
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST save FTP config
  app.post("/api/shipstation/ftp-config", requireAuth, async (req, res) => {
    try {
      const { protocol, host, port, username, password, remote_folder } = req.body;
      const existing = await storage.getSetting("shipstation_ftp_config");
      const existingVal = existing?.value ? (typeof existing.value === "string" ? JSON.parse(existing.value) : existing.value) : {};
      const newPassword = password === "••••••••" ? (existingVal.password ?? "") : password;
      await storage.setSetting("shipstation_ftp_config", { protocol, host, port, username, password: newPassword, remote_folder });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST test FTP connection
  app.post("/api/shipstation/ftp-test", requireAuth, async (req, res) => {
    try {
      const { protocol, host, port, username, password, remote_folder } = req.body;
      let resolvedPassword = password;
      if (password === "••••••••") {
        const existing = await storage.getSetting("shipstation_ftp_config");
        const val = existing?.value ? (typeof existing.value === "string" ? JSON.parse(existing.value) : existing.value) : {};
        resolvedPassword = val.password ?? "";
      }
      if (!host) return res.status(400).json({ success: false, error: "Host is required" });

      if (protocol === "sftp") {
        const sftp = new SftpClient();
        try {
          await sftp.connect({ host, port: parseInt(port ?? "22"), username, password: resolvedPassword });
          await sftp.end();
        } catch (e: any) { return res.status(400).json({ success: false, error: e.message }); }
      } else {
        const client = new FtpClientLib.Client();
        client.ftp.verbose = false;
        try {
          await client.access({ host, port: parseInt(port ?? "21"), user: username, password: resolvedPassword, secure: false });
          client.close();
        } catch (e: any) { return res.status(400).json({ success: false, error: e.message }); }
      }
      res.json({ success: true, message: "Connection successful" });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  // POST run export
  app.post("/api/shipstation/export/run", requireAuth, async (req, res) => {
    try {
      await runShipstationExport();
      res.json({ success: true, message: "Export completed successfully" });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // GET export history
  app.get("/api/shipstation/export/history", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(String(req.query.limit ?? "50"));
      const history = await storage.getShipstationExportHistory(limit);
      res.json(history.map((h) => ({ ...h, file_content: undefined })));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET download export file
  app.get("/api/shipstation/export/history/:id/download", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const entry = await storage.getShipstationExportHistoryById(id);
      if (!entry) return res.status(404).json({ error: "Not found" });
      if (!entry.file_content) return res.status(404).json({ error: "No file content stored" });
      const ext = entry.file_name.endsWith(".txt") ? "txt" : "csv";
      const ct = ext === "csv" ? "text/csv" : "text/plain";
      res.setHeader("Content-Type", ct);
      res.setHeader("Content-Disposition", `attachment; filename="${entry.file_name}"`);
      res.send(entry.file_content);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CRM — Customer Mirror Routes
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Minimal XLSX generator (ZIP/OOXML, no external deps) ──────────────────
  function crmCrc32(buf: Buffer): number {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) { let c = i; for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[i] = c; }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function buildXlsx(headers: string[], rows: string[][]): Buffer {
    const xe = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const colLetter = (i: number) => i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26));
    const allRows = [headers, ...rows];
    const rowsXml = allRows.map((row, ri) =>
      `<row r="${ri + 1}">${row.map((cell, ci) => `<c r="${colLetter(ci)}${ri + 1}" t="inlineStr"><is><t>${xe(cell)}</t></is></c>`).join("")}</row>`
    ).join("");
    const sheetXml = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`;
    const files = new Map<string, string>([
      ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
      ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Customers" sheetId="1" r:id="rId1"/></sheets></workbook>`],
      ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
      ["xl/worksheets/sheet1.xml", sheetXml],
    ]);
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;
    let count = 0;
    for (const [name, content] of files) {
      const nb = Buffer.from(name, "utf8");
      const db2 = Buffer.from(content, "utf8");
      const crc = crmCrc32(db2);
      const lh = Buffer.allocUnsafe(30 + nb.length);
      lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(0, 8);
      lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(db2.length, 18);
      lh.writeUInt32LE(db2.length, 22); lh.writeUInt16LE(nb.length, 26); lh.writeUInt16LE(0, 28); nb.copy(lh, 30);
      localParts.push(lh, db2);
      const cd = Buffer.allocUnsafe(46 + nb.length);
      cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0, 8);
      cd.writeUInt16LE(0, 10); cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0, 14); cd.writeUInt32LE(crc, 16);
      cd.writeUInt32LE(db2.length, 20); cd.writeUInt32LE(db2.length, 24); cd.writeUInt16LE(nb.length, 28);
      cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32); cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36);
      cd.writeUInt32LE(0, 38); cd.writeUInt32LE(offset, 42); nb.copy(cd, 46);
      centralParts.push(cd);
      offset += 30 + nb.length + db2.length;
      count++;
    }
    const cdBuf = Buffer.concat(centralParts);
    const eocd = Buffer.allocUnsafe(22);
    eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(count, 8); eocd.writeUInt16LE(count, 10);
    eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
    return Buffer.concat([...localParts, cdBuf, eocd]);
  }

  // GET /api/crm/status
  app.get("/api/crm/status", requireAuth, async (_req, res) => {
    try {
      const [customer_count, order_count, lastCustSync, lastOrderSync, lastStatsRecalc] = await Promise.all([
        storage.getCrmCustomerCount(),
        storage.getCrmOrderCount(),
        storage.getSetting("crm_last_customer_sync"),
        storage.getSetting("crm_last_order_sync"),
        storage.getSetting("crm_last_stats_recalc"),
      ]);
      res.json({
        customer_count,
        order_count,
        last_customer_sync: lastCustSync?.value ?? null,
        last_order_sync: lastOrderSync?.value ?? null,
        last_stats_recalc: lastStatsRecalc?.value ?? null,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/crm/recalculate-stats
  app.post("/api/crm/recalculate-stats", requireAuth, async (_req, res) => {
    try {
      const { updated, customers_in_orders, duration_ms } = await storage.recalculateCrmCustomerStats();
      await storage.setSetting("crm_last_stats_recalc", new Date().toISOString());
      res.json({ success: true, updated, customers_in_orders, duration_ms });
    } catch (e: any) {
      console.error("[CRM] recalculate-stats error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/crm/sync/customers
  app.post("/api/crm/sync/customers", requireAuth, async (_req, res) => {
    try {
      const bcSetting = await storage.getSetting("bigcommerce_config");
      let storeHash = process.env.BC_STORE_HASH;
      let token = process.env.BC_TOKEN;
      if (bcSetting?.value) {
        const cfg = typeof bcSetting.value === "string" ? JSON.parse(bcSetting.value) : bcSetting.value;
        storeHash = cfg.storeHash || storeHash;
        token = cfg.token || token;
      }
      if (!storeHash || !token) return res.status(400).json({ error: "BigCommerce not configured" });

      // Prefetch store credit from v2 API (v3 does not expose store_credit_amount)
      const storeCreditMap: Record<number, string> = {};
      let scPage = 1;
      while (true) {
        const scRes = await fetch(`https://api.bigcommerce.com/stores/${storeHash}/v2/customers?limit=250&page=${scPage}`, {
          headers: { "X-Auth-Token": String(token), Accept: "application/json" },
        });
        if (!scRes.ok || scRes.status === 204) break;
        const scData: any[] = await scRes.json();
        if (!Array.isArray(scData) || scData.length === 0) break;
        for (const c of scData) {
          if (c.id != null && c.store_credit_amount != null) {
            storeCreditMap[c.id] = String(c.store_credit_amount);
          }
        }
        if (scData.length < 250) break;
        scPage++;
      }

      // Prefetch all customer groups for name resolution
      const cgRes = await fetch(`https://api.bigcommerce.com/stores/${storeHash}/v2/customer_groups?limit=200`, {
        headers: { "X-Auth-Token": String(token), Accept: "application/json" },
      });
      const cgData: any[] = cgRes.ok ? await cgRes.json() : [];
      const groupNameMap: Record<number, string> = {};
      for (const g of cgData) groupNameMap[g.id] = g.name;

      let page = 1;
      let synced = 0;
      while (true) {
        const url = `https://api.bigcommerce.com/stores/${storeHash}/v3/customers?include=addresses&limit=250&page=${page}`;
        const r = await fetch(url, { headers: { "X-Auth-Token": String(token), Accept: "application/json" } });
        if (!r.ok) break;
        const json = await r.json();
        const bcCustomers: any[] = json.data ?? [];
        if (bcCustomers.length === 0) break;
        for (const bc of bcCustomers) {
          const billing = bc.addresses?.find((a: any) => a.address_type === "commercial") ?? bc.addresses?.[0] ?? null;
          const shipping = bc.addresses?.find((a: any) => a.address_type === "residential") ?? null;
          await storage.upsertCrmCustomer({
            bigcommerce_customer_id: bc.id,
            company: bc.company || null,
            first_name: bc.first_name || "",
            last_name: bc.last_name || "",
            email: bc.email || "",
            phone: bc.phone || null,
            customer_group_id: bc.customer_group_id || null,
            customer_group_name: groupNameMap[bc.customer_group_id] ?? null,
            billing_address: billing ? { street1: billing.address1, street2: billing.address2, city: billing.city, state: billing.state_or_province, zip: billing.postal_code, country: billing.country } : null,
            shipping_address: shipping ? { street1: shipping.address1, street2: shipping.address2, city: shipping.city, state: shipping.state_or_province, zip: shipping.postal_code, country: shipping.country } : null,
            created_date: bc.date_created ? new Date(bc.date_created) : null,
            is_active: true,
            store_credit_balance: storeCreditMap[bc.id] ?? "0",
          });
          synced++;
        }
        if (bcCustomers.length < 250) break;
        page++;
      }
      await storage.setSetting("crm_last_customer_sync", new Date().toISOString());
      res.json({ success: true, synced });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/crm/sync/orders
  app.post("/api/crm/sync/orders", requireAuth, async (_req, res) => {
    try {
      const bcSetting2 = await storage.getSetting("bigcommerce_config");
      let storeHash = process.env.BC_STORE_HASH;
      let token = process.env.BC_TOKEN;
      if (bcSetting2?.value) {
        const cfg = typeof bcSetting2.value === "string" ? JSON.parse(bcSetting2.value) : bcSetting2.value;
        storeHash = cfg.storeHash || storeHash;
        token = cfg.token || token;
      }
      if (!storeHash || !token) return res.status(400).json({ error: "BigCommerce not configured" });
      let page = 1;
      let synced = 0;
      while (true) {
        const url = `https://api.bigcommerce.com/stores/${storeHash}/v2/orders?limit=250&page=${page}&sort=id:desc`;
        const r = await fetch(url, { headers: { "X-Auth-Token": String(token), Accept: "application/json" } });
        if (!r.ok || r.status === 204) break;
        const bcOrders: any[] = await r.json();
        if (!Array.isArray(bcOrders) || bcOrders.length === 0) break;
        for (const o of bcOrders) {
          if (!o.customer_id || o.customer_id === 0) continue;
          const customerName = [o.billing_address?.first_name, o.billing_address?.last_name].filter(Boolean).join(" ");
          await storage.upsertCrmOrder({
            bigcommerce_order_id: o.id,
            bigcommerce_customer_id: o.customer_id,
            order_number: o.id,
            order_date: o.date_created ? new Date(o.date_created) : null,
            order_total: String(o.total_inc_tax || "0"),
            status: o.status || null,
            payment_status: o.payment_status || null,
            customer_name: customerName || null,
            customer_email: o.billing_address?.email || null,
            staff_notes: o.staff_notes || o.order_note || null,
            customer_order_notes: o.customer_message || null,
          });
          synced++;
        }
        if (bcOrders.length < 250) break;
        page++;
      }
      await storage.recalculateCrmCustomerStats();
      await storage.setSetting("crm_last_order_sync", new Date().toISOString());
      res.json({ success: true, synced });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/crm/filters
  app.get("/api/crm/filters", requireAuth, async (_req, res) => {
    try {
      const opts = await storage.getCrmFilterOptions();
      res.json(opts);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/crm/customers/export — registered BEFORE /:id to avoid route conflict
  app.get("/api/crm/customers/export", requireAuth, async (req, res) => {
    try {
      const { search = "", sortBy = "last_order_date", sortDir = "desc", format = "csv", group = "", state = "", health = "" } = req.query as any;
      const customers = await storage.getAllCrmCustomersForExport({ search, group: group || undefined, state: state || undefined, health: health || undefined, sortBy, sortDir });
      const headers = ["BC Customer ID", "Company", "First Name", "Last Name", "Email", "Phone", "State", "Customer Group", "Last Order Date", "Lifetime Orders", "Lifetime Revenue", "Sales Rep", "Health Status"];
      const rows = customers.map(c => {
        const addr = (c.shipping_address as any) ?? (c.billing_address as any) ?? {};
        return [
          String(c.bigcommerce_customer_id),
          c.company ?? "",
          c.first_name,
          c.last_name,
          c.email,
          c.phone ?? "",
          addr.state ?? "",
          c.customer_group_name ?? "",
          c.last_order_date ? new Date(c.last_order_date).toISOString().split("T")[0] : "",
          String(c.lifetime_orders ?? 0),
          String(c.lifetime_revenue ?? "0"),
          (c as any).sales_rep_name ?? "",
          c.account_health ?? "Lost",
        ];
      });
      const dateSuffix = new Date().toISOString().split("T")[0];
      if (String(format) === "xlsx") {
        const buf = buildXlsx(headers, rows);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="crm-customers-${dateSuffix}.xlsx"`);
        return res.send(buf);
      }
      const esc = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
      const csv = [headers, ...rows].map(r => r.map(esc).join(",")).join("\r\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="crm-customers-${dateSuffix}.csv"`);
      res.send(csv);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/crm/customers
  app.get("/api/crm/customers", requireAuth, async (req, res) => {
    try {
      const { search = "", sortBy = "last_order_date", sortDir = "desc", group = "", state = "", health = "" } = req.query as any;
      const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
      const offset = parseInt(String(req.query.offset ?? "0"));
      const result = await storage.getCrmCustomers({ search, group: group || undefined, state: state || undefined, health: health || undefined, sortBy, sortDir, limit, offset });
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/crm/health-thresholds
  app.get("/api/crm/health-thresholds", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getHealthThresholds());
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // PUT /api/crm/health-thresholds — saves thresholds and auto-recalculates health
  app.put("/api/crm/health-thresholds", requireAuth, async (req, res) => {
    try {
      const { healthy_days, watch_days, at_risk_days } = req.body;
      const h = Number(healthy_days), w = Number(watch_days), a = Number(at_risk_days);
      if (!Number.isInteger(h) || !Number.isInteger(w) || !Number.isInteger(a) || h < 1 || w <= h || a <= w) {
        return res.status(400).json({ error: "Invalid thresholds: must be positive integers with Healthy < Watch < At Risk" });
      }
      await storage.setHealthThresholds({ healthy_days: h, watch_days: w, at_risk_days: a });
      const recalc = await storage.recalculateCrmCustomerStats();
      res.json({ ok: true, thresholds: { healthy_days: h, watch_days: w, at_risk_days: a }, recalc });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/crm/customers/:id
  app.get("/api/crm/customers/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const customer = await storage.getCrmCustomerById(id);
      if (!customer) return res.status(404).json({ error: "Customer not found" });
      res.json(customer);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/crm/customers/:id/orders
  app.get("/api/crm/customers/:id/orders", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const customer = await storage.getCrmCustomerById(id);
      if (!customer) return res.status(404).json({ error: "Customer not found" });
      const orders = await storage.getCrmOrdersByBcCustomerId(customer.bigcommerce_customer_id, 10000);
      res.json(orders);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // PUT /api/crm/customers/:id/sales-rep
  app.put("/api/crm/customers/:id/sales-rep", requireAuth, async (req, res) => {
    try {
      const customerId = parseInt(req.params.id);
      const { assigned_user_id } = req.body;
      if (!assigned_user_id) return res.status(400).json({ error: "assigned_user_id required" });
      const rep = await storage.setCrmSalesRep({ customer_id: customerId, assigned_user_id: parseInt(assigned_user_id), assigned_by: (req as any).userId ?? null });
      const repUser = await storage.getUser(parseInt(assigned_user_id));
      await storage.createCrmAuditLog({ user_id: (req as any).userId ?? null, action: 'sales_rep_assigned', customer_id: customerId, detail: { rep_name: repUser?.name ?? null, assigned_user_id: parseInt(assigned_user_id) } });
      res.json(rep);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // DELETE /api/crm/customers/:id/sales-rep
  app.delete("/api/crm/customers/:id/sales-rep", requireAuth, async (req, res) => {
    try {
      const customerId = parseInt(req.params.id);
      await storage.removeCrmSalesRep(customerId);
      await storage.createCrmAuditLog({ user_id: (req as any).userId ?? null, action: 'sales_rep_removed', customer_id: customerId, detail: {} });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── CRM Notes ──────────────────────────────────────────────────────────────

  // Shared helper: get BC credentials from settings / env
  async function getBcCreds() {
    const setting = await storage.getSetting("bigcommerce_config");
    let storeHash = process.env.BC_STORE_HASH;
    let token = process.env.BC_TOKEN;
    if (setting?.value) {
      const cfg = typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value;
      storeHash = cfg.storeHash || storeHash;
      token = cfg.token || token;
    }
    return { storeHash, token };
  }

  // GET /api/crm/notes  — global notes page
  app.get("/api/crm/notes", requireAuth, async (req, res) => {
    try {
      const { search = "", type = "", createdBy, customerId, orderId, customerGroup = "", state = "", dateFrom = "", dateTo = "" } = req.query as Record<string, string>;
      const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
      const offset = parseInt(String(req.query.offset ?? "0"));
      const result = await storage.getAllCrmNotes({
        search, type: type || undefined, createdBy: createdBy ? parseInt(createdBy) : undefined,
        customerId: customerId ? parseInt(customerId) : undefined, orderId: orderId ? parseInt(orderId) : undefined,
        customerGroup: customerGroup || undefined, state: state || undefined,
        dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, limit, offset,
      });
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/crm/notes/kpis
  app.get("/api/crm/notes/kpis", requireAuth, async (_req, res) => {
    try {
      const kpis = await storage.getCrmNotesKpis();
      res.json(kpis);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/crm/customers/:id/notes
  app.get("/api/crm/customers/:id/notes", requireAuth, async (req, res) => {
    try {
      const customerId = parseInt(req.params.id);
      const notes = await storage.getCrmNotes(customerId);
      res.json(notes);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/crm/customers/:id/notes
  app.post("/api/crm/customers/:id/notes", requireAuth, async (req, res) => {
    try {
      const customerId = parseInt(req.params.id);
      const { note, note_type = "General", order_id, bc_target = "crm" } = req.body;
      if (!note?.trim()) return res.status(400).json({ error: "note is required" });

      const created = await storage.createCrmNote({
        customer_id: customerId, note: note.trim(), note_type,
        order_id: order_id ? parseInt(String(order_id)) : null,
        created_by: (req as any).userId ?? null,
      });

      const auditAction = note_type === "Order Note" ? "order_note_created" : "note_created";
      await storage.createCrmAuditLog({
        user_id: (req as any).userId ?? null, action: auditAction, customer_id: customerId,
        detail: { note_type, note_preview: note.trim().slice(0, 120), order_id: order_id ?? null },
      });

      // Optional BC sync
      if (order_id && (bc_target === "staff" || bc_target === "customer" || bc_target === "both")) {
        try {
          const { storeHash, token } = await getBcCreds();
          if (storeHash && token) {
            const body: Record<string, string> = {};
            if (bc_target === "staff" || bc_target === "both") body.staff_notes = note.trim();
            if (bc_target === "customer" || bc_target === "both") body.customer_message = note.trim();
            const bcResp = await fetch(`https://api.bigcommerce.com/stores/${storeHash}/v2/orders/${order_id}`, {
              method: "PUT",
              headers: { "X-Auth-Token": String(token), "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify(body),
            });
            if (bcResp.ok) {
              const updated: Record<string, string> = {};
              if (body.staff_notes !== undefined) updated.staff_notes = body.staff_notes;
              if (body.customer_message !== undefined) updated.customer_order_notes = body.customer_message;
              await storage.updateCrmOrderNotes(parseInt(String(order_id)), updated);
            }
          }
        } catch (_) { /* BC sync failure is non-fatal */ }
      }

      res.status(201).json(created);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // PUT /api/crm/customers/:id/notes/:noteId
  app.put("/api/crm/customers/:id/notes/:noteId", requireAuth, async (req, res) => {
    try {
      const customerId = parseInt(req.params.id);
      const noteId = parseInt(req.params.noteId);
      const { note, note_type, order_id } = req.body;
      const updated = await storage.updateCrmNote(noteId, {
        note: note?.trim(), note_type,
        order_id: order_id !== undefined ? (order_id ? parseInt(String(order_id)) : null) : undefined,
      });
      await storage.createCrmAuditLog({
        user_id: (req as any).userId ?? null, action: 'note_edited', customer_id: customerId,
        detail: { note_type: updated.note_type, note_preview: updated.note.slice(0, 120) },
      });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // DELETE /api/crm/customers/:id/notes/:noteId
  app.delete("/api/crm/customers/:id/notes/:noteId", requireAuth, async (req, res) => {
    try {
      const customerId = parseInt(req.params.id);
      const noteId = parseInt(req.params.noteId);
      const existing = await storage.getCrmNoteById(noteId);
      if (existing) {
        await storage.createCrmAuditLog({
          user_id: (req as any).userId ?? null, action: 'note_deleted', customer_id: customerId,
          detail: { note_type: existing.note_type, note_preview: existing.note.slice(0, 120), order_id: existing.order_id ?? null },
        });
      }
      await storage.deleteCrmNote(noteId);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // PUT /api/crm/customers/:id/orders/:orderId/notes  — editable order notes popup
  app.put("/api/crm/customers/:id/orders/:orderId/notes", requireAuth, async (req, res) => {
    try {
      const customerId = parseInt(req.params.id);
      const bcOrderId = parseInt(req.params.orderId);
      const { customer_note, staff_notes } = req.body;

      // Update local mirror
      await storage.updateCrmOrderNotes(bcOrderId, {
        ...(staff_notes !== undefined ? { staff_notes } : {}),
        ...(customer_note !== undefined ? { customer_order_notes: customer_note } : {}),
      });

      // Push to BC
      let bcSuccess = false;
      try {
        const { storeHash, token } = await getBcCreds();
        if (storeHash && token) {
          const body: Record<string, string> = {};
          if (staff_notes !== undefined) body.staff_notes = staff_notes;
          if (customer_note !== undefined) body.customer_message = customer_note;
          const bcResp = await fetch(`https://api.bigcommerce.com/stores/${storeHash}/v2/orders/${bcOrderId}`, {
            method: "PUT",
            headers: { "X-Auth-Token": String(token), "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(body),
          });
          bcSuccess = bcResp.ok;
        }
      } catch (_) { /* BC failure is non-fatal */ }

      // Audit log
      const auditEntries: Promise<void>[] = [];
      if (staff_notes !== undefined) {
        auditEntries.push(storage.createCrmAuditLog({
          user_id: (req as any).userId ?? null, action: 'staff_note_updated', customer_id: customerId,
          detail: { bc_order_id: bcOrderId },
        }));
      }
      if (customer_note !== undefined) {
        auditEntries.push(storage.createCrmAuditLog({
          user_id: (req as any).userId ?? null, action: 'customer_note_updated', customer_id: customerId,
          detail: { bc_order_id: bcOrderId },
        }));
      }
      await Promise.all(auditEntries);

      res.json({ success: true, bc_synced: bcSuccess });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/crm/customers/:id/timeline
  app.get("/api/crm/customers/:id/timeline", requireAuth, async (req, res) => {
    try {
      const customerId = parseInt(req.params.id);
      const timeline = await storage.getCrmTimeline(customerId);
      res.json(timeline);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/crm/reactivation
  app.get("/api/crm/reactivation", requireAuth, async (req, res) => {
    try {
      const { search = "", group = "", state = "", health = "", rep, sortBy = "last_order_date", sortDir = "asc" } = req.query as Record<string, string>;
      const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
      const offset = parseInt(String(req.query.offset ?? "0"));
      const result = await storage.getReactivationCustomers({ search, group, state, health, rep: rep ? parseInt(rep) : undefined, sortBy, sortDir, limit, offset });
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/crm/metrics
  app.get("/api/crm/metrics", requireAuth, async (req, res) => {
    try {
      const { search = "", group = "", state = "" } = req.query as Record<string, string>;
      const metrics = await storage.getCrmMetrics({ search, group, state });
      res.json(metrics);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/crm/users
  app.get("/api/crm/users", requireAuth, async (_req, res) => {
    try {
      const users = await storage.getCrmUsers();
      res.json(users);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  return httpServer;
}
