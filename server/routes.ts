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
table.items th:nth-child(2), table.items th:nth-child(3) { text-align: right; }
table.items td { padding: 9px 6px; border-bottom: 1px solid #efefef; vertical-align: top; font-size: 12px; }
table.items td:nth-child(2), table.items td:nth-child(3) { text-align: right; white-space: nowrap; }
.item-name { font-size: 12px; line-height: 1.5; }
.item-meta { font-size: 10px; color: #888; margin-top: 3px; }
.price-strike { display: block; text-decoration: line-through; color: #aaa; font-size: 10px; margin-top: 2px; }
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
    <strong>Customer: : {{customer_name}}</strong><br>
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
  <thead><tr><th>Item</th><th>Unit</th><th>Sales (ex. tax)</th></tr></thead>
  <tbody>{{items_rows}}</tbody>
</table>
<div class="totals-wrap">
  <table class="totals">
    <tr><td>Subtotal</td><td>{{subtotal}}</td></tr>
    <tr><td>Discount</td><td>{{discount}}</td></tr>
    <tr><td>Tax(No Tax)</td><td>{{tax}}</td></tr>
    <tr class="grand-total"><td>Total</td><td>{{total}}</td></tr>
    <tr><td>Unpaid</td><td>{{unpaid}}</td></tr>
  </table>
</div>
<div class="outstanding-row">
  <div><span class="outstanding-label">Outstanding:</span> <span class="outstanding-amount">{{outstanding}}</span></div>
  <span class="items-count">Total items in cart &nbsp;&nbsp; {{total_items}}</span>
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

            const bcOrderData = {
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
            `&page=${page}&limit=${limit}`,
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
      const products = await productsRes.json();
      res.json({ order, products: Array.isArray(products) ? products : [] });
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
      const { to, subject, html } = req.body as { to: string; subject: string; html: string };
      if (!to || !subject || !html) return res.status(400).json({ error: "Missing required fields: to, subject, html" });

      const setting = await storage.getSetting("invoice_settings").catch(() => null);
      const cfg = setting?.value ?? {};

      const smtpHost = cfg.smtp_host || "";
      const smtpPort = Number(cfg.smtp_port) || 587;
      const smtpUser = cfg.smtp_user || "";
      const smtpPass = cfg.smtp_pass || "";
      const smtpFrom = cfg.smtp_from || smtpUser;

      if (!smtpHost || !smtpUser) {
        return res.status(400).json({ error: "SMTP is not configured. Please set SMTP settings in Invoice Settings." });
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({ from: smtpFrom, to, subject, html });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return httpServer;
}
