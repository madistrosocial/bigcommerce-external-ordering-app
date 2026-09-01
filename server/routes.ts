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
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { addSkuVaultInventory, setSkuVaultInventory, getSkuVaultInventory, resolveSkuLocation, testSkuVaultConnection, getLiveSkuQuantities, type SkuVaultConfig } from "./skuvault";
import { getMarketingSenderSettings, normalizeMarketingSenderSettings, processMarketingCampaign, processMarketingQueue, sanitizeMarketingEditorHtml, sendMarketingTestEmail, verifyMarketingClickToken, verifyMarketingUnsubscribeToken } from "./marketing";
import { normalizeMarketingProductDisplayOptions } from "@shared/marketing-products";

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
.store-credit-row td { color: #1a7f4b; font-weight: 600; }
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
    {{store_credit_row}}
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

function parseMarketingCsv(input: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field.trim()); field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field.trim()); field = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field || row.length) {
    row.push(field.trim());
    if (row.some(Boolean)) rows.push(row);
  }
  const headers = (rows.shift() ?? []).map(h => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  return { headers, rows };
}

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

// ── Native BC Store Credit via OAuth Customer Login JWT ───────────────────────
// Flow:
//   1. Sync CRM balance → BC via PUT /v3/customers store_credit_amounts
//   2. Get storefront impersonation token (for GraphQL auth)
//   3. Create management API cart with price overrides (preserves POS pricing)
//   4. Sign Customer Login JWT with OAuth client_secret (HMAC-SHA256 / HS256)
//   5. GraphQL loginWithCustomerLoginJwt → customerAccessToken (server-to-server)
//   6. POST /api/storefront/checkouts/{id}/store-credit with customerAccessToken
//   7. POST /v3/checkouts/{id}/orders → BC order with native store_credit_amount
//   8. Read updated BC balance and return it (BC is authoritative after checkout)
// Uses Customer Login JWT (/login/token/{jwt}) to get a real browser session cookie,
// then applies store credit via the storefront REST API with that cookie.
// The /v3/checkouts/{id}/store-credit management API returns 404 on this store.
async function createBcOrderNativeStoreCredit(
  storeHash: string,
  token: string,
  storefrontDomain: string,
  clientId: string | null,
  clientSecret: string | null,
  channelId: number,
  order: any,
  storeCreditAmt: number,
): Promise<{ bcOrderId: number; bcCreditRemaining: number }> {
  const h: Record<string, string> = {
    "X-Auth-Token": token,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const bcCustomerId = order.bigcommerce_customer_id as number;

  // 1. Read CRM balance and write it to BC (makes BC authoritative balance match CRM)
  const crmCustomer = await storage.getCrmCustomerByBcId(bcCustomerId);
  const crmBalance  = Number(crmCustomer?.store_credit_balance ?? 0);
  console.log(`[sc_native] customer=${bcCustomerId} crmBalance=$${crmBalance} toApply=$${storeCreditAmt}`);

  const setBalRes = await fetch(
    `https://api.bigcommerce.com/stores/${storeHash}/v3/customers`,
    {
      method: "PUT",
      headers: h,
      body: JSON.stringify([{ id: bcCustomerId, store_credit_amounts: [{ amount: crmBalance }] }]),
    },
  );
  if (!setBalRes.ok)
    throw new Error(`Failed to write BC store credit balance (${setBalRes.status}): ${await setBalRes.text()}`);
  console.log(`[sc_native] BC balance set to $${crmBalance}`);

  // 2. Create BC order directly via v2 Orders API with status_id=0 (Incomplete).
  //    This mirrors the standard non-store-credit path (price_inc_tax/price_ex_tax overrides)
  //    and requires no shipping zones or cart/checkout session — the v2 API accepts billing_address
  //    only. status_id=0 is required so the Payments API can accept the order.
  const v2Products = (order.items as any[]).map((item: any) => {
    const productData: any = {
      product_id:    item.bigcommerce_product_id,
      quantity:      item.quantity,
      price_inc_tax: parseFloat(item.price_at_sale),
      price_ex_tax:  parseFloat(item.price_at_sale),
    };
    if (item.variant_option_values && Array.isArray(item.variant_option_values) && item.variant_option_values.length > 0) {
      productData.product_options = item.variant_option_values.map(
        (ov: any) => ({ id: ov.option_id, value: String(ov.id) }),
      );
    }
    return productData;
  });
  const v2OrderRes = await fetch(
    `https://api.bigcommerce.com/stores/${storeHash}/v2/orders`,
    {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        status_id:       0,
        customer_id:     bcCustomerId,
        billing_address: order.billing_address,
        products:        v2Products,
      }),
    },
  );
  if (!v2OrderRes.ok)
    throw new Error(`Order creation failed (${v2OrderRes.status}): ${await v2OrderRes.text()}`);
  const bcOrderId = (await v2OrderRes.json()).id as number;
  console.log(`[sc_native] BC order ${bcOrderId} created via v2 API (Incomplete)`);

  // 4. Get a single-use Payment Access Token (PAT) scoped to this order
  const patRes = await fetch(
    `https://api.bigcommerce.com/stores/${storeHash}/v3/payments/access_tokens`,
    {
      method:  "POST",
      headers: h,
      body:    JSON.stringify({ order: { id: bcOrderId } }),
    },
  );
  if (!patRes.ok)
    throw new Error(`Payment access token failed (${patRes.status}): ${await patRes.text()}`);
  const paymentAccessToken = (await patRes.json())?.data?.id as string | undefined;
  if (!paymentAccessToken) throw new Error("Payment access token missing from response");
  console.log(`[sc_native] PAT obtained (len=${paymentAccessToken.length})`);

  // 5. Apply store credit via Payments API (verified live: HTTP 201, store_credit_amount populated,
  //    order moves to Awaiting Fulfillment, customer BC balance decreases).
  //    instrument.type="store_credit" is required — empty {} causes 422 "Type is invalid".
  const payRes = await fetch(
    `https://payments.bigcommerce.com/stores/${storeHash}/payments`,
    {
      method:  "POST",
      headers: {
        Authorization:  `PAT ${paymentAccessToken}`,
        Accept:         "application/vnd.bc.v1+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payment: {
          instrument:        { type: "store_credit" },
          payment_method_id: "bigcommerce.store_credit",
        },
      }),
    },
  );
  const payBody = await payRes.text();
  console.log(`[sc_native] Payments API (${payRes.status}): ${payBody.slice(0, 300)}`);
  if (!payRes.ok)
    throw new Error(`Store credit payment failed (${payRes.status}): ${payBody.slice(0, 400)}`);

  // 6. Patch staff notes only (Payments API already moves order to Awaiting Fulfillment).
  //    order.order_note is built by the frontend as:
  //      "Checkout by: <name>\nStore Credit Applied: $X.XX\nNotes: <note>"
  await fetch(
    `https://api.bigcommerce.com/stores/${storeHash}/v2/orders/${bcOrderId}`,
    {
      method: "PUT",
      headers: h,
      body: JSON.stringify({
        staff_notes:      order.order_note || undefined,
        customer_message: (order as any).customer_note || undefined,
      }),
    },
  ).catch((e) => console.warn("[sc_native] status patch non-fatal:", e));

  // 11. Read updated BC balance (BC deducted store credit during checkout completion)
  let bcCreditRemaining = 0;
  try {
    const custReadRes = await fetch(
      `https://api.bigcommerce.com/stores/${storeHash}/v2/customers/${bcCustomerId}`,
      { headers: h },
    );
    if (custReadRes.ok) {
      const custReadData = await custReadRes.json();
      bcCreditRemaining = Number(custReadData?.store_credit_amount ?? custReadData?.store_credit ?? 0);
      console.log(`[sc_native] BC balance after order: $${bcCreditRemaining}`);
    }
  } catch (_) { /* non-fatal — CRM sync will use bc_credit_remaining=0 as fallback */ }

  return { bcOrderId, bcCreditRemaining };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // Keep the customer-signup audit table available on every environment before
  // requests are accepted. Older deployments predate this table and do not run
  // a separate migration command during boot.
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS customer_signups (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      bigcommerce_customer_id integer NOT NULL UNIQUE,
      first_name text NOT NULL DEFAULT '',
      last_name text NOT NULL DEFAULT '',
      email text NOT NULL DEFAULT '',
      company text,
      customer_group_id integer,
      customer_group_name text,
      attribution text NOT NULL DEFAULT '',
      shipping_address jsonb,
      signed_up_by_user_id integer NOT NULL REFERENCES users(id),
      signed_up_by_name text NOT NULL DEFAULT '',
      primary_rep_id integer REFERENCES users(id),
      created_at timestamp NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_customer_signups_created_at ON customer_signups (created_at);
    CREATE INDEX IF NOT EXISTS idx_customer_signups_signed_up_by ON customer_signups (signed_up_by_user_id);
    CREATE TABLE IF NOT EXISTS customer_signup_attempts (
      idempotency_key text PRIMARY KEY,
      created_by_user_id integer NOT NULL REFERENCES users(id),
      request_data jsonb NOT NULL,
      bigcommerce_customer_id integer,
      status text NOT NULL DEFAULT 'pending',
      result jsonb,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `));

  // ===== AUTH MIDDLEWARE =====
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) throw new Error("SESSION_SECRET must be configured");
  const sessionLifetimeMs = 1000 * 60 * 60 * 12;

  const issueSessionToken = (userId: number) => {
    const expiresAt = Date.now() + sessionLifetimeMs;
    const payload = `${userId}.${expiresAt}`;
    const signature = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
    return `${payload}.${signature}`;
  };

  const getAuthenticatedUser = async (req: Request) => {
    const header = req.headers.authorization;
    const token = Array.isArray(header) ? header[0] : header;
    const match = token?.match(/^Bearer\s+(\d+)\.(\d+)\.([A-Za-z0-9_-]+)$/i);
    if (!match) return null;
    const [, rawUserId, rawExpiresAt, suppliedSignature] = match;
    const expiresAt = Number(rawExpiresAt);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return null;
    const payload = `${rawUserId}.${rawExpiresAt}`;
    const expectedSignature = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
    if (suppliedSignature.length !== expectedSignature.length) return null;
    if (!timingSafeEqual(Buffer.from(suppliedSignature), Buffer.from(expectedSignature))) return null;
    const user = await storage.getUser(Number(rawUserId)).catch(() => null);
    return user?.is_enabled ? user : null;
  };

  /**
   * Verifies the signed session token and attaches the enabled DB user to req.
   */
  const requireAuth = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    const user = await getAuthenticatedUser(req);
    if (!user) {
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
    const user = await getAuthenticatedUser(req);
    if (!user) {
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
      const user = await getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ error: "Authentication required" });
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
              cost_price: p.cost_price != null ? p.cost_price.toString() : (product.cost_price ?? null),
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
          cost_price: p.cost_price != null ? p.cost_price.toString() : null,
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
            cost_price: p.cost_price != null ? p.cost_price.toString() : null,
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
      res.json({ ...safeUser, auth_token: issueSessionToken(user.id) });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update all user details (name, username, password, role, is_enabled, allow_bigcommerce_search)
  app.put("/api/users/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, username, password, role, is_enabled, allow_bigcommerce_search, default_landing_page } = req.body;
      const update: Record<string, any> = {};
      if (name !== undefined) update.name = name;
      if (username !== undefined) update.username = username;
      if (role !== undefined) update.role = role;
      if (is_enabled !== undefined) update.is_enabled = is_enabled;
      if (allow_bigcommerce_search !== undefined) update.allow_bigcommerce_search = allow_bigcommerce_search;
      if (default_landing_page !== undefined) update.default_landing_page = default_landing_page;
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
      res.json({ ...safeUser, auth_token: issueSessionToken(user.id) });
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
      let bcCreditRemainingAfterOrder: number | undefined;
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
            const cartDiscountAmt = parseFloat((req.body as any).cart_discount_amount ?? "0") || 0;
            const storeCreditAmt = parseFloat((req.body as any).store_credit_amount  ?? "0") || 0;

            // ── Pre-flight stock check (prevents BC partial inventory deduction) ──
            const stockErrors = await checkBcStock(storeHash, token, order.items as any[]);
            if (stockErrors.length > 0) {
              const preview = stockErrors.slice(0, 5).join("; ");
              const suffix  = stockErrors.length > 5 ? ` …and ${stockErrors.length - 5} more` : "";
              bcError = `[{"status":409,"message":"Quantities of one or more products are out of stock or did not meet quantity requirements.","details":{"errors":[{"type":"OutOfStock","message":"Pre-validation: ${stockErrors.length} item(s) with insufficient stock: ${preview}${suffix}"}]}}]`;
              await storage.updateOrderSyncError(order.id!, bcError);
            } else {
              if (storeCreditAmt > 0) {
                // ── Native BC store credit (OAuth required — no discount/GC fallback) ──
                // Throws on failure; error is surfaced to cashier. Cart stays intact.
                const nativeResult = await createBcOrderNativeStoreCredit(
                  storeHash,
                  String(token),
                  String(config.storefrontUrl || ""),
                  config.clientId    ? String(config.clientId)    : null,
                  config.clientSecret ? String(config.clientSecret) : null,
                  Number(config.channelId ?? 1),
                  order,
                  storeCreditAmt,
                );
                bcOrderId = nativeResult.bcOrderId;
                bcSuccess = true;
                bcCreditRemainingAfterOrder = nativeResult.bcCreditRemaining;
                await storage.updateOrderStatus(order.id!, "synced", bcOrderId);
              } else {
                // ── Standard v2 Orders API path (no store credit) ────────────────────
                const bcOrderData: any = {
                  status_id:        1,
                  customer_id:      order.bigcommerce_customer_id || 0,
                  billing_address:  order.billing_address,
                  staff_notes:      order.order_note || undefined,
                  customer_message: (order as any).customer_note || undefined,
                  products: (order.items as any[]).map((item) => {
                    const productData: any = {
                      product_id:    item.bigcommerce_product_id,
                      quantity:      item.quantity,
                      price_inc_tax: parseFloat(item.price_at_sale),
                      price_ex_tax:  parseFloat(item.price_at_sale),
                    };
                    if (item.variant_option_values && Array.isArray(item.variant_option_values) && item.variant_option_values.length > 0) {
                      productData.product_options = item.variant_option_values.map(
                        (ov: any) => ({ id: ov.option_id, value: String(ov.id) }),
                      );
                    }
                    return productData;
                  }),
                };
                if (cartDiscountAmt > 0) bcOrderData.discount_amount = cartDiscountAmt.toFixed(4);

                const v2Res = await fetch(`https://api.bigcommerce.com/stores/${storeHash}/v2/orders`, {
                  method: "POST",
                  headers: { "X-Auth-Token": String(token), "Content-Type": "application/json", Accept: "application/json" },
                  body: JSON.stringify(bcOrderData),
                });
                if (v2Res.ok) {
                  const data = await v2Res.json();
                  bcOrderId = data.id;
                  bcSuccess = true;
                  await storage.updateOrderStatus(order.id!, "synced", bcOrderId);
                } else {
                  const errorText = await v2Res.text();
                  bcError = `BigCommerce sync failed: ${errorText}`;
                  await storage.updateOrderSyncError(order.id!, bcError);
                }
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
          bc_credit_remaining: bcCreditRemainingAfterOrder,
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
        cost_price: p.cost_price != null ? p.cost_price.toString() : null,
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
            cost_price: p.cost_price != null ? p.cost_price.toString() : null,
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
      const sensitiveSettingKeys = new Set(["bigcommerce_config", "skuvault_config", "google_sheets_webhook"]);
      const authUser = (req as any).authUser;
      if (sensitiveSettingKeys.has(req.params.key) && authUser?.role !== "admin") {
        return res.status(403).json({ error: "Only administrators can access this setting" });
      }
      const setting = await storage.getSetting(req.params.key);
      res.json(setting || { key: req.params.key, value: null });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Safe public configuration for authenticated workflows that need only the
  // store identifier; tokens and client secrets never leave the server.
  app.get("/api/bigcommerce/public-config", requireAuth, async (_req, res) => {
    try {
      const setting = await storage.getSetting("bigcommerce_config");
      const config = setting?.value
        ? (typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value)
        : {};
      res.json({ storeHash: config?.storeHash || "" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Safe display data for the customer creation page. Deliberately excludes all
  // BigCommerce credentials and integration configuration.
  app.get("/api/customer-signups/config", requireAuth, async (_req, res) => {
    try {
      const setting = await storage.getSetting("bigcommerce_config");
      const config = setting?.value
        ? (typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value)
        : {};
      const groupId = Number(config?.customerGroupId ?? config?.customer_group_id ?? 8) || 8;
      const groupName = String(config?.customerGroupName ?? config?.customer_group_name ?? "Verification Pending").trim() || "Verification Pending";
      res.json({ groupId, groupName });
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

  // ===== COMPANY TIMEZONE =====
  app.get("/api/settings/company-timezone", requireAuth, async (_req, res) => {
    try {
      const setting = await storage.getSetting("company_timezone");
      res.json({ timezone: (setting?.value as string) ?? "America/New_York" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/settings/company-timezone", requireAdmin, async (req, res) => {
    try {
      const { timezone } = req.body;
      if (!timezone || typeof timezone !== "string") {
        return res.status(400).json({ error: "timezone is required" });
      }
      await storage.setSetting("company_timezone", timezone);
      res.json({ success: true, timezone });
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

  // Ensure partial unique index for audit tasks (one pending task per SKU)
  db.execute(sql.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_tasks_sku_pending
    ON inventory_audit_tasks (sku) WHERE status = 'pending'
  `)).catch(() => {}); // Ignore if table not yet created; will succeed after db:push

  // Preview which SKUVault bin would be used for a given SKU — no push performed
  app.get("/api/inventory/resolve-location", requireAuth, async (req, res) => {
    try {
      const { sku } = req.query as { sku: string };
      if (!sku) return res.status(400).json({ error: "sku is required" });
      const svSetting = await storage.getSetting("skuvault_config");
      const svCfg = svSetting?.value ? (typeof svSetting.value === "string" ? JSON.parse(svSetting.value) : svSetting.value) : null;
      if (!svCfg?.tenantToken || !svCfg?.userToken) {
        return res.json({ sku, locationCode: null, source: "not_configured", error: "SKUVault not configured" });
      }
      const cfg: SkuVaultConfig = { tenantToken: svCfg.tenantToken, userToken: svCfg.userToken, warehouseId: svCfg.warehouseId ?? 0, warehouseLocation: svCfg.warehouseLocation };
      const result = await resolveSkuLocation(cfg, sku);
      return res.json(result);
    } catch (e: any) {
      res.json({ sku: req.query.sku, locationCode: null, source: "error", error: e.message });
    }
  });

  app.post("/api/inventory/push", requireAuth, async (req, res) => {
    try {
      const {
        product_id, variant_id, sku, quantity_added, reason, product_name, variant_name,
        push_to_bigcommerce = true,
        push_to_skuvault = false,
      } = req.body as {
        product_id: number; variant_id: number; sku: string; quantity_added: number;
        reason?: string; product_name?: string; variant_name?: string;
        push_to_bigcommerce?: boolean; push_to_skuvault?: boolean;
      };
      const authUser = (req as any).authUser;

      if (!product_id || !variant_id || !quantity_added || quantity_added <= 0) {
        return res.status(400).json({ error: "product_id, variant_id, and quantity_added (>0) are required" });
      }
      if (!push_to_bigcommerce && !push_to_skuvault) {
        return res.status(400).json({ error: "At least one destination must be selected" });
      }

      let previous_inventory = 0;
      let new_inventory = 0;
      let svResult: any = null;

      // ── BigCommerce push ────────────────────────────────────────────────────
      if (push_to_bigcommerce) {
        const bcSetting = await storage.getSetting("bigcommerce_config");
        let storeHash = process.env.BC_STORE_HASH;
        let token = process.env.BC_TOKEN;
        if (bcSetting?.value) {
          const cfg = typeof bcSetting.value === "string" ? JSON.parse(bcSetting.value) : bcSetting.value;
          storeHash = cfg.storeHash || storeHash;
          token = cfg.token || token;
        }
        if (!storeHash || !token) return res.status(400).json({ error: "BigCommerce credentials not configured" });

        const getRes = await fetch(
          `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products/${product_id}/variants/${variant_id}`,
          { headers: { "X-Auth-Token": String(token), "Content-Type": "application/json", Accept: "application/json" } }
        );
        if (!getRes.ok) throw new Error(`Failed to fetch variant: ${getRes.statusText}`);
        const variantData = await getRes.json();
        previous_inventory = variantData.data?.inventory_level ?? 0;
        new_inventory = previous_inventory + quantity_added;

        const putRes = await fetch(
          `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products/${product_id}/variants/${variant_id}`,
          { method: "PUT", headers: { "X-Auth-Token": String(token), "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ inventory_level: new_inventory }) }
        );
        if (!putRes.ok) {
          const errData = await putRes.json().catch(() => ({}));
          throw new Error(`Failed to update BigCommerce inventory: ${JSON.stringify(errData)}`);
        }
      }

      // ── SKUVault push ───────────────────────────────────────────────────────
      if (push_to_skuvault) {
        const svSetting = await storage.getSetting("skuvault_config");
        const svCfg = svSetting?.value ? (typeof svSetting.value === "string" ? JSON.parse(svSetting.value) : svSetting.value) : null;
        if (!svCfg?.tenantToken || !svCfg?.userToken) {
          return res.status(400).json({ error: "SKUVault credentials not configured. Please set them in Settings > SKUVault." });
        }
        const svCfgTyped: SkuVaultConfig = { tenantToken: svCfg.tenantToken, userToken: svCfg.userToken, warehouseId: svCfg.warehouseId ?? 0, warehouseLocation: svCfg.warehouseLocation };
        // Use first configured reason when client sends an invalid/default reason
        const configuredReasons: string[] = Array.isArray(svCfg.reasons) ? svCfg.reasons : [];
        const LEGACY_DEFAULTS = ["Manual Inventory Push - SalesApp", "Inventory Audit - SalesApp"];
        const effectiveReason = (() => {
          if (!reason || LEGACY_DEFAULTS.includes(reason)) {
            return configuredReasons[0] ?? reason ?? "Manual Inventory Push - SalesApp";
          }
          if (configuredReasons.length > 0 && !configuredReasons.includes(reason)) {
            console.warn(`[SKUVault] Client sent reason "${reason}" not in configured list; substituting "${configuredReasons[0]}"`);
            return configuredReasons[0];
          }
          return reason;
        })();
        const svPushResult = await addSkuVaultInventory(svCfgTyped, [{ sku, quantityToAdd: quantity_added }], effectiveReason);
        const svItem = svPushResult.results[0];
        if (svItem?.error) throw new Error(`SKUVault push failed for ${sku}: ${svItem.error}`);
        if (!push_to_bigcommerce) {
          previous_inventory = 0;
          new_inventory = svItem?.newQty ?? quantity_added;
        }
        svResult = svPushResult;

        const resolvedSvLocation = svItem?.locationCode || null;

        // Create or update audit task for SKUVault push
        try {
          await storage.createOrUpdateAuditTask({
            sku, product_id, variant_id,
            product_name: product_name || "",
            variant_name: variant_name || "",
            quantity_added,
            system_qty: svItem?.newQty ?? (previous_inventory + quantity_added),
            created_by: authUser.id,
            source: "manual_push",
            skuvault_location: resolvedSvLocation,
          });
        } catch (auditErr: any) {
          console.warn("[audit] Failed to create/update audit task:", auditErr.message);
        }
      }

      // ── Log the push ────────────────────────────────────────────────────────
      const svLocationForLog = svResult ? (svResult as any).results?.[0]?.locationCode || null : null;
      const logEntry: InsertInventoryPushLog = {
        user_id: authUser.id,
        username: authUser.username || "",
        sku, product_id, variant_id,
        product_name: product_name || "",
        variant_name: variant_name || "",
        previous_inventory, new_inventory, quantity_added,
        reason: reason || null,
        push_to_bigcommerce: !!push_to_bigcommerce,
        push_to_skuvault: !!push_to_skuvault,
        skuvault_location: svLocationForLog,
      };
      const log = await storage.createInventoryPushLog(logEntry);

      res.json({ success: true, previous_inventory, new_inventory, log, skuvault: svResult });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/inventory/push-logs/usernames", requireAuth, async (_req, res) => {
    try {
      const usernames = await storage.getInventoryPushLogUsernames();
      res.json(usernames);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Export endpoint — no row cap; generates CSV server-side with formula-injection neutralization
  app.get("/api/inventory/push-logs/export", requireAuth, async (req, res) => {
    try {
      const search   = (req.query.search   as string) || undefined;
      const username = (req.query.username as string) || undefined;
      const dateFrom = (req.query.dateFrom as string) || undefined;
      const dateTo   = (req.query.dateTo   as string) || undefined;
      const rows = await storage.getInventoryPushLogsForExport({ search, username, dateFrom, dateTo });

      // Neutralize CSV formula injection (=, +, -, @, tab, CR as first char)
      const neutralize = (val: string | number | null | undefined): string => {
        const s = val == null ? "" : String(val);
        return s.length > 0 && ["=", "+", "-", "@", "\t", "\r"].includes(s[0]) ? `'${s}` : s;
      };
      const escapeCell = (val: string | number | null | undefined): string => {
        const s = neutralize(val);
        return s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")
          ? `"${s.replace(/"/g, '""')}"` : s;
      };

      const filename = `inventory-push-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

      const lines: string[] = [
        ["Date", "User", "Product", "Variant", "SKU", "Before", "Added", "After", "Reason"].join(","),
      ];
      for (const log of rows) {
        lines.push([
          escapeCell(log.created_at ? new Date(log.created_at).toISOString() : ""),
          escapeCell((log as any).username || `User #${log.user_id}`),
          escapeCell((log as any).product_name || `Product #${log.product_id}`),
          escapeCell((log as any).variant_name || `Variant #${log.variant_id}`),
          escapeCell(log.sku),
          escapeCell(log.previous_inventory),
          escapeCell(log.quantity_added),
          escapeCell(log.new_inventory),
          escapeCell(log.reason || ""),
        ].join(","));
      }
      res.send(lines.join("\n"));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/inventory/push-logs", requireAuth, async (req, res) => {
    try {
      const page = Math.max(0, parseInt(req.query.page as string) || 0);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
      const search = (req.query.search as string) || undefined;
      const username = (req.query.username as string) || undefined;
      const dateFrom = (req.query.dateFrom as string) || undefined;
      const dateTo = (req.query.dateTo as string) || undefined;
      const result = await storage.getInventoryPushLogs({ page, limit, search, username, dateFrom, dateTo });
      res.json(result);
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

  // ── Consolidated Orders (new ERP Orders page) ─────────────────────────────
  // Permission: orders:view  → see ALL orders across all users/channels
  //             (no permission) → only own Sales App orders (createdBy forced to self)
  app.get("/api/orders/consolidated", requireAuth, async (req, res) => {
    try {
      const authUser = (req as any).authUser;

      // Determine if caller has unrestricted access
      let hasOrdersView = authUser.role === "admin";
      if (!hasOrdersView) {
        const perms = await storage.getUserPermissionStrings(authUser.id);
        hasOrdersView = perms.includes("orders:view");
      }

      const {
        page = "1", limit = "50",
        search = "", createdBy = "",
        syncStatus = "", bcStatus = "",
        dateFrom = "", dateTo = "",
        salesChannel = "salesapp",
      } = req.query as Record<string, string>;

      // Restricted users: lock to their own Sales App orders regardless of params
      const effectiveCreatedBy = hasOrdersView
        ? (createdBy ? parseInt(createdBy) : null)
        : authUser.id;
      const effectiveSalesChannel = hasOrdersView
        ? (salesChannel === "allorders" ? "allorders" : "salesapp")
        : "salesapp";

      const result = await storage.getConsolidatedOrders({
        page: Math.max(1, parseInt(page)),
        limit: Math.min(100, Math.max(1, parseInt(limit))),
        search: search || undefined,
        createdBy: effectiveCreatedBy,
        syncStatus: hasOrdersView ? (syncStatus || undefined) : undefined,
        bcStatus: hasOrdersView ? (bcStatus || undefined) : undefined,
        dateFrom: dateFrom ? new Date(dateFrom) : null,
        dateTo: dateTo ? (() => { const d = new Date(dateTo); d.setHours(23, 59, 59, 999); return d; })() : null,
        salesChannel: effectiveSalesChannel,
      });
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Single order detail (for the Orders detail page)
  app.get("/api/orders/:id/detail", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const order = await storage.getOrderDetail(id);
      if (!order) return res.status(404).json({ error: "Order not found" });
      res.json(order);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // PATCH /api/orders/:id/note — update staff note on a local Sales App order
  app.patch("/api/orders/:id/note", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid order ID" });
      const user = (req as any).authUser;
      const { note, customer_note, crm_customer_id, bc_order_id } = req.body;

      // Update local order notes (both staff and customer)
      if (note !== undefined) await storage.updateOrderNote(id, note ?? "");
      if (customer_note !== undefined) await storage.updateOrderCustomerNote(id, customer_note ?? "");

      // Sync to BC if order has a BC counterpart
      let bcSuccess = false;
      const resolvedBcId = bc_order_id ?? null;
      if (resolvedBcId) {
        try {
          const { storeHash, token } = await getBcCreds();
          if (storeHash && token) {
            const body: Record<string, string> = {};
            if (note !== undefined) body.staff_notes = note ?? "";
            if (customer_note !== undefined) body.customer_message = customer_note ?? "";
            if (Object.keys(body).length > 0) {
              const bcResp = await fetch(`https://api.bigcommerce.com/stores/${storeHash}/v2/orders/${resolvedBcId}`, {
                method: "PUT",
                headers: { "X-Auth-Token": String(token), "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify(body),
              });
              bcSuccess = bcResp.ok;
              if (bcResp.ok) {
                // Keep mirror in sync
                await storage.updateCrmOrderNotes(resolvedBcId, {
                  ...(note !== undefined ? { staff_notes: note ?? "" } : {}),
                  ...(customer_note !== undefined ? { customer_order_notes: customer_note ?? "" } : {}),
                });
              }
            }
          }
        } catch (_) { /* BC failure is non-fatal */ }
      }

      // Create CRM activity notes for any changed field
      const resolvedCrmId = crm_customer_id ? parseInt(String(crm_customer_id)) : null;
      if (resolvedCrmId && !isNaN(resolvedCrmId) && user) {
        const orderLabel = resolvedBcId ? `Order #${resolvedBcId}` : `Order #${id}`;
        if (note !== undefined) {
          await storage.createCrmNote({
            customer_id: resolvedCrmId, note_type: "Order Note",
            note: `Edited Staff Note\n${orderLabel}`,
            order_id: resolvedBcId || undefined, created_by: user.id, activity_type: "note",
          });
          await storage.createCrmAuditLog({
            user_id: user.id, action: "staff_note_updated", customer_id: resolvedCrmId,
            detail: { order_id: id, bc_order_id: resolvedBcId },
          });
        }
        if (customer_note !== undefined) {
          await storage.createCrmNote({
            customer_id: resolvedCrmId, note_type: "Order Note",
            note: `Edited Customer Note\n${orderLabel}`,
            order_id: resolvedBcId || undefined, created_by: user.id, activity_type: "note",
          });
          await storage.createCrmAuditLog({
            user_id: user.id, action: "customer_note_updated", customer_id: resolvedCrmId,
            detail: { order_id: id, bc_order_id: resolvedBcId },
          });
        }
      }

      res.json({ ok: true, bc_synced: bcSuccess });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // PATCH /api/bigcommerce/orders/:bcOrderId/notes — edit staff/customer notes on a BC-native order
  // Syncs directly to BC v2, updates local mirror, and creates CRM timeline events.
  app.patch("/api/bigcommerce/orders/:bcOrderId/notes", requireAuth, async (req, res) => {
    try {
      const bcOrderId = parseInt(req.params.bcOrderId);
      if (isNaN(bcOrderId)) return res.status(400).json({ error: "Invalid BC order ID" });
      const user = (req as any).authUser;
      const { staff_notes, customer_message, crm_customer_id } = req.body;

      if (staff_notes === undefined && customer_message === undefined) {
        return res.status(400).json({ error: "Provide staff_notes and/or customer_message" });
      }

      // 1. Sync to BigCommerce v2
      let bcSynced = false;
      try {
        const { storeHash, token } = await getBcCreds();
        if (storeHash && token) {
          const body: Record<string, string> = {};
          if (staff_notes !== undefined) body.staff_notes = staff_notes ?? "";
          if (customer_message !== undefined) body.customer_message = customer_message ?? "";
          const bcResp = await fetch(
            `https://api.bigcommerce.com/stores/${storeHash}/v2/orders/${bcOrderId}`,
            { method: "PUT", headers: { "X-Auth-Token": String(token), "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) }
          );
          bcSynced = bcResp.ok;
        }
      } catch (_) { /* non-fatal */ }

      // 2. Update local mirror regardless of BC result (keep local consistent)
      await storage.updateCrmOrderNotes(bcOrderId, {
        ...(staff_notes !== undefined ? { staff_notes: staff_notes ?? "" } : {}),
        ...(customer_message !== undefined ? { customer_order_notes: customer_message ?? "" } : {}),
      });

      // 3. CRM timeline events
      const resolvedCrmId = crm_customer_id ? parseInt(String(crm_customer_id)) : null;
      if (resolvedCrmId && !isNaN(resolvedCrmId) && user) {
        const orderLabel = `Order #${bcOrderId}`;
        if (staff_notes !== undefined) {
          await storage.createCrmNote({
            customer_id: resolvedCrmId, note_type: "Order Note",
            note: `Edited Staff Note\n${orderLabel}`,
            order_id: bcOrderId, created_by: user.id, activity_type: "note",
          });
          await storage.createCrmAuditLog({
            user_id: user.id, action: "staff_note_updated", customer_id: resolvedCrmId,
            detail: { bc_order_id: bcOrderId },
          });
        }
        if (customer_message !== undefined) {
          await storage.createCrmNote({
            customer_id: resolvedCrmId, note_type: "Order Note",
            note: `Edited Customer Note\n${orderLabel}`,
            order_id: bcOrderId, created_by: user.id, activity_type: "note",
          });
          await storage.createCrmAuditLog({
            user_id: user.id, action: "customer_note_updated", customer_id: resolvedCrmId,
            detail: { bc_order_id: bcOrderId },
          });
        }
      }

      res.json({ ok: true, bc_synced: bcSynced });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Store Credit ─────────────────────────────────────────────────────────────

  // POST /api/store-credit/issue
  app.post("/api/store-credit/issue", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser;
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      const {
        customer_id, bigcommerce_customer_id, bigcommerce_order_id, order_id,
        reason, amount, tax, products,
      } = req.body;

      const totalAmount = parseFloat(amount ?? "0");
      const totalTax = parseFloat(tax ?? "0");

      // 1. Create ledger record
      const entry = await storage.createStoreCreditLedger({
        customer_id: customer_id ? parseInt(String(customer_id)) : null,
        bigcommerce_customer_id: bigcommerce_customer_id ? parseInt(String(bigcommerce_customer_id)) : null,
        bigcommerce_order_id: bigcommerce_order_id ? parseInt(String(bigcommerce_order_id)) : null,
        order_id: order_id ? parseInt(String(order_id)) : null,
        type: "issued",
        amount: totalAmount.toFixed(2),
        tax: totalTax.toFixed(2),
        reason: reason || "Missing Items",
        products: products ?? [],
        issued_by: user.id,
        issued_by_name: user.name,
      });

      // 2. Update local customers_mirror store_credit_balance
      //    Prefer crm_customer_id (customers_mirror.id / local PK).
      //    If not provided, fall back to looking up the record by bigcommerce_customer_id.
      let crmId = customer_id ? parseInt(String(customer_id)) : null;
      const bcCustId = bigcommerce_customer_id ? parseInt(String(bigcommerce_customer_id)) : null;

      if (!crmId && bcCustId) {
        // Look up the local CRM row by BC customer id so the local balance is always updated
        const foundId = await storage.getCrmIdByBcCustomerId(bcCustId);
        if (foundId) crmId = foundId;
      }

      let localUpdated = false;
      if (crmId) {
        await storage.updateCustomerStoreCreditBalance(crmId, totalAmount + totalTax);
        localUpdated = true;
      }

      // 3. Update BC store credit using v3 API (same path as POS flow — v2 store_credit_amount is read-only)
      //    Read current balance via v2 (v3 doesn't expose store_credit_amount directly),
      //    then write the new value via v3 customers PUT.
      let bcUpdated = false;
      let bcUpdateError: string | null = null;
      let bcCreditBefore: number | null = null;
      let bcCreditAfter: number | null = null;
      if (bcCustId) {
        try {
          const { storeHash, token } = await getBcCreds();
          if (storeHash && token) {
            // Read current balance from v2
            const bcReadRes = await fetch(
              `https://api.bigcommerce.com/stores/${storeHash}/v2/customers/${bcCustId}`,
              { headers: { "X-Auth-Token": String(token), Accept: "application/json" } }
            );
            if (bcReadRes.ok) {
              const bcData = await bcReadRes.json();
              bcCreditBefore = parseFloat(bcData.store_credit_amount ?? bcData.store_credit ?? "0");
              const newCredit = bcCreditBefore + totalAmount + totalTax;
              bcCreditAfter = newCredit;

              // Write via v3 API — the only reliable write path (v2 store_credit_amount is effectively read-only)
              const bcWriteRes = await fetch(
                `https://api.bigcommerce.com/stores/${storeHash}/v3/customers`,
                {
                  method: "PUT",
                  headers: { "X-Auth-Token": String(token), "Content-Type": "application/json", Accept: "application/json" },
                  body: JSON.stringify([{ id: bcCustId, store_credit_amounts: [{ amount: newCredit }] }]),
                }
              );
              if (bcWriteRes.ok) {
                bcUpdated = true;
                // Mirror the exact new balance locally so the CRM page is immediately consistent
                if (crmId) {
                  await storage.setCustomerStoreCreditBalance(crmId, newCredit);
                }
              } else {
                const errBody = await bcWriteRes.text();
                bcUpdateError = `BC v3 write failed (${bcWriteRes.status}): ${errBody.slice(0, 300)}`;
              }
            } else {
              const errBody = await bcReadRes.text();
              bcUpdateError = `BC v2 read failed (${bcReadRes.status}): ${errBody.slice(0, 200)}`;
            }
          } else {
            bcUpdateError = "BC credentials not configured";
          }
        } catch (e: any) {
          bcUpdateError = `BC update exception: ${e.message}`;
        }
      }

      // 4. Create CRM activity timeline note
      if (crmId) {
        const orderLabel = bigcommerce_order_id ? `Order #${bigcommerce_order_id}` : order_id ? `Order #${order_id}` : "";
        const creditTotal = (totalAmount + totalTax).toFixed(2);
        await storage.createCrmNote({
          customer_id: crmId,
          note_type: "Store Credit",
          note: `Store Credit Issued\n$${creditTotal}\n${orderLabel}\n${reason || "Missing Items"}`,
          order_id: bigcommerce_order_id || undefined,
          created_by: user.id,
          activity_type: "note",
        });
        await storage.createCrmAuditLog({
          user_id: user.id, action: "store_credit_issued", customer_id: crmId,
          detail: { amount: creditTotal, reason, bc_order_id: bigcommerce_order_id },
        });
      }

      // 5. Append BC staff note and sync to BC
      if (bigcommerce_order_id) {
        try {
          const { storeHash, token } = await getBcCreds();
          if (storeHash && token) {
            // Fetch existing staff notes
            const existingResp = await fetch(
              `https://api.bigcommerce.com/stores/${storeHash}/v2/orders/${bigcommerce_order_id}`,
              { headers: { "X-Auth-Token": String(token), Accept: "application/json" } }
            );
            let existingNote = "";
            if (existingResp.ok) {
              const existingData = await existingResp.json();
              existingNote = existingData.staff_notes ?? "";
              // strip HTML if present
              existingNote = existingNote.replace(/<[^>]+>/g, " ").trim();
            }

            const now = new Date();
            const dateStr = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
            const creditTotal = (totalAmount + totalTax).toFixed(2);

            // Compact note format (matches image spec):
            // Missing Items : {date}
            // {qty} × {name} (#{bcOrderId})
            // SKU: {sku}
            //
            // Credit: ${amount}
            // Issued By: {name}
            const productLines = (products ?? []).map((p: any) =>
              `${p.qty} × ${p.name}${bigcommerce_order_id ? ` (#${bigcommerce_order_id})` : ""}\nSKU: ${p.sku || "—"}`
            ).join("\n");

            const noteBlock = [
              `Missing Items : ${dateStr}`,
              productLines,
              "",
              `Credit: $${creditTotal}`,
              `Issued By: ${user.name}`,
            ].join("\n");

            const combined = existingNote
              ? `${existingNote}\n\n${noteBlock}`
              : noteBlock;

            await fetch(
              `https://api.bigcommerce.com/stores/${storeHash}/v2/orders/${bigcommerce_order_id}`,
              {
                method: "PUT",
                headers: { "X-Auth-Token": String(token), "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ staff_notes: combined }),
              }
            );

            // Update mirror
            await storage.updateCrmOrderNotes(parseInt(String(bigcommerce_order_id)), { staff_notes: combined });
          }
        } catch (_) { /* Non-fatal */ }
      }

      // Verbose debug payload so the caller can verify every ID used in the flow
      res.json({
        ok: true,
        entry,
        debug: {
          // IDs used throughout
          crm_customer_id_sent: customer_id ?? null,        // what the frontend sent
          crm_id_resolved: crmId,                           // customers_mirror.id used for local update (may differ if we looked up by bc id)
          bigcommerce_customer_id: bcCustId,                // BC customer ID used for BC update
          bigcommerce_order_id: bigcommerce_order_id ?? null,
          // Balance tables
          balance_table: "customers_mirror",
          balance_column: "store_credit_balance",
          // Local update
          local_balance_updated: localUpdated,
          // BC update
          bc_balance_updated: bcUpdated,
          bc_credit_before: bcCreditBefore,
          bc_credit_after: bcCreditAfter,
          bc_update_error: bcUpdateError,
          // Credit amount
          credit_subtotal: totalAmount,
          credit_tax: totalTax,
          credit_total: totalAmount + totalTax,
        },
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/store-credit/ledger
  app.get("/api/store-credit/ledger", requireAuth, async (req, res) => {
    try {
      const { customer_id, issued_by, date_from, date_to, search, type, limit = "50", offset = "0" } = req.query as Record<string, string>;
      const result = await storage.getStoreCreditLedger({
        customerId: customer_id ? parseInt(customer_id) : undefined,
        issuedBy: issued_by ? parseInt(issued_by) : undefined,
        dateFrom: date_from || undefined,
        dateTo: date_to || undefined,
        search: search || undefined,
        type: type || undefined,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/email/send-plain — plain-text email (no PDF) [legacy]
  app.post("/api/email/send-plain", requireAuth, async (req, res) => {
    try {
      const { to, subject, body: emailBody } = req.body as { to: string; subject: string; body: string };
      if (!to || !subject) return res.status(400).json({ error: "Missing required fields: to, subject" });

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
        host: smtpHost, port: smtpPort, secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
        connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 20000,
      });
      await transporter.verify();
      await transporter.sendMail({ from: smtpFrom, to, subject, text: emailBody ?? "" });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/email/send-html — rich-text (HTML) email
  app.post("/api/email/send-html", requireAuth, async (req, res) => {
    try {
      const { to, subject, html, text } = req.body as { to: string; subject: string; html: string; text?: string };
      if (!to || !subject) return res.status(400).json({ error: "Missing required fields: to, subject" });

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
        host: smtpHost, port: smtpPort, secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
        connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 20000,
      });
      await transporter.verify();
      await transporter.sendMail({
        from: smtpFrom, to, subject,
        html: html ?? "",
        text: text ?? html?.replace(/<[^>]+>/g, "") ?? "",
      });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/admin/email-templates/:key
  app.get("/api/admin/email-templates/:key", requireAuth, async (req, res) => {
    try {
      const tmpl = await storage.getEmailTemplate(req.params.key);
      if (!tmpl) return res.status(404).json({ error: "Template not found" });
      res.json(tmpl);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // PUT /api/admin/email-templates/:key
  app.put("/api/admin/email-templates/:key", requireAdmin, async (req, res) => {
    try {
      const user = (req as any).authUser;
      const { name, subject_template, body } = req.body;
      const tmpl = await storage.upsertEmailTemplate(req.params.key, {
        name: name || req.params.key,
        subject_template: subject_template || "",
        body: body || "",
        updated_by: user?.id,
      });
      res.json(tmpl);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
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
          is_enabled: u.is_enabled,
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
      console.log(`[invoice] loading order ${orderId}`);
      const [orderRes, productsRes] = await Promise.all([
        fetch(`https://api.bigcommerce.com/stores/${storeHash}/v2/orders/${orderId}`, { headers }),
        fetch(`https://api.bigcommerce.com/stores/${storeHash}/v2/orders/${orderId}/products?limit=250`, { headers }),
      ]);
      if (!orderRes.ok) {
        const errBody = await orderRes.text();
        console.error(`[invoice] BC order fetch failed ${orderRes.status}: ${errBody.slice(0, 200)}`);
        throw new Error(`Order fetch failed: ${orderRes.status} ${orderRes.statusText}`);
      }
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

      // Look up CRM customer ID via BC customer_id so the frontend can link to the CRM page
      let crm_customer_id: number | null = null;
      if (order.customer_id) {
        try {
          const crmCustomer = await storage.getCrmCustomerByBcId(order.customer_id);
          if (crmCustomer) crm_customer_id = crmCustomer.id;
        } catch {
          // best-effort
        }
      }

      res.json({ order, products: enrichedProducts, crm_customer_id });
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

  app.post("/api/bigcommerce/customer-groups/test", requireAdmin, async (req, res) => {
    try {
      const groupId = Number(req.body?.id);
      const expectedName = String(req.body?.name ?? "").trim();
      if (!Number.isInteger(groupId) || groupId <= 0) {
        return res.status(400).json({ error: "A valid customer group ID is required" });
      }
      const setting = await storage.getSetting("bigcommerce_config");
      let storeHash = process.env.BC_STORE_HASH || "";
      let token = process.env.BC_TOKEN || "";
      if (setting?.value) {
        const cfg = typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value;
        storeHash = cfg.storeHash || storeHash;
        token = cfg.token || token;
      }
      if (!storeHash || !token) return res.status(400).json({ error: "BigCommerce credentials not configured" });
      const groupRes = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v2/customer_groups/${groupId}`,
        { headers: { "X-Auth-Token": token, Accept: "application/json" } },
      );
      const group = await groupRes.json().catch(() => null);
      if (!groupRes.ok) {
        return res.status(groupRes.status === 404 ? 404 : 502).json({ error: group?.title || `Customer group ${groupId} was not found` });
      }
      if (expectedName && String(group.name).trim().toLowerCase() !== expectedName.toLowerCase()) {
        return res.status(400).json({ error: `Group ID ${groupId} is "${group.name}", not "${expectedName}"` });
      }
      res.json({ id: group.id, name: group.name, verified: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Create a new BC customer and assign to the configured signup group.
  app.post("/api/bigcommerce/customers/create", requirePermission("customers_create"), async (req, res) => {
    try {
      const authUser = (req as any).authUser;
      const setting = await storage.getSetting("bigcommerce_config");
      let storeHash = process.env.BC_STORE_HASH || "";
      let token = process.env.BC_TOKEN || "";
      let configuredGroupId = 8;
      let configuredGroupName = "Verification Pending";
      if (setting?.value) {
        const cfg = typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value;
        storeHash = cfg.storeHash || storeHash;
        token = cfg.token || token;
        configuredGroupId = Number(cfg.customerGroupId ?? cfg.customer_group_id ?? configuredGroupId) || configuredGroupId;
        configuredGroupName = String(cfg.customerGroupName ?? cfg.customer_group_name ?? configuredGroupName).trim() || configuredGroupName;
      }
      if (!storeHash || !token) return res.status(400).json({ error: "BigCommerce credentials not configured" });

      const {
        first_name, last_name, email, phone, company, business_tax_id,
        address1, address2, city, state_or_province, postal_code, country_code,
        shipping_address: submittedShippingAddress,
        signed_up_by_user_id,
        idempotency_key,
      } = req.body;
      if (!first_name || !last_name || !email || !business_tax_id) return res.status(400).json({ error: "first_name, last_name, email, and business_tax_id are required" });
      const signupAttemptKey = String(idempotency_key || "").trim();
      if (!/^[A-Za-z0-9_-]{16,128}$/.test(signupAttemptKey)) {
        return res.status(400).json({ error: "A valid signup idempotency key is required" });
      }

      const selectedUserId = signed_up_by_user_id == null ? authUser.id : Number(signed_up_by_user_id);
      if (!Number.isInteger(selectedUserId)) return res.status(400).json({ error: "Signed up by user is invalid" });
      if (authUser.role !== "admin" && selectedUserId !== authUser.id) {
        return res.status(403).json({ error: "You can only create customer signups under your own name" });
      }
      const selectedUser = await storage.getUser(selectedUserId);
      if (!selectedUser || !selectedUser.is_enabled) return res.status(400).json({ error: "Signed up by user must be an active app user" });
      const attribution = selectedUser.name;
      const shippingAddress = submittedShippingAddress && typeof submittedShippingAddress === "object"
        ? submittedShippingAddress
        : address1
          ? { first_name, last_name, company: company || "", address1, address2: address2 || "", city: city || "", state_or_province: state_or_province || "", postal_code: postal_code || "", country_code: country_code || "US", phone: phone || "", address_type: "residential" }
          : null;
      const payload: any = [{
        first_name,
        last_name,
        email,
        phone: phone || "",
        company: company || "",
        customer_group_id: configuredGroupId,
        form_fields: [{
          name: "What brought you to our site? (This will help us connect you to the correct sales team member)",
          value: attribution,
         }, {
           name: "Business Tax ID",
           value: String(business_tax_id).trim(),
        }],
      }];

      if (shippingAddress?.address1) {
        payload[0].addresses = [{
          first_name: shippingAddress.first_name || first_name,
          last_name: shippingAddress.last_name || last_name,
          company: shippingAddress.company || "",
          address1: shippingAddress.address1,
          address2: shippingAddress.address2 || "",
          city: shippingAddress.city || "",
          state_or_province: shippingAddress.state_or_province || "",
          postal_code: shippingAddress.postal_code || "",
          country_code: shippingAddress.country_code || "US",
          phone: shippingAddress.phone || phone || "",
          address_type: "residential",
        }];
      }

      let attempt = await storage.getCustomerSignupAttempt(signupAttemptKey);
      if (attempt && attempt.created_by_user_id !== authUser.id) {
        return res.status(403).json({ error: "This signup request belongs to another user" });
      }
      if (!attempt) {
        const inserted = await storage.createCustomerSignupAttempt(signupAttemptKey, authUser.id, {
          first_name, last_name, email, phone, company, business_tax_id: String(business_tax_id).trim(), shipping_address: shippingAddress,
          signed_up_by_user_id: selectedUserId, customer_group_id: configuredGroupId,
          customer_group_name: configuredGroupName, attribution,
        });
        if (!inserted) attempt = await storage.getCustomerSignupAttempt(signupAttemptKey);
      }
      if (attempt?.status === "completed" && attempt.result) {
        return res.json(attempt.result);
      }

      let created: any;
      let bcCustomerId: number;
      if (attempt?.bigcommerce_customer_id) {
        bcCustomerId = attempt.bigcommerce_customer_id;
        created = { id: bcCustomerId };
      } else {
        const customerUrl = `https://api.bigcommerce.com/stores/${storeHash}/v3/customers`;
        const customerHeaders = { "X-Auth-Token": token, "Content-Type": "application/json", Accept: "application/json" };
        let r = await fetch(customerUrl, {
          method: "POST",
          headers: customerHeaders,
          body: JSON.stringify(payload),
        });
        let data = await r.json();
        // BigCommerce validates custom customer form fields by their configured
        // display name. Some stores preserve a trailing colon in that name,
        // while the API error omits it. Retry only this specific mismatch.
        const errorText = data?.errors ? JSON.stringify(data.errors) : "";
        if (!r.ok && r.status === 422 && /Missing form-field name Business Tax ID/i.test(errorText)) {
          const retryPayload = [{
            ...payload[0],
            form_fields: payload[0].form_fields.map((field: any) =>
              field.name === "Business Tax ID" ? { ...field, name: "Business Tax ID:" } : field,
            ),
          }];
          r = await fetch(customerUrl, {
            method: "POST",
            headers: customerHeaders,
            body: JSON.stringify(retryPayload),
          });
          data = await r.json();
        }
        if (!r.ok) {
          const msg = data?.errors ? JSON.stringify(data.errors) : data?.title || r.statusText;
          return res.status(r.status).json({ error: msg });
        }
        created = data.data?.[0] ?? data;
        bcCustomerId = Number(created?.id);
        if (!Number.isInteger(bcCustomerId)) return res.status(502).json({ error: "BigCommerce created the customer but did not return a customer ID" });
        await storage.setCustomerSignupAttemptCustomerId(signupAttemptKey, bcCustomerId);
      }

      try {
        const crmCustomer = await storage.upsertCrmCustomer({
          bigcommerce_customer_id: bcCustomerId,
          company: company || null,
          first_name,
          last_name,
          email,
          phone: phone || null,
          customer_group_id: configuredGroupId,
          customer_group_name: configuredGroupName,
          billing_address: null,
          shipping_address: shippingAddress,
          created_date: new Date(),
          is_active: true,
          store_credit_balance: "0",
          primary_rep_id: selectedUserId,
        });
        await storage.updateCrmCustomerMasterFields(crmCustomer.id, { primary_rep_id: selectedUserId });
        await storage.setCrmSalesRep({ customer_id: crmCustomer.id, assigned_user_id: selectedUserId, assigned_by: authUser.id });
        const signup = await storage.createCustomerSignup({
          bigcommerce_customer_id: bcCustomerId,
          first_name,
          last_name,
          email,
          company: company || null,
          customer_group_id: configuredGroupId,
          customer_group_name: configuredGroupName,
          attribution,
          shipping_address: shippingAddress,
          signed_up_by_user_id: selectedUserId,
          signed_up_by_name: attribution,
          primary_rep_id: selectedUserId,
        });
        const result = { ...created, signup_id: signup.id, customer_group_name: configuredGroupName, signed_up_by_name: attribution };
        await storage.completeCustomerSignupAttempt(signupAttemptKey, result);
        res.json(result);
      } catch (trackingError: any) {
        console.error("[customer-signup] BigCommerce customer created but internal tracking failed:", trackingError);
        res.status(502).json({ error: "Customer was created in BigCommerce, but internal tracking failed. Retry the same submission to reconcile it." });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/customer-signups", requirePermission("customer_signups"), async (req, res) => {
    try {
      const user = (req as any).authUser;
      const userId = user.id as number;
      const perms = user.role === "admin" ? [] : await storage.getUserPermissionStrings(userId);
      const canViewAll = user.role === "admin" || perms.includes("customer_signups:view_all");
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
      const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined;
      const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo : undefined;
      const requestedSignedUpBy = Number(req.query.signedUpBy);
      const signedUpByUserId = canViewAll && Number.isInteger(requestedSignedUpBy) && requestedSignedUpBy > 0
        ? requestedSignedUpBy
        : undefined;
      const result = await storage.getCustomerSignups({
        userId: canViewAll ? undefined : userId,
        signedUpByUserId,
        dateFrom,
        dateTo,
        limit,
        offset: (page - 1) * limit,
      });
      // Keep the link target explicit even for older signup records or rows
      // created before the CRM mirror was populated.
      const rows = await Promise.all(result.rows.map(async (row) => {
        if (row.crm_customer_id) return row;
        const crmCustomer = await storage.getCrmCustomerByBcId(row.bigcommerce_customer_id);
        return { ...row, crm_customer_id: crmCustomer?.id ?? null };
      }));
      res.json({ ...result, rows, page, limit, can_view_all: canViewAll, filters: { dateFrom, dateTo, signedUpBy: signedUpByUserId ?? null } });
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
      const [customer_count, order_count, line_item_count, lastCustSync, lastOrderSync, lastStatsRecalc,
             lastCustIncSync, lastOrdIncSync, autoCustomers, autoOrders,
             lastLineItemsSync, lastLineItemsIncSync, autoLineItems] = await Promise.all([
        storage.getCrmCustomerCount(),
        storage.getCrmOrderCount(),
        storage.getBcOrderLineItemsCount(),
        storage.getSetting("crm_last_customer_sync"),
        storage.getSetting("crm_last_order_sync"),
        storage.getSetting("crm_last_stats_recalc"),
        storage.getSetting("crm_last_customer_incremental_sync"),
        storage.getSetting("crm_last_order_incremental_sync"),
        storage.getSetting("crm_auto_sync_customers"),
        storage.getSetting("crm_auto_sync_orders"),
        storage.getSetting("crm_last_line_items_sync"),
        storage.getSetting("crm_last_line_items_incremental_sync"),
        storage.getSetting("crm_auto_sync_line_items"),
      ]);
      res.json({
        customer_count,
        order_count,
        line_item_count,
        last_customer_sync: lastCustSync?.value ?? null,
        last_order_sync: lastOrderSync?.value ?? null,
        last_stats_recalc: lastStatsRecalc?.value ?? null,
        last_customer_incremental_sync: lastCustIncSync?.value ?? null,
        last_order_incremental_sync: lastOrdIncSync?.value ?? null,
        auto_sync_customers: autoCustomers?.value === true || autoCustomers?.value === "true",
        auto_sync_orders: autoOrders?.value === true || autoOrders?.value === "true",
        last_line_items_sync: lastLineItemsSync?.value ?? null,
        last_line_items_incremental_sync: lastLineItemsIncSync?.value ?? null,
        auto_sync_line_items: autoLineItems?.value === true || autoLineItems?.value === "true",
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
          const credit = c.store_credit_amount ?? c.store_credit;
          if (c.id != null && credit != null) {
            storeCreditMap[c.id] = String(credit);
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
          const primaryAddrType = bc.addresses?.[0]?.address_type;
          const derivedAddressType = primaryAddrType === "residential" ? "Residential" : primaryAddrType === "commercial" ? "Commercial" : "Unknown";
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
            address_type: derivedAddressType,
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

  // ── Incremental / Auto / Reset sync routes ────────────────────────────────

  // Helper to get BC creds (avoids repetition below)
  async function getBcConfig() {
    const bcSetting = await storage.getSetting("bigcommerce_config");
    let storeHash = process.env.BC_STORE_HASH;
    let token = process.env.BC_TOKEN;
    if (bcSetting?.value) {
      const cfg = typeof bcSetting.value === "string" ? JSON.parse(bcSetting.value) : bcSetting.value;
      storeHash = cfg.storeHash || storeHash;
      token = cfg.token || token;
    }
    return { storeHash, token };
  }

  // POST /api/crm/sync/customers/incremental
  app.post("/api/crm/sync/customers/incremental", requireAuth, async (_req, res) => {
    try {
      const { storeHash, token } = await getBcConfig();
      if (!storeHash || !token) return res.status(400).json({ error: "BigCommerce not configured" });

      const lastSync = await storage.getSetting("crm_last_customer_sync");
      const since = lastSync?.value ? new Date(lastSync.value) : null;

      const cgRes = await fetch(`https://api.bigcommerce.com/stores/${storeHash}/v2/customer_groups?limit=200`, {
        headers: { "X-Auth-Token": String(token), Accept: "application/json" },
      });
      const cgData: any[] = cgRes.ok ? await cgRes.json() : [];
      const groupNameMap: Record<number, string> = {};
      for (const g of cgData) groupNameMap[g.id] = g.name;

      let page = 1, synced = 0;
      while (true) {
        let url = `https://api.bigcommerce.com/stores/${storeHash}/v3/customers?include=addresses&limit=250&page=${page}`;
        if (since) url += `&date_modified:min=${since.toISOString()}`;
        const r = await fetch(url, { headers: { "X-Auth-Token": String(token), Accept: "application/json" } });
        if (!r.ok) break;
        const json = await r.json();
        const bcCustomers: any[] = json.data ?? [];
        if (bcCustomers.length === 0) break;
        for (const bc of bcCustomers) {
          const billing = bc.addresses?.find((a: any) => a.address_type === "commercial") ?? bc.addresses?.[0] ?? null;
          const shipping = bc.addresses?.find((a: any) => a.address_type === "residential") ?? null;
          const primaryAddrType = bc.addresses?.[0]?.address_type;
          const derivedAddressType = primaryAddrType === "residential" ? "Residential" : primaryAddrType === "commercial" ? "Commercial" : "Unknown";
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
            store_credit_balance: "0",
            address_type: derivedAddressType,
          });
          synced++;
        }
        if (bcCustomers.length < 250) break;
        page++;
      }
      const now = new Date().toISOString();
      await storage.setSetting("crm_last_customer_incremental_sync", now);
      await storage.setSetting("crm_last_customer_sync", now);
      res.json({ success: true, synced });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/crm/sync/orders/incremental
  app.post("/api/crm/sync/orders/incremental", requireAuth, async (_req, res) => {
    try {
      const { storeHash, token } = await getBcConfig();
      if (!storeHash || !token) return res.status(400).json({ error: "BigCommerce not configured" });

      const lastSync = await storage.getSetting("crm_last_order_sync");
      const since = lastSync?.value ? new Date(lastSync.value) : null;

      let page = 1, synced = 0;
      while (true) {
        let url = `https://api.bigcommerce.com/stores/${storeHash}/v2/orders?limit=250&page=${page}&sort=id:desc`;
        if (since) url += `&min_date_modified=${since.toISOString()}`;
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
      const now = new Date().toISOString();
      await storage.setSetting("crm_last_order_incremental_sync", now);
      await storage.setSetting("crm_last_order_sync", now);
      res.json({ success: true, synced });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/crm/sync/auto/customers — toggle auto-sync
  app.post("/api/crm/sync/auto/customers", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser;
      if (user?.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      const { enabled } = req.body as { enabled: boolean };
      await storage.setSetting("crm_auto_sync_customers", enabled);
      res.json({ success: true, enabled });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/crm/sync/auto/orders — toggle auto-sync
  app.post("/api/crm/sync/auto/orders", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser;
      if (user?.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      const { enabled } = req.body as { enabled: boolean };
      await storage.setSetting("crm_auto_sync_orders", enabled);
      res.json({ success: true, enabled });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // DELETE /api/crm/sync/customers/reset
  app.delete("/api/crm/sync/customers/reset", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser;
      if (user?.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      await storage.truncateCrmCustomers();
      await storage.setSetting("crm_last_customer_sync", null);
      await storage.setSetting("crm_last_customer_incremental_sync", null);
      res.json({ success: true, message: "Customer mirror cleared" });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // DELETE /api/crm/sync/orders/reset
  app.delete("/api/crm/sync/orders/reset", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser;
      if (user?.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      await storage.truncateCrmOrders();
      await storage.setSetting("crm_last_order_sync", null);
      await storage.setSetting("crm_last_order_incremental_sync", null);
      res.json({ success: true, message: "Order mirror cleared" });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Order Line Items sync routes ──────────────────────────────────────────

  // Helper: fetch and store line items for a single BC order.
  // Handles 429 rate-limit by waiting the reset window then retrying once.
  async function fetchAndStoreLineItems(
    orderId: number, orderDate: Date | null, customerName: string | null,
    customerEmail: string | null, bcCustomerId: number | null,
    storeHash: string, headers: Record<string, string>,
  ): Promise<"ok" | "empty" | "error"> {
    let fetchRes: Response;
    try {
      fetchRes = await fetch(`https://api.bigcommerce.com/stores/${storeHash}/v2/orders/${orderId}/products?limit=250`, { headers });
    } catch { return "error"; }

    // Rate limited — wait and retry once
    if (fetchRes.status === 429) {
      const waitMs = Number(fetchRes.headers.get("X-Rate-Limit-Time-Reset-Ms") ?? "10000");
      await new Promise(r => setTimeout(r, waitMs + 200));
      try {
        fetchRes = await fetch(`https://api.bigcommerce.com/stores/${storeHash}/v2/orders/${orderId}/products?limit=250`, { headers });
      } catch { return "error"; }
    }

    if (!fetchRes.ok) return "error";
    let bcItems: any[];
    try { bcItems = await fetchRes.json(); } catch { return "error"; }
    if (!Array.isArray(bcItems!) || bcItems!.length === 0) return "empty";

    const newItems = bcItems!.map((item: any) => {
      const options = Array.isArray(item.product_options)
        ? item.product_options.map((o: any) => o.display_value ?? o.value ?? "").filter(Boolean).join(" / ")
        : null;
      return {
        bigcommerce_order_id: orderId,
        bigcommerce_product_id: item.product_id,
        variant_id: item.variant_id || null,
        product_name: item.name ?? "",
        sku: item.sku ?? "",
        variant_label: options || null,
        quantity: Number(item.quantity) || 0,
        base_price: String(item.base_price ?? item.price_ex_tax ?? "0"),
        order_date: orderDate,
        customer_name: customerName,
        customer_email: customerEmail,
        bigcommerce_customer_id: bcCustomerId,
      };
    });
    await storage.insertBcOrderLineItems(newItems);
    return "ok";
  }

  // ── Dedup cleanup for bc_order_line_items (run once to fix duplicate sync) ───
  const dedupState = { running: false, deleted: 0, error: null as string | null, finishedAt: null as string | null };

  app.get("/api/crm/sync/line-items/dedup-status", requireAuth, (_req, res) => {
    res.json({ ...dedupState });
  });

  app.post("/api/crm/sync/line-items/dedup", requireAuth, async (_req, res) => {
    if (dedupState.running) return res.json({ started: false, already_running: true, ...dedupState });
    dedupState.running = true; dedupState.deleted = 0; dedupState.error = null; dedupState.finishedAt = null;
    res.json({ started: true, message: "Dedup started — poll /api/crm/sync/line-items/dedup-status for progress." });

    // Run in background — create new table, swap, add unique index
    ;(async () => {
      try {
        const { db } = await import("../db");
        const { sql } = await import("drizzle-orm");
        // Step 1: create deduplicated copy
        await db.execute(sql.raw(`
          CREATE TABLE bc_order_line_items_deduped AS
          SELECT DISTINCT ON (bigcommerce_order_id, bigcommerce_product_id, COALESCE(variant_id, 0))
            *
          FROM bc_order_line_items
          ORDER BY bigcommerce_order_id, bigcommerce_product_id, COALESCE(variant_id, 0), id ASC
        `));
        // Step 2: count how many will be removed
        const [orig, deduped] = await Promise.all([
          db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM bc_order_line_items`)),
          db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM bc_order_line_items_deduped`)),
        ]);
        dedupState.deleted = ((orig.rows[0] as any).c ?? 0) - ((deduped.rows[0] as any).c ?? 0);
        // Step 3: swap tables atomically
        await db.execute(sql.raw(`ALTER TABLE bc_order_line_items RENAME TO bc_order_line_items_old`));
        await db.execute(sql.raw(`ALTER TABLE bc_order_line_items_deduped RENAME TO bc_order_line_items`));
        // Restore sequence/identity: re-add generated identity column
        await db.execute(sql.raw(`ALTER TABLE bc_order_line_items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY`));
        await db.execute(sql.raw(`SELECT setval(pg_get_serial_sequence('bc_order_line_items','id'), (SELECT MAX(id) FROM bc_order_line_items))`));
        // Step 4: add unique index to prevent future dupes
        await db.execute(sql.raw(`
          CREATE UNIQUE INDEX bc_order_line_items_order_product_variant_unique
          ON bc_order_line_items (bigcommerce_order_id, bigcommerce_product_id, COALESCE(variant_id, 0))
        `));
        // Step 5: drop backup
        await db.execute(sql.raw(`DROP TABLE bc_order_line_items_old`));
        dedupState.finishedAt = new Date().toISOString();
        dedupState.running = false;
        console.log(`[dedup] Done. Removed ${dedupState.deleted} duplicate line items.`);
      } catch (e: any) {
        dedupState.error = e.message;
        dedupState.running = false;
        console.error("[dedup] Error:", e.message);
        // Cleanup temp table if it exists
        try {
          const { db } = await import("../db");
          const { sql } = await import("drizzle-orm");
          await db.execute(sql.raw(`DROP TABLE IF EXISTS bc_order_line_items_deduped`));
        } catch {}
      }
    })();
  });

  // In-memory state for the long-running full line-items sync (background job)
  const liSyncState = {
    running: false,
    synced: 0,
    failed: 0,
    total: 0,
    error: null as string | null,
    finishedAt: null as string | null,
  };

  // GET /api/crm/sync/line-items/status — poll progress of background full sync
  app.get("/api/crm/sync/line-items/status", requireAuth, (_req, res) => {
    res.json({ ...liSyncState });
  });

  // POST /api/crm/sync/line-items — starts full sync as a background job and returns immediately.
  // Truncates the local table, then re-syncs all orders from customer_orders_mirror.
  app.post("/api/crm/sync/line-items", requireAuth, async (_req, res) => {
    if (liSyncState.running) {
      return res.json({ started: false, already_running: true, ...liSyncState });
    }

    let storeHash: string, token: string;
    try {
      const cfg = await getBcConfig();
      if (!cfg.storeHash || !cfg.token) return res.status(400).json({ error: "BigCommerce not configured" });
      storeHash = String(cfg.storeHash);
      token = String(cfg.token);
    } catch (e: any) { return res.status(500).json({ error: e.message }); }

    // Reset state and acknowledge immediately
    liSyncState.running = true;
    liSyncState.synced = 0;
    liSyncState.failed = 0;
    liSyncState.total = 0;
    liSyncState.error = null;
    liSyncState.finishedAt = null;
    res.json({ started: true, message: "Full sync started — poll /api/crm/sync/line-items/status for progress." });

    // Run the actual work in background (not awaited)
    ;(async () => {
      try {
        const headers = { "X-Auth-Token": token, "Accept": "application/json" };
        await storage.truncateBcOrderLineItems();
        const orders = await storage.getCrmOrdersForLineItemSync();
        liSyncState.total = orders.length;
        for (const order of orders) {
          const result = await fetchAndStoreLineItems(
            order.bigcommerce_order_id, order.order_date, order.customer_name,
            order.customer_email, order.bigcommerce_customer_id, storeHash, headers,
          );
          if (result === "ok") liSyncState.synced++;
          else if (result === "error") liSyncState.failed++;
          await new Promise(r => setTimeout(r, 220));
        }
        const now = new Date().toISOString();
        await storage.setSetting("crm_last_line_items_sync", now);
        await storage.setSetting("crm_last_line_items_incremental_sync", now);
        liSyncState.finishedAt = now;
      } catch (e: any) {
        liSyncState.error = e.message;
      } finally {
        liSyncState.running = false;
      }
    })();
  });

  // POST /api/crm/sync/line-items/incremental — only orders since last sync
  app.post("/api/crm/sync/line-items/incremental", requireAuth, async (_req, res) => {
    try {
      const { storeHash, token } = await getBcConfig();
      if (!storeHash || !token) return res.status(400).json({ error: "BigCommerce not configured" });
      const headers = { "X-Auth-Token": String(token), "Accept": "application/json" };
      const lastSync = await storage.getSetting("crm_last_line_items_sync");
      const since = lastSync?.value ? String(lastSync.value).slice(0, 10) : undefined;
      const orders = await storage.getCrmOrdersForLineItemSync(since);
      const alreadySynced = await storage.getSyncedBcOrderIds(since);
      let synced = 0;
      let failed = 0;
      for (const order of orders) {
        if (alreadySynced.has(order.bigcommerce_order_id)) continue;
        const result = await fetchAndStoreLineItems(
          order.bigcommerce_order_id, order.order_date, order.customer_name,
          order.customer_email, order.bigcommerce_customer_id, storeHash, headers,
        );
        if (result === "ok") { alreadySynced.add(order.bigcommerce_order_id); synced++; }
        else if (result === "error") failed++;
        await new Promise(r => setTimeout(r, 220));
      }
      const now = new Date().toISOString();
      await storage.setSetting("crm_last_line_items_incremental_sync", now);
      await storage.setSetting("crm_last_line_items_sync", now);
      res.json({ success: true, synced, failed });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/crm/sync/auto/line-items — toggle auto-sync
  app.post("/api/crm/sync/auto/line-items", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser;
      if (user?.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      const { enabled } = req.body as { enabled: boolean };
      await storage.setSetting("crm_auto_sync_line_items", enabled);
      res.json({ success: true, enabled });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // DELETE /api/crm/sync/line-items/reset
  app.delete("/api/crm/sync/line-items/reset", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser;
      if (user?.role !== "admin") return res.status(403).json({ error: "Forbidden" });
      await storage.truncateBcOrderLineItems();
      await storage.setSetting("crm_last_line_items_sync", null);
      await storage.setSetting("crm_last_line_items_incremental_sync", null);
      res.json({ success: true, message: "Order line items mirror cleared" });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Auto-sync background job ──────────────────────────────────────────────
  // Runs every 15 minutes; performs incremental sync for whichever entities
  // have auto-sync enabled. No-op if BigCommerce is not configured.
  setInterval(async () => {
    try {
      const { storeHash, token } = await getBcConfig();
      if (!storeHash || !token) return;

      const [autoC, autoO, autoLI] = await Promise.all([
        storage.getSetting("crm_auto_sync_customers"),
        storage.getSetting("crm_auto_sync_orders"),
        storage.getSetting("crm_auto_sync_line_items"),
      ]);

      if (autoC?.value === true || autoC?.value === "true") {
        try {
          const lastSync = await storage.getSetting("crm_last_customer_sync");
          const since = lastSync?.value ? new Date(lastSync.value) : null;
          const cgRes = await fetch(`https://api.bigcommerce.com/stores/${storeHash}/v2/customer_groups?limit=200`, {
            headers: { "X-Auth-Token": String(token), Accept: "application/json" },
          });
          const cgData: any[] = cgRes.ok ? await cgRes.json() : [];
          const groupNameMap: Record<number, string> = {};
          for (const g of cgData) groupNameMap[g.id] = g.name;
          let page = 1;
          while (true) {
            let url = `https://api.bigcommerce.com/stores/${storeHash}/v3/customers?include=addresses&limit=250&page=${page}`;
            if (since) url += `&date_modified:min=${since.toISOString()}`;
            const r = await fetch(url, { headers: { "X-Auth-Token": String(token), Accept: "application/json" } });
            if (!r.ok) break;
            const json = await r.json();
            const bcCustomers: any[] = json.data ?? [];
            if (bcCustomers.length === 0) break;
            for (const bc of bcCustomers) {
              const billing = bc.addresses?.find((a: any) => a.address_type === "commercial") ?? bc.addresses?.[0] ?? null;
              const shipping = bc.addresses?.find((a: any) => a.address_type === "residential") ?? null;
              const primaryAddrType = bc.addresses?.[0]?.address_type;
              const derivedAddressType = primaryAddrType === "residential" ? "Residential" : primaryAddrType === "commercial" ? "Commercial" : "Unknown";
              await storage.upsertCrmCustomer({
                bigcommerce_customer_id: bc.id, company: bc.company || null,
                first_name: bc.first_name || "", last_name: bc.last_name || "",
                email: bc.email || "", phone: bc.phone || null,
                customer_group_id: bc.customer_group_id || null,
                customer_group_name: groupNameMap[bc.customer_group_id] ?? null,
                billing_address: billing ? { street1: billing.address1, street2: billing.address2, city: billing.city, state: billing.state_or_province, zip: billing.postal_code, country: billing.country } : null,
                shipping_address: shipping ? { street1: shipping.address1, street2: shipping.address2, city: shipping.city, state: shipping.state_or_province, zip: shipping.postal_code, country: shipping.country } : null,
                created_date: bc.date_created ? new Date(bc.date_created) : null,
                is_active: true, store_credit_balance: "0",
                address_type: derivedAddressType,
              });
            }
            if (bcCustomers.length < 250) break;
            page++;
          }
          const now = new Date().toISOString();
          await storage.setSetting("crm_last_customer_incremental_sync", now);
          await storage.setSetting("crm_last_customer_sync", now);
        } catch (e) { console.error("[Auto-sync] customer error:", e); }
      }

      if (autoO?.value === true || autoO?.value === "true") {
        try {
          const lastSync = await storage.getSetting("crm_last_order_sync");
          const since = lastSync?.value ? new Date(lastSync.value) : null;
          let page = 1;
          while (true) {
            let url = `https://api.bigcommerce.com/stores/${storeHash}/v2/orders?limit=250&page=${page}&sort=id:desc`;
            if (since) url += `&min_date_modified=${since.toISOString()}`;
            const r = await fetch(url, { headers: { "X-Auth-Token": String(token), Accept: "application/json" } });
            if (!r.ok || r.status === 204) break;
            const bcOrders: any[] = await r.json();
            if (!Array.isArray(bcOrders) || bcOrders.length === 0) break;
            for (const o of bcOrders) {
              if (!o.customer_id || o.customer_id === 0) continue;
              const customerName = [o.billing_address?.first_name, o.billing_address?.last_name].filter(Boolean).join(" ");
              await storage.upsertCrmOrder({
                bigcommerce_order_id: o.id, bigcommerce_customer_id: o.customer_id,
                order_number: o.id, order_date: o.date_created ? new Date(o.date_created) : null,
                order_total: String(o.total_inc_tax || "0"), status: o.status || null,
                payment_status: o.payment_status || null, customer_name: customerName || null,
                customer_email: o.billing_address?.email || null,
                staff_notes: o.staff_notes || o.order_note || null,
                customer_order_notes: o.customer_message || null,
              });
            }
            if (bcOrders.length < 250) break;
            page++;
          }
          await storage.recalculateCrmCustomerStats();
          const now = new Date().toISOString();
          await storage.setSetting("crm_last_order_incremental_sync", now);
          await storage.setSetting("crm_last_order_sync", now);
        } catch (e) { console.error("[Auto-sync] orders error:", e); }
      }

      if (autoLI?.value === true || autoLI?.value === "true") {
        try {
          const headers = { "X-Auth-Token": String(token), "Accept": "application/json" };
          const lastSync = await storage.getSetting("crm_last_line_items_sync");
          const since = lastSync?.value ? String(lastSync.value).slice(0, 10) : undefined;
          const orders = await storage.getCrmOrdersForLineItemSync(since);
          const alreadySynced = await storage.getSyncedBcOrderIds(since);
          for (const order of orders) {
            if (alreadySynced.has(order.bigcommerce_order_id)) continue;
            const result = await fetchAndStoreLineItems(
              order.bigcommerce_order_id, order.order_date, order.customer_name,
              order.customer_email, order.bigcommerce_customer_id, storeHash, headers,
            );
            if (result === "ok") alreadySynced.add(order.bigcommerce_order_id);
            await new Promise(r => setTimeout(r, 220));
          }
          const now = new Date().toISOString();
          await storage.setSetting("crm_last_line_items_incremental_sync", now);
          await storage.setSetting("crm_last_line_items_sync", now);
        } catch (e) { console.error("[Auto-sync] line-items error:", e); }
      }
    } catch (e) { console.error("[Auto-sync] config error:", e); }
  }, 15 * 60 * 1000); // every 15 minutes

  // ── CRM permission auto-seed ──────────────────────────────────────────────────
  // Ensures the 5 CRM RBAC permissions exist in the DB at startup so admins can
  // assign them to roles/users through the normal RBAC console.
  await (async () => {
    const CRM_PERMS: Array<{ module: string; action: string; description: string }> = [
      { module: "crm", action: "visibility_all",                description: "CRM: see all customers regardless of rep assignment" },
      { module: "crm", action: "visibility_assigned_unassigned", description: "CRM: see own-assigned customers + unassigned customers" },
      { module: "crm", action: "visibility_assigned_only",       description: "CRM: see only own-assigned customers" },
      { module: "crm", action: "assign_rep",                     description: "CRM: assign / remove a sales rep on a customer" },
      { module: "crm", action: "export",                         description: "CRM: export customer list to CSV / Excel" },
    ];
    try {
      const existing = await storage.getPermissions();
      const existingSet = new Set(existing.map((p: any) => `${p.module}:${p.action}`));
      for (const p of CRM_PERMS) {
        if (!existingSet.has(`${p.module}:${p.action}`)) {
          await storage.createPermission({ module: p.module, action: p.action, description: p.description });
        }
      }
    } catch (_) { /* non-fatal — permissions may already exist */ }
  })();

  // ── Inventory Audit permission auto-seed ──────────────────────────────────────
  await (async () => {
    const AUDIT_PERMS: Array<{ module: string; action: string; description: string }> = [
      { module: "inventory_audit", action: "view", description: "Inventory Audit: View audit queue and history" },
      { module: "inventory_audit", action: "audit", description: "Inventory Audit: Complete audits and adjust SKUVault inventory" },
    ];
    try {
      const existing = await storage.getAllPermissions();
      const existingSet = new Set(existing.map((p: any) => `${p.module}:${p.action}`));
      for (const p of AUDIT_PERMS) {
        if (!existingSet.has(`${p.module}:${p.action}`)) {
          await storage.createPermission({ module: p.module, action: p.action, description: p.description });
        }
      }
    } catch (_) { /* non-fatal */ }
  })();

  // ── Customer signup permission auto-seed ──────────────────────────────────────
  await (async () => {
    const SIGNUP_PERMS: Array<{ module: string; action: string; description: string }> = [
      { module: "customers_submit_docs", action: "view", description: "Customers: access the Submit Docs form" },
      { module: "customer_signups", action: "view", description: "Customers: view own customer signups" },
      { module: "customer_signups", action: "view_all", description: "Customers: view all customer signups" },
    ];
    try {
      const existing = await storage.getAllPermissions();
      const existingSet = new Set(existing.map((p: any) => `${p.module}:${p.action}`));
      for (const p of SIGNUP_PERMS) {
        if (!existingSet.has(`${p.module}:${p.action}`)) {
          await storage.createPermission({ module: p.module, action: p.action, description: p.description });
        }
      }
    } catch (_) { /* non-fatal */ }
  })();

  // ── Reports permission auto-seed ──────────────────────────────────────────────
  await (async () => {
    const REPORT_PERMS: Array<{ module: string; action: string; description: string }> = [
      { module: "reporting_sales",                action: "view", description: "Reporting: Sales Report (summary + order details)" },
      { module: "reporting_price_override_audit", action: "view", description: "Reporting: Price Override Audit log" },
      { module: "reporting_store_credit_usage",   action: "view", description: "Reporting: Store Credit Usage log" },
    ];
    try {
      const existing = await storage.getAllPermissions();
      const existingSet = new Set(existing.map((p: any) => `${p.module}:${p.action}`));
      for (const p of REPORT_PERMS) {
        if (!existingSet.has(`${p.module}:${p.action}`)) {
          await storage.createPermission({ module: p.module, action: p.action, description: p.description });
        }
      }
    } catch (_) { /* non-fatal */ }
  })();

  // ── Marketing permission auto-seed ────────────────────────────────────────────
  await (async () => {
    const MARKETING_PERMS: Array<{ module: string; action: string; description: string }> = [
      { module: "marketing", action: "view", description: "Marketing: view dashboard, campaigns, and audiences" },
      { module: "marketing", action: "create", description: "Marketing: create and duplicate campaigns" },
      { module: "marketing", action: "edit", description: "Marketing: edit campaign content and audience settings" },
      { module: "marketing", action: "delete", description: "Marketing: delete unsent campaigns" },
      { module: "marketing", action: "send", description: "Marketing: schedule, pause, and send campaigns" },
      { module: "marketing", action: "view_analytics", description: "Marketing: view campaign analytics" },
      { module: "marketing", action: "manage_audiences", description: "Marketing: create, edit, import, and delete audiences" },
      { module: "marketing", action: "manage_templates", description: "Marketing: create, edit, archive, and reuse templates" },
      { module: "marketing", action: "manage_automations", description: "Marketing: create and manage automations" },
      { module: "marketing", action: "manage_suppressions", description: "Marketing: manage customer preferences and suppressions" },
    ];
    try {
      const existing = await storage.getAllPermissions();
      const existingSet = new Set(existing.map((p: any) => `${p.module}:${p.action}`));
      for (const p of MARKETING_PERMS) {
        if (!existingSet.has(`${p.module}:${p.action}`)) {
          await storage.createPermission({ module: p.module, action: p.action, description: p.description });
        }
      }
    } catch (_) { /* non-fatal */ }
  })();

  // ── CRM visibility scope helper ───────────────────────────────────────────────
  // Non-admin users without an explicit visibility permission default to ASSIGNED_ONLY
  // (least-privilege). Admins always get ALL_CUSTOMERS.
  async function getCrmVisibilityScope(stor: typeof storage, userId: number, userRole: string, permStrings?: string[]): Promise<{ scope: string; userId: number }> {
    if (userRole === "admin") return { scope: "ALL_CUSTOMERS", userId };
    const perms = permStrings ?? await stor.getUserPermissionStrings(userId);
    if (perms.includes("crm:view_all") || perms.includes("crm:visibility_all")) return { scope: "ALL_CUSTOMERS", userId };
    if (perms.includes("crm:visibility_assigned_unassigned")) return { scope: "ASSIGNED_AND_UNASSIGNED", userId };
    if (perms.includes("crm:visibility_assigned_only")) return { scope: "ASSIGNED_ONLY", userId };
    return { scope: "ASSIGNED_ONLY", userId };
  }

  // ── BC Customer Notes helpers ─────────────────────────────────────────────────
  const BC_GN_HEADER = "=== CUSTOMER GENERAL NOTES ===";
  const BC_CH_HEADER = "=== CRM HISTORY ===";

  function parseBcCustomerNotes(raw: string | null | undefined): { generalNotes: string; crmHistory: string } {
    if (!raw?.trim()) return { generalNotes: "", crmHistory: "" };
    const gnIdx = raw.indexOf(BC_GN_HEADER);
    const chIdx = raw.indexOf(BC_CH_HEADER);
    if (gnIdx === -1 && chIdx === -1) return { generalNotes: raw.trim(), crmHistory: "" };
    let generalNotes = "";
    let crmHistory = "";
    if (gnIdx !== -1) {
      const afterHeader = raw.slice(gnIdx + BC_GN_HEADER.length);
      const nextBlock = afterHeader.indexOf(BC_CH_HEADER);
      generalNotes = (nextBlock === -1 ? afterHeader : afterHeader.slice(0, nextBlock)).trim();
    }
    if (chIdx !== -1) {
      crmHistory = raw.slice(chIdx + BC_CH_HEADER.length).trim();
    }
    return { generalNotes, crmHistory };
  }

  function buildBcCustomerNotes(generalNotes: string, crmHistory: string): string {
    return [
      BC_GN_HEADER,
      generalNotes || "",
      "",
      BC_CH_HEADER,
      ...(crmHistory ? [crmHistory] : []),
    ].join("\n");
  }

  function appendCrmHistoryEntry(existingHistory: string, noteType: string, userName: string, noteText: string, date: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    const y = date.getFullYear(), mo = pad(date.getMonth() + 1), d = pad(date.getDate());
    let h = date.getHours(); const mins = pad(date.getMinutes()); const ampm = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
    const dateStr = `${y}-${mo}-${d} ${pad(h)}:${mins} ${ampm}`;
    const entry = `---\nDate: ${dateStr}\nType: ${noteType}\nUser: ${userName}\nSource: CRM\n\n${noteText}\n---`;
    return existingHistory.trim() ? existingHistory.trim() + "\n" + entry : entry;
  }

  async function fetchBcCustomerNotes(storeHash: string, token: string, bcCustomerId: number): Promise<string> {
    const resp = await fetch(`https://api.bigcommerce.com/stores/${storeHash}/v2/customers/${bcCustomerId}`, {
      headers: { "X-Auth-Token": token, Accept: "application/json" },
    });
    if (!resp.ok) throw new Error(`BC API error ${resp.status}`);
    const data = await resp.json();
    return data.notes ?? "";
  }

  async function pushBcCustomerNotes(storeHash: string, token: string, bcCustomerId: number, notes: string): Promise<void> {
    const resp = await fetch(`https://api.bigcommerce.com/stores/${storeHash}/v2/customers/${bcCustomerId}`, {
      method: "PUT",
      headers: { "X-Auth-Token": token, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ notes }),
    });
    if (!resp.ok) { const err = await resp.text().catch(() => ""); throw new Error(`BC API error ${resp.status}: ${err}`); }
  }

  // Note types that get auto-appended to CRM HISTORY (order-linked notes are excluded)
  const CRM_SYNC_NOTE_TYPES = new Set(["General", "Sales", "Follow Up", "Issue", "Internal"]);

  // ── CRM customer access check (IDOR prevention) ───────────────────────────────
  // Returns true if the caller may access the given customer; sends 403 and returns
  // false if they cannot. Fetch perms once and reuse to avoid duplicate DB round-trips.
  async function assertCrmCustomerAccess(
    stor: typeof storage,
    customerId: number,
    userId: number,
    userRole: string,
    res: Response,
  ): Promise<boolean> {
    if (userRole === "admin") return true;
    const perms = await stor.getUserPermissionStrings(userId);
    const visScope = await getCrmVisibilityScope(stor, userId, userRole, perms);
    if (visScope.scope === "ALL_CUSTOMERS") return true;
    const rep = await stor.getCrmSalesRep(customerId);
    if (visScope.scope === "ASSIGNED_ONLY") {
      if (rep?.assigned_user_id !== userId) {
        res.status(403).json({ error: "Forbidden: customer not in your visibility scope" });
        return false;
      }
      return true;
    }
    if (visScope.scope === "ASSIGNED_AND_UNASSIGNED") {
      // Allow if unassigned OR assigned to this user
      if (rep !== undefined && rep.assigned_user_id !== userId) {
        res.status(403).json({ error: "Forbidden: customer not in your visibility scope" });
        return false;
      }
      return true;
    }
    res.status(403).json({ error: "Forbidden: customer not in your visibility scope" });
    return false;
  }

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
      const user = (req as any).authUser;
      const userId = user?.id as number;
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const { search = "", sortBy = "last_order_date", sortDir = "desc", format = "csv", group = "", state = "", health = "", assignedRep = "", customerType = "", addressType = "", primaryRep = "", secondaryRep = "" } = req.query as any;
      let perms: string[] = [];
      if (user.role !== "admin") {
        perms = await storage.getUserPermissionStrings(userId);
        if (!perms.includes("crm:export")) {
          try {
            await storage.createCrmAuditLog({
              user_id: userId, action: "export_denied", customer_id: null,
              detail: { timestamp: new Date().toISOString(), format: String(format), filters: { search, group, state, health, assignedRep } },
            });
          } catch (_) {}
          return res.status(403).json({ error: "Forbidden: crm:export permission required" });
        }
      }
      const visScope = await getCrmVisibilityScope(storage, userId, user.role, user.role !== "admin" ? perms : undefined);
      const repFilter = assignedRep === "unassigned" ? "unassigned" : (assignedRep ? parseInt(String(assignedRep)) : undefined) as number | "unassigned" | undefined;
      const primaryRepFilterExp = primaryRep === "unassigned" ? "unassigned" : (primaryRep ? parseInt(String(primaryRep)) : undefined) as number | "unassigned" | undefined;
      const secondaryRepFilterExp = secondaryRep === "unassigned" ? "unassigned" : (secondaryRep ? parseInt(String(secondaryRep)) : undefined) as number | "unassigned" | undefined;
      const customers = await storage.getAllCrmCustomersForExport({ search, group: group || undefined, state: state || undefined, health: health || undefined, customerType: customerType || undefined, addressType: addressType || undefined, primaryRep: primaryRepFilterExp, secondaryRep: secondaryRepFilterExp, sortBy, sortDir, assignedRep: repFilter, visibilityScope: visScope.scope, visibilityUserId: visScope.userId });
      const headers = ["BC Customer ID", "Company", "First Name", "Last Name", "Email", "Phone", "City", "State", "Customer Group", "Customer Type", "Address Type", "Primary Rep", "Secondary Rep", "Last Order Date", "Lifetime Orders", "Lifetime Revenue", "Health Status", "Last Action Date", "Last Action Type"];
      const rows = customers.map(c => {
        const addr = (c.shipping_address as any) ?? (c.billing_address as any) ?? {};
        const lastActionDate = (c as any).last_action_date
          ? new Date((c as any).last_action_date).toISOString().split("T")[0]
          : "";
        return [
          String(c.bigcommerce_customer_id),
          c.company ?? "",
          c.first_name,
          c.last_name,
          c.email,
          c.phone ?? "",
          addr.city ?? "",
          addr.state ?? "",
          c.customer_group_name ?? "",
          (c as any).customer_type ?? "Store",
          (c as any).address_type ?? "Unknown",
          (c as any).primary_rep_name ?? "",
          (c as any).secondary_rep_name ?? "",
          c.last_order_date ? new Date(c.last_order_date).toISOString().split("T")[0] : "",
          String(c.lifetime_orders ?? 0),
          String(c.lifetime_revenue ?? "0"),
          c.account_health ?? "Lost",
          lastActionDate,
          (c as any).last_action_type ?? "",
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
      const user = (req as any).authUser;
      const userId = user?.id as number;
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const { search = "", sortBy = "last_order_date", sortDir = "desc", group = "", state = "", health = "", assignedRep = "", customerType = "", addressType = "", primaryRep = "", secondaryRep = "", accountType = "", status = "active" } = req.query as any;
      const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
      const offset = parseInt(String(req.query.offset ?? "0"));
      const perms = user.role !== "admin" ? await storage.getUserPermissionStrings(userId) : [];
      const visScope = await getCrmVisibilityScope(storage, userId, user.role, user.role !== "admin" ? perms : undefined);
      const repFilter = assignedRep === "unassigned" ? "unassigned" : (assignedRep ? parseInt(String(assignedRep)) : undefined) as number | "unassigned" | undefined;
      const primaryRepFilter = primaryRep === "unassigned" ? "unassigned" : (primaryRep ? parseInt(String(primaryRep)) : undefined) as number | "unassigned" | undefined;
      const secondaryRepFilter = secondaryRep === "unassigned" ? "unassigned" : (secondaryRep ? parseInt(String(secondaryRep)) : undefined) as number | "unassigned" | undefined;
      const result = await storage.getCrmCustomers({ search, group: group || undefined, state: state || undefined, health: health || undefined, customerType: customerType || undefined, addressType: addressType || undefined, primaryRep: primaryRepFilter, secondaryRep: secondaryRepFilter, sortBy, sortDir, limit, offset, assignedRep: repFilter, visibilityScope: visScope.scope, visibilityUserId: visScope.userId, accountType: accountType || undefined, status: status || "active" });
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
      const user = (req as any).authUser;
      const userId = user?.id as number;
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const id = parseInt(req.params.id);
      const customer = await storage.getCrmCustomerById(id);
      if (!customer) return res.status(404).json({ error: "Customer not found" });
      if (!await assertCrmCustomerAccess(storage, id, userId, user.role, res)) return;

      // Refresh store credit live from BC v2 (fire-and-forget style but awaited so the response is fresh)
      try {
        const setting = await storage.getSetting("bigcommerce_config");
        let storeHash = process.env.BC_STORE_HASH;
        let token = process.env.BC_TOKEN;
        if (setting?.value) {
          const cfg = typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value;
          storeHash = cfg.storeHash || storeHash;
          token = cfg.token || token;
        }
        if (storeHash && token) {
          const bcUrl = `https://api.bigcommerce.com/stores/${storeHash}/v2/customers/${customer.bigcommerce_customer_id}`;
          const bcRes = await fetch(bcUrl, { headers: { "X-Auth-Token": String(token), Accept: "application/json" } });
          if (bcRes.ok) {
            const bcData = await bcRes.json();
            const rawCredit = bcData?.store_credit_amount ?? bcData?.store_credit;
            if (rawCredit != null) {
              const updated = await storage.upsertCrmCustomer({
                bigcommerce_customer_id: customer.bigcommerce_customer_id,
                company: customer.company,
                first_name: customer.first_name,
                last_name: customer.last_name,
                email: customer.email,
                phone: customer.phone,
                customer_group_id: customer.customer_group_id,
                customer_group_name: customer.customer_group_name,
                billing_address: customer.billing_address as any,
                shipping_address: customer.shipping_address as any,
                created_date: customer.created_date,
                is_active: customer.is_active,
                store_credit_balance: String(rawCredit),
              });
              return res.json({ ...customer, ...updated, sales_rep_name: customer.sales_rep_name });
            }
          }
        }
      } catch (_) {
        // BC refresh failed — return cached data silently
      }

      res.json(customer);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // PATCH /api/crm/customers/:id — update master fields (primary_rep, secondary_rep, customer_type, account_type, inactive fields)
  app.patch("/api/crm/customers/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser;
      const userId = user?.id as number;
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const id = parseInt(req.params.id);
      if (!await assertCrmCustomerAccess(storage, id, userId, user.role, res)) return;
      const { primary_rep_id, secondary_rep_id, customer_type, account_type, inactive_reason, inactive_notes, mark_inactive, restore_active } = req.body;
      if (customer_type !== undefined && !["Store", "Distributor"].includes(customer_type)) {
        return res.status(400).json({ error: "Invalid customer_type" });
      }
      const ACCOUNT_TYPES = ["customer", "vendor", "internal"];
      if (account_type !== undefined && !ACCOUNT_TYPES.includes(account_type)) {
        return res.status(400).json({ error: "Invalid account_type" });
      }

      // Check permissions for ERP-only fields
      const perms = user.role !== "admin" ? await storage.getUserPermissionStrings(userId) : [];
      if (account_type !== undefined && user.role !== "admin" && !perms.includes("crm:manage_account_classification")) {
        return res.status(403).json({ error: "Forbidden: crm:manage_account_classification required" });
      }
      if ((mark_inactive || restore_active) && user.role !== "admin" && !perms.includes("crm:manage_inactive_accounts")) {
        return res.status(403).json({ error: "Forbidden: crm:manage_inactive_accounts required" });
      }

      // Load current state before update for timeline logging
      const before = await storage.getCrmCustomerById(id);
      if (!before) return res.status(404).json({ error: "Customer not found" });

      const data: Record<string, any> = {};
      if ('primary_rep_id' in req.body) data.primary_rep_id = primary_rep_id != null ? Number(primary_rep_id) : null;
      if ('secondary_rep_id' in req.body) data.secondary_rep_id = secondary_rep_id != null ? Number(secondary_rep_id) : null;
      if (customer_type !== undefined) data.customer_type = customer_type;
      if (account_type !== undefined) data.account_type = account_type;
      if (mark_inactive) {
        data.inactive_at = new Date();
        data.inactive_reason = inactive_reason ?? null;
        data.inactive_notes = inactive_notes ?? null;
        data.inactivated_by_user_id = userId;
        data.is_active = false;
      }
      if (restore_active) {
        data.inactive_at = null;
        data.inactive_reason = null;
        data.inactive_notes = null;
        data.inactivated_by_user_id = null;
        data.is_active = true;
      }

      // Resolve old rep names before update
      const [oldPrimaryUser, oldSecondaryUser] = await Promise.all([
        (before as any).primary_rep_id ? storage.getUser((before as any).primary_rep_id) : Promise.resolve(null),
        (before as any).secondary_rep_id ? storage.getUser((before as any).secondary_rep_id) : Promise.resolve(null),
      ]);

      await storage.updateCrmCustomerMasterFields(id, data);

      // Keep customer_sales_rep in sync with primary_rep_id for visibility scoping
      if ('primary_rep_id' in data) {
        if (data.primary_rep_id) {
          await storage.setCrmSalesRep({ customer_id: id, assigned_user_id: data.primary_rep_id, assigned_by: userId });
        } else {
          await storage.removeCrmSalesRep(id);
        }
      }

      // Resolve new rep names for logging
      const [newPrimaryUser, newSecondaryUser] = await Promise.all([
        ('primary_rep_id' in data && data.primary_rep_id) ? storage.getUser(data.primary_rep_id) : Promise.resolve(null),
        ('secondary_rep_id' in data && data.secondary_rep_id) ? storage.getUser(data.secondary_rep_id) : Promise.resolve(null),
      ]);

      // Timeline + audit logging
      const auditEntries: Promise<void>[] = [];

      if ('primary_rep_id' in data) {
        const oldName = oldPrimaryUser?.name ?? null;
        const newName = newPrimaryUser?.name ?? null;
        const oldId = (before as any).primary_rep_id ?? null;
        const action = !oldId && data.primary_rep_id ? "primary_rep_assigned"
          : oldId && !data.primary_rep_id ? "primary_rep_removed"
          : "primary_rep_changed";
        auditEntries.push(storage.createCrmAuditLog({
          user_id: userId,
          action,
          customer_id: id,
          detail: { old_value: oldName, new_value: newName },
        }));
      }

      if ('secondary_rep_id' in data) {
        const oldName = oldSecondaryUser?.name ?? null;
        const newName = newSecondaryUser?.name ?? null;
        const oldId = (before as any).secondary_rep_id ?? null;
        const action = !oldId && data.secondary_rep_id ? "secondary_rep_assigned"
          : oldId && !data.secondary_rep_id ? "secondary_rep_removed"
          : "secondary_rep_changed";
        auditEntries.push(storage.createCrmAuditLog({
          user_id: userId,
          action,
          customer_id: id,
          detail: { old_value: oldName, new_value: newName },
        }));
      }

      if ('customer_type' in data && (before as any).customer_type !== data.customer_type) {
        auditEntries.push(storage.createCrmAuditLog({
          user_id: userId,
          action: "customer_type_changed",
          customer_id: id,
          detail: { old_value: (before as any).customer_type ?? "Store", new_value: data.customer_type },
        }));
      }

      if ('account_type' in data && (before as any).account_type !== data.account_type) {
        auditEntries.push(storage.createCrmAuditLog({
          user_id: userId,
          action: "account_type_changed",
          customer_id: id,
          detail: { old_value: (before as any).account_type ?? "customer", new_value: data.account_type },
        }));
      }

      if (mark_inactive) {
        auditEntries.push(storage.createCrmAuditLog({
          user_id: userId,
          action: "customer_marked_inactive",
          customer_id: id,
          detail: { reason: inactive_reason ?? null, notes: inactive_notes ?? null },
        }));
      }

      if (restore_active) {
        auditEntries.push(storage.createCrmAuditLog({
          user_id: userId,
          action: "customer_restored_active",
          customer_id: id,
          detail: {},
        }));
      }

      await Promise.allSettled(auditEntries);

      const updated = await storage.getCrmCustomerById(id);
      res.json(updated);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/crm/customers/:id/orders
  app.get("/api/crm/customers/:id/orders", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser;
      const userId = user?.id as number;
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const id = parseInt(req.params.id);
      if (!await assertCrmCustomerAccess(storage, id, userId, user.role, res)) return;
      const customer = await storage.getCrmCustomerById(id);
      if (!customer) return res.status(404).json({ error: "Customer not found" });
      const orders = await storage.getCrmOrdersByBcCustomerId(customer.bigcommerce_customer_id, 10000);
      res.json(orders);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // PUT /api/crm/customers/:id/sales-rep
  app.put("/api/crm/customers/:id/sales-rep", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser;
      const userId = user?.id as number;
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      if (user.role !== "admin") {
        const perms = await storage.getUserPermissionStrings(userId);
        if (!perms.includes("crm:assign_rep")) return res.status(403).json({ error: "Forbidden: crm:assign_rep permission required" });
      }
      const customerId = parseInt(req.params.id);
      const { assigned_user_id } = req.body;
      if (!assigned_user_id) return res.status(400).json({ error: "assigned_user_id required" });
      const rep = await storage.setCrmSalesRep({ customer_id: customerId, assigned_user_id: parseInt(assigned_user_id), assigned_by: userId ?? null });
      const repUser = await storage.getUser(parseInt(assigned_user_id));
      await storage.createCrmAuditLog({ user_id: userId ?? null, action: 'sales_rep_assigned', customer_id: customerId, detail: { rep_name: repUser?.name ?? null, assigned_user_id: parseInt(assigned_user_id) } });
      res.json(rep);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // DELETE /api/crm/customers/:id/sales-rep
  app.delete("/api/crm/customers/:id/sales-rep", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser;
      const userId = user?.id as number;
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      if (user.role !== "admin") {
        const perms = await storage.getUserPermissionStrings(userId);
        if (!perms.includes("crm:assign_rep")) return res.status(403).json({ error: "Forbidden: crm:assign_rep permission required" });
      }
      const customerId = parseInt(req.params.id);
      await storage.removeCrmSalesRep(customerId);
      await storage.createCrmAuditLog({ user_id: userId ?? null, action: 'sales_rep_removed', customer_id: customerId, detail: {} });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── CRM Notes ──────────────────────────────────────────────────────────────

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
  app.get("/api/crm/notes/kpis", requireAuth, async (req, res) => {
    try {
      const { search = "", createdBy, customerGroup = "", state = "", dateFrom = "", dateTo = "" } = req.query as Record<string, string>;
      const kpis = await storage.getCrmNotesKpis({
        search: search || undefined,
        createdBy: createdBy ? parseInt(createdBy) : undefined,
        customerGroup: customerGroup || undefined,
        state: state || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      res.json(kpis);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/crm/customers/:id/notes
  app.get("/api/crm/customers/:id/notes", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser;
      const userId = user?.id as number;
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const customerId = parseInt(req.params.id);
      if (!await assertCrmCustomerAccess(storage, customerId, userId, user.role, res)) return;
      const notes = await storage.getCrmNotes(customerId);
      res.json(notes);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/crm/customers/:id/notes
  app.post("/api/crm/customers/:id/notes", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser;
      const userId = user?.id as number;
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const customerId = parseInt(req.params.id);
      if (!await assertCrmCustomerAccess(storage, customerId, userId, user.role, res)) return;
      const { note, note_type = "General", order_id, bc_target = "crm" } = req.body;
      if (!note?.trim()) return res.status(400).json({ error: "note is required" });

      const created = await storage.createCrmNote({
        customer_id: customerId, note: note.trim(), note_type,
        order_id: order_id ? parseInt(String(order_id)) : null,
        created_by: userId ?? null,
      });

      const auditAction = note_type === "Order Note" ? "order_note_created" : "note_created";
      await storage.createCrmAuditLog({
        user_id: userId ?? null, action: auditAction, customer_id: customerId,
        detail: { note_type, note_preview: note.trim().slice(0, 120), order_id: order_id ?? null },
      });

      // Optional BC order sync (for order-linked notes)
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
      const user = (req as any).authUser;
      const userId = user?.id as number;
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const customerId = parseInt(req.params.id);
      if (!await assertCrmCustomerAccess(storage, customerId, userId, user.role, res)) return;
      const noteId = parseInt(req.params.noteId);
      const { note, note_type, order_id } = req.body;
      const updated = await storage.updateCrmNote(noteId, {
        note: note?.trim(), note_type,
        order_id: order_id !== undefined ? (order_id ? parseInt(String(order_id)) : null) : undefined,
      });
      await storage.createCrmAuditLog({
        user_id: userId ?? null, action: 'note_edited', customer_id: customerId,
        detail: { note_type: updated.note_type, note_preview: updated.note.slice(0, 120) },
      });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // DELETE /api/crm/customers/:id/notes/:noteId
  app.delete("/api/crm/customers/:id/notes/:noteId", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser;
      const userId = user?.id as number;
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const customerId = parseInt(req.params.id);
      if (!await assertCrmCustomerAccess(storage, customerId, userId, user.role, res)) return;
      const noteId = parseInt(req.params.noteId);
      const existing = await storage.getCrmNoteById(noteId);
      if (existing) {
        await storage.createCrmAuditLog({
          user_id: userId ?? null, action: 'note_deleted', customer_id: customerId,
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
      const user = (req as any).authUser;
      const userId = user?.id as number;
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const customerId = parseInt(req.params.id);
      if (!await assertCrmCustomerAccess(storage, customerId, userId, user.role, res)) return;
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
          user_id: userId ?? null, action: 'staff_note_updated', customer_id: customerId,
          detail: { bc_order_id: bcOrderId },
        }));
      }
      if (customer_note !== undefined) {
        auditEntries.push(storage.createCrmAuditLog({
          user_id: userId ?? null, action: 'customer_note_updated', customer_id: customerId,
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
      const user = (req as any).authUser;
      const userId = user?.id as number;
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const customerId = parseInt(req.params.id);
      if (!await assertCrmCustomerAccess(storage, customerId, userId, user.role, res)) return;
      const timeline = await storage.getCrmTimeline(customerId);
      res.json(timeline);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/crm/customers/:id/addresses — fetch full BC address book
  app.get("/api/crm/customers/:id/addresses", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser;
      const userId = user?.id as number;
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const id = parseInt(req.params.id);
      if (!await assertCrmCustomerAccess(storage, id, userId, user.role, res)) return;
      const customer = await storage.getCrmCustomerById(id);
      if (!customer) return res.status(404).json({ error: "Customer not found" });
      const { storeHash, token } = await getBcCreds();
      if (storeHash && token) {
        try {
          const bcRes = await fetch(`https://api.bigcommerce.com/stores/${storeHash}/v2/customers/${customer.bigcommerce_customer_id}/addresses?limit=250`, {
            headers: { "X-Auth-Token": String(token), Accept: "application/json" },
          });
          if (bcRes.ok) {
            const data = await bcRes.json();
            return res.json(Array.isArray(data) ? data : []);
          }
        } catch (_) { /* fall through to stored data */ }
      }
      // Fallback: return stored billing + shipping addresses
      const fallback: any[] = [];
      if (customer.billing_address) fallback.push({ ...(customer.billing_address as any), _source: "billing" });
      if (customer.shipping_address) fallback.push({ ...(customer.shipping_address as any), _source: "shipping" });
      res.json(fallback);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/crm/customers/:id/bc-notes — read BigCommerce customer notes field
  app.get("/api/crm/customers/:id/bc-notes", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser;
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const userId = user.id;
      const customerId = parseInt(req.params.id);
      if (!await assertCrmCustomerAccess(storage, customerId, userId, user.role, res)) return;
      const customer = await storage.getCrmCustomerById(customerId);
      if (!customer) return res.status(404).json({ error: "Customer not found" });
      try {
        const { storeHash, token } = await getBcCreds();
        const raw = await fetchBcCustomerNotes(storeHash, token, customer.bigcommerce_customer_id);
        res.json({ generalNotes: raw, raw });
      } catch (_) {
        // BC creds not configured or API error — return empty but don't fail
        res.json({ generalNotes: "", raw: "" });
      }
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // PUT /api/crm/customers/:id/bc-notes — write General Notes block (preserves CRM HISTORY)
  app.put("/api/crm/customers/:id/bc-notes", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser;
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const userId = user.id;
      const customerId = parseInt(req.params.id);
      if (!await assertCrmCustomerAccess(storage, customerId, userId, user.role, res)) return;
      const customer = await storage.getCrmCustomerById(customerId);
      if (!customer) return res.status(404).json({ error: "Customer not found" });
      const { generalNotes: newGeneralNotes = "" } = req.body;
      const { storeHash, token } = await getBcCreds();
      const prevRaw = await fetchBcCustomerNotes(storeHash, token, customer.bigcommerce_customer_id);
      const newRaw = String(newGeneralNotes);
      await pushBcCustomerNotes(storeHash, token, customer.bigcommerce_customer_id, newRaw);
      // Audit + timeline
      await storage.createCrmAuditLog({
        user_id: userId, action: "bc_notes_updated", customer_id: customerId,
        detail: { source: "manual_save", previous: prevRaw, updated: newRaw, user: user.name },
      });
      res.json({ success: true, generalNotes: newRaw });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/crm/reactivation
  app.get("/api/crm/reactivation", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser;
      const userId = user?.id as number;
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const { search = "", group = "", state = "", health = "", rep, sortBy = "last_order_date", sortDir = "asc" } = req.query as Record<string, string>;
      const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
      const offset = parseInt(String(req.query.offset ?? "0"));
      const perms = user.role !== "admin" ? await storage.getUserPermissionStrings(userId) : [];
      const visScope = await getCrmVisibilityScope(storage, userId, user.role, user.role !== "admin" ? perms : undefined);
      const result = await storage.getReactivationCustomers({ search, group, state, health, rep: rep ? parseInt(rep) : undefined, sortBy, sortDir, limit, offset, visibilityScope: visScope.scope, visibilityUserId: visScope.userId });
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/crm/metrics
  app.get("/api/crm/metrics", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser;
      const userId = user?.id as number;
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const { search = "", group = "", state = "", assignedRep = "", primaryRep = "", secondaryRep = "", customerType = "", addressType = "", accountType = "", status = "both" } = req.query as Record<string, string>;
      const perms = user.role !== "admin" ? await storage.getUserPermissionStrings(userId) : [];
      const visScope = await getCrmVisibilityScope(storage, userId, user.role, user.role !== "admin" ? perms : undefined);
      const repFilter = assignedRep === "unassigned" ? "unassigned" : (assignedRep ? parseInt(String(assignedRep)) : undefined) as number | "unassigned" | undefined;
      const primaryRepFilter = primaryRep === "unassigned" ? "unassigned" : (primaryRep ? parseInt(String(primaryRep)) : undefined) as number | "unassigned" | undefined;
      const secondaryRepFilter = secondaryRep === "unassigned" ? "unassigned" : (secondaryRep ? parseInt(String(secondaryRep)) : undefined) as number | "unassigned" | undefined;
      const metrics = await storage.getCrmMetrics({ search, group, state, primaryRep: primaryRepFilter, secondaryRep: secondaryRepFilter, customerType: customerType || undefined, addressType: addressType || undefined, assignedRep: repFilter, visibilityScope: visScope.scope, visibilityUserId: visScope.userId, accountType: accountType || undefined, status: status || "both" });
      res.json(metrics);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── CRM Todos ──────────────────────────────────────────────────────────────────

  // GET /api/crm/todos
  app.get("/api/crm/todos", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser;
      const userId = user?.id as number;
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const perms = user.role !== "admin" ? await storage.getUserPermissionStrings(userId) : [];
      const canViewAll = user.role === "admin" || perms.includes("crm:view_all_todos");
      const allUsers = req.query.allUsers === "true" && canViewAll;
      const { status = "", customerId = "" } = req.query as Record<string, string>;
      const todos = await storage.getCrmTodos({
        userId,
        allUsers,
        status: status || undefined,
        customerId: customerId ? parseInt(customerId) : undefined,
      });
      res.json(todos);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/crm/todos
  app.post("/api/crm/todos", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser;
      const userId = user?.id as number;
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const perms = user.role !== "admin" ? await storage.getUserPermissionStrings(userId) : [];
      if (user.role !== "admin" && !perms.includes("crm:manage_todos") && !perms.includes("crm:add_note")) {
        return res.status(403).json({ error: "Forbidden: crm:manage_todos permission required" });
      }
      const { customer_id, title, note, priority, due_date, assigned_to_user_id, reminder_at } = req.body;
      if (!title?.trim()) return res.status(400).json({ error: "title is required" });
      const todo = await storage.createCrmTodo({
        customer_id: customer_id ? parseInt(customer_id) : null,
        title: String(title).trim(),
        note: String(note ?? ""),
        priority: priority ?? "medium",
        due_date: due_date ? new Date(due_date) : null,
        assigned_to_user_id: assigned_to_user_id ? parseInt(assigned_to_user_id) : userId,
        reminder_at: reminder_at ? new Date(reminder_at) : null,
        created_by: userId,
      });
      res.status(201).json(todo);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // PUT /api/crm/todos/:id
  app.put("/api/crm/todos/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser;
      const userId = user?.id as number;
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const id = parseInt(req.params.id);
      const { title, note, priority, due_date, assigned_to_user_id, reminder_at, completed } = req.body;
      const updates: Record<string, any> = {};
      if (title !== undefined) updates.title = String(title).trim();
      if (note !== undefined) updates.note = String(note);
      if (priority !== undefined) updates.priority = priority;
      if ('due_date' in req.body) updates.due_date = due_date ? new Date(due_date) : null;
      if ('assigned_to_user_id' in req.body) updates.assigned_to_user_id = assigned_to_user_id ? parseInt(assigned_to_user_id) : null;
      if ('reminder_at' in req.body) updates.reminder_at = reminder_at ? new Date(reminder_at) : null;
      if (completed !== undefined) {
        updates.completed_at = completed ? new Date() : null;
        updates.todo_status = completed ? 'completed' : 'pending';
      }
      const todo = await storage.updateCrmTodo(id, updates);
      res.json(todo);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // DELETE /api/crm/todos/:id
  app.delete("/api/crm/todos/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser;
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const id = parseInt(req.params.id);
      await storage.deleteCrmTodo(id);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/crm/users
  app.get("/api/crm/users", requireAuth, async (_req, res) => {
    try {
      const users = await storage.getCrmUsers();
      res.json(users);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ─── POS Enhancements: Store Credit (live, same source as CRM) ─────────────

  // GET /api/pos/customer-store-credit/:bcCustomerId — live BC v2 balance, mirrors CRM's source
  app.get("/api/pos/customer-store-credit/:bcCustomerId", requireAuth, async (req, res) => {
    try {
      const bcCustomerId = parseInt(req.params.bcCustomerId);
      if (isNaN(bcCustomerId)) return res.status(400).json({ error: "Invalid customer id" });
      const { storeHash, headers } = await getBcCreds();
      const bcRes = await fetch(`https://api.bigcommerce.com/stores/${storeHash}/v2/customers/${bcCustomerId}`, { headers });
      if (!bcRes.ok) return res.status(502).json({ error: "Failed to fetch store credit from BigCommerce" });
      const bcData = await bcRes.json();
      const rawCredit = bcData?.store_credit_amount ?? bcData?.store_credit ?? 0;
      const credit = Number(rawCredit) || 0;

      // Keep CRM mirror in sync so both surfaces always agree
      try {
        const existing = await storage.getCrmCustomerByBcId(bcCustomerId);
        if (existing) {
          await storage.upsertCrmCustomer({
            bigcommerce_customer_id: existing.bigcommerce_customer_id,
            company: existing.company, first_name: existing.first_name, last_name: existing.last_name,
            email: existing.email, phone: existing.phone,
            customer_group_id: existing.customer_group_id, customer_group_name: existing.customer_group_name,
            billing_address: existing.billing_address as any, shipping_address: existing.shipping_address as any,
            created_date: existing.created_date, is_active: existing.is_active,
            store_credit_balance: String(credit),
          });
        }
      } catch (_) { /* mirror sync failure is non-fatal */ }

      res.json({ store_credit: credit });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ─── POS Enhancements: Below-Cost Price Protection (Audit) ─────────────────

  // POST /api/pos/price-override-audit — logged only when cashier confirms a below-cost price
  app.post("/api/pos/price-override-audit", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser;
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const { customer_id, customer_name, order_id, bigcommerce_order_id, product_id, product_name, sku, product_cost, selling_price } = req.body;
      if (product_id == null || !sku || product_cost == null || selling_price == null) {
        return res.status(400).json({ error: "product_id, sku, product_cost, selling_price are required" });
      }
      const loss = Number(product_cost) - Number(selling_price);
      const created = await storage.createPosPriceOverrideAudit({
        user_id: user.id,
        customer_id: customer_id ? parseInt(String(customer_id)) : null,
        customer_name: customer_name || null,
        order_id: order_id ? parseInt(String(order_id)) : null,
        bigcommerce_order_id: bigcommerce_order_id ? parseInt(String(bigcommerce_order_id)) : null,
        product_id: parseInt(String(product_id)),
        product_name: product_name || "",
        sku,
        product_cost: String(product_cost),
        selling_price: String(selling_price),
        loss_amount: String(loss > 0 ? loss : 0),
      });
      res.status(201).json(created);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/pos/price-override-audit — Reporting > Price Override Audit
  app.get("/api/pos/price-override-audit", requirePermission("reporting_price_override_audit"), async (req, res) => {
    try {
      const { userId, customerId, sku, dateFrom, dateTo, sortBy, sortDir } = req.query as Record<string, string>;
      const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
      const offset = parseInt(String(req.query.offset ?? "0"));
      const result = await storage.getPosPriceOverrideAudit({
        userId: userId ? parseInt(userId) : undefined,
        customerId: customerId ? parseInt(customerId) : undefined,
        sku, dateFrom, dateTo, sortBy, sortDir, limit, offset,
      });
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ─── POS Enhancements: Store Credit Usage ──────────────────────────────────

  // POST /api/pos/store-credit-usage — apply store credit at checkout: deduct in BC, log usage, create CRM note
  app.post("/api/pos/store-credit-usage", requireAuth, async (req, res) => {
    try {
      const user = (req as any).authUser;
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const { bigcommerce_customer_id, customer_name, order_id, bigcommerce_order_id, credit_used, order_total_before, final_order_total } = req.body;
      if (!bigcommerce_customer_id || credit_used == null || order_total_before == null || final_order_total == null) {
        return res.status(400).json({ error: "bigcommerce_customer_id, credit_used, order_total_before, final_order_total are required" });
      }
      const creditUsedNum = Number(credit_used);
      if (creditUsedNum <= 0) return res.status(400).json({ error: "credit_used must be positive" });

      const customer = await storage.getCrmCustomerByBcId(parseInt(String(bigcommerce_customer_id)));
      if (!customer) return res.status(404).json({ error: "Customer not found in CRM" });
      const customer_id = customer.id;
      const creditBefore = Number(customer?.store_credit_balance ?? 0);

      // bc_updated_balance is passed from the native BC checkout flow.
      // When present, BC has already deducted the credit — trust BC as authoritative.
      // When absent (non-SC orders calling this endpoint), compute from CRM.
      const bcUpdatedBalance = req.body.bc_updated_balance != null ? Number(req.body.bc_updated_balance) : null;

      if (bcUpdatedBalance === null && creditUsedNum > creditBefore + 0.005) {
        return res.status(400).json({ error: "Applied store credit cannot exceed available store credit" });
      }
      if (creditUsedNum > Number(order_total_before) + 0.005) {
        return res.status(400).json({ error: "Applied store credit cannot exceed order total" });
      }

      // BC is authoritative: use BC's post-checkout balance if available
      const creditRemaining = bcUpdatedBalance !== null
        ? Math.max(0, bcUpdatedBalance)
        : Math.max(0, creditBefore - creditUsedNum);

      // Sync local CRM mirror balance immediately
      if (customer) {
        await storage.upsertCrmCustomer({
          bigcommerce_customer_id: customer.bigcommerce_customer_id,
          company: customer.company, first_name: customer.first_name, last_name: customer.last_name,
          email: customer.email, phone: customer.phone,
          customer_group_id: customer.customer_group_id, customer_group_name: customer.customer_group_name,
          billing_address: customer.billing_address as any, shipping_address: customer.shipping_address as any,
          created_date: customer.created_date, is_active: customer.is_active,
          store_credit_balance: String(creditRemaining),
        });
      }

      const usage = await storage.createPosStoreCreditUsage({
        order_id: order_id ? parseInt(String(order_id)) : null,
        bigcommerce_order_id: bigcommerce_order_id ? parseInt(String(bigcommerce_order_id)) : null,
        customer_id: parseInt(String(customer_id)),
        customer_name: customer_name || null,
        cashier_id: user.id,
        credit_before: String(creditBefore),
        credit_used: String(creditUsedNum),
        credit_remaining: String(creditRemaining),
        order_total_before: String(order_total_before),
        final_order_total: String(final_order_total),
      });

      // System-generated CRM note (note_type "Store Credit" cannot be created manually)
      try {
        const orderRef = bigcommerce_order_id ? `#${bigcommerce_order_id}` : order_id ? `#${order_id}` : "(pending sync)";
        const noteText = `Store Credit Applied\n\n$${creditUsedNum.toFixed(2)} applied during checkout.\nOrder ${orderRef}\n\nRemaining Store Credit:\n$${creditRemaining.toFixed(2)}`;
        await storage.createCrmNote({
          customer_id: parseInt(String(customer_id)),
          note_type: "Store Credit",
          note: noteText,
          order_id: order_id ? parseInt(String(order_id)) : null,
          created_by: user.id,
        });
      } catch (_) { /* note creation failure is non-fatal */ }

      res.status(201).json({ ...usage, credit_remaining: creditRemaining });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/pos/store-credit-usage — Reporting > Store Credit Usage
  app.get("/api/pos/store-credit-usage", requireAuth, async (req, res) => {
    try {
      const { customerId, cashierId, orderSearch, dateFrom, dateTo, sortBy, sortDir } = req.query as Record<string, string>;
      const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
      const offset = parseInt(String(req.query.offset ?? "0"));
      const result = await storage.getPosStoreCreditUsage({
        customerId: customerId ? parseInt(customerId) : undefined,
        cashierId: cashierId ? parseInt(cashierId) : undefined,
        orderSearch, dateFrom, dateTo, sortBy, sortDir, limit, offset,
      });
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ─── Reports ───────────────────────────────────────────────────────────────

  // Note: line items are populated via the managed sync routes in CRM Settings.
  // The sales report reads only from the local bc_order_line_items table.

  // GET /api/reports/bc-brands — fetch brands from BigCommerce (cached 1 hour)
  app.get("/api/reports/bc-brands", requirePermission("reporting_sales"), async (req, res) => {
    try {
      const cacheKey = "report_bc_brands_cache";
      const cached = await storage.getSetting(cacheKey);
      if (cached?.value) {
        const { data, ts } = cached.value as any;
        if (Date.now() - ts < 3600_000) return res.json(data);
      }
      const { storeHash, headers } = await getBcCreds();
      let brands: any[] = [];
      let pg = 1;
      while (true) {
        const r = await fetch(
          `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/brands?limit=250&page=${pg}`,
          { headers },
        );
        if (!r.ok) break;
        const json = await r.json();
        const items = json.data ?? [];
        brands.push(...items.map((b: any) => ({ id: b.id, name: b.name })));
        if (items.length < 250) break;
        pg++;
      }
      brands.sort((a, b) => a.name.localeCompare(b.name));
      await storage.setSetting(cacheKey, { data: brands, ts: Date.now() });
      res.json(brands);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/reports/bc-categories — fetch categories from BigCommerce (cached 1 hour)
  app.get("/api/reports/bc-categories", requirePermission("reporting_sales"), async (req, res) => {
    try {
      const cacheKey = "report_bc_categories_cache";
      const cached = await storage.getSetting(cacheKey);
      if (cached?.value) {
        const { data, ts } = cached.value as any;
        if (Date.now() - ts < 3600_000) return res.json(data);
      }
      const { storeHash, headers } = await getBcCreds();
      let cats: any[] = [];
      let pg = 1;
      while (true) {
        const r = await fetch(
          `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/categories?limit=250&page=${pg}`,
          { headers },
        );
        if (!r.ok) break;
        const json = await r.json();
        const items = json.data ?? [];
        cats.push(...items.map((c: any) => ({ id: c.id, name: c.name, parent_id: c.parent_id })));
        if (items.length < 250) break;
        pg++;
      }
      cats.sort((a, b) => a.name.localeCompare(b.name));
      await storage.setSetting(cacheKey, { data: cats, ts: Date.now() });
      res.json(cats);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/reports/product-search — search local product catalog
  app.get("/api/reports/product-search", requirePermission("reporting_sales"), async (req, res) => {
    try {
      const q = String(req.query.q ?? "").trim();
      if (!q || q.length < 1) return res.json([]);

      // 1. Search the products catalog (by name and base SKU)
      const catalogResults = await storage.searchProductsForReport(q, 30);
      const productHits = catalogResults.map(p => ({
        id: p.id,
        bigcommerce_id: p.bigcommerce_id,
        name: p.name,
        sku: p.sku,
        brand_name: p.brand_name ?? "",
        match_type: "product" as const,
        variant_label: null as string | null,
      }));

      // 2. Also search bc_order_line_items for variant-level SKU matches and
      //    products not yet synced to the local products catalog.
      const lineItemHitsRaw = await storage.searchLineItemsByQuery(q, 40);

      const catalogBcIds = new Set(productHits.map(p => p.bigcommerce_id));
      const extraProducts: typeof productHits = [];
      const skuHits: Array<{
        id: number; bigcommerce_id: number; name: string; sku: string;
        brand_name: string; match_type: "sku"; variant_label: string | null;
      }> = [];
      const seenSkus = new Set<string>();

      for (const row of lineItemHitsRaw) {
        const bcId = row.bigcommerce_product_id;
        const sku = row.sku ?? "";
        const isSkuMatch = sku.toLowerCase().includes(q.toLowerCase());

        if (isSkuMatch && !seenSkus.has(sku)) {
          seenSkus.add(sku);
          skuHits.push({
            id: 0, bigcommerce_id: bcId,
            name: row.product_name ?? "",
            sku, brand_name: row.brand_name ?? "",
            match_type: "sku",
            variant_label: row.variant_label ?? null,
          });
        } else if (!isSkuMatch && !catalogBcIds.has(bcId)) {
          // Product found in line items only (not in catalog)
          catalogBcIds.add(bcId);
          extraProducts.push({
            id: 0, bigcommerce_id: bcId,
            name: row.product_name ?? "",
            sku, brand_name: row.brand_name ?? "",
            match_type: "product", variant_label: null,
          });
        }
      }

      res.json([...productHits, ...extraProducts, ...skuHits].slice(0, 50));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ─── BC API helpers: fetch product IDs by brand/category (cached 1h) ────────

  async function fetchBcProductIdsByBrand(brandId: number): Promise<Set<number>> {
    const cacheKey = `report_brand_pids_${brandId}`;
    const cached = await storage.getSetting(cacheKey);
    if (cached?.value) {
      const { ids: cachedIds, ts } = cached.value as any;
      if (Date.now() - ts < 3600_000) return new Set<number>(cachedIds);
    }
    const { storeHash, headers } = await getBcCreds();
    const ids: number[] = [];
    let pg = 1;
    while (true) {
      const r = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products?brand_id=${brandId}&include_fields=id&limit=250&page=${pg}`,
        { headers },
      );
      if (!r.ok) break;
      const json = await r.json();
      const items: any[] = json.data ?? [];
      items.forEach((p: any) => ids.push(p.id));
      if (items.length < 250) break;
      pg++;
    }
    await storage.setSetting(cacheKey, { ids, ts: Date.now() });
    return new Set<number>(ids);
  }

  async function fetchBcProductIdsByCategory(catId: number): Promise<Set<number>> {
    const cacheKey = `report_cat_pids_${catId}`;
    const cached = await storage.getSetting(cacheKey);
    if (cached?.value) {
      const { ids: cachedIds, ts } = cached.value as any;
      if (Date.now() - ts < 3600_000) return new Set<number>(cachedIds);
    }
    const { storeHash, headers } = await getBcCreds();
    const ids: number[] = [];
    let pg = 1;
    while (true) {
      const r = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products?categories:in=${catId}&include_fields=id&limit=250&page=${pg}`,
        { headers },
      );
      if (!r.ok) break;
      const json = await r.json();
      const items: any[] = json.data ?? [];
      items.forEach((p: any) => ids.push(p.id));
      if (items.length < 250) break;
      pg++;
    }
    await storage.setSetting(cacheKey, { ids, ts: Date.now() });
    return new Set<number>(ids);
  }

  // ─── Resolve brand+category → product ID set ─────────────────────────────

  async function resolveReportProductIds(opts: {
    brandId?: string;
    categoryIdsRaw?: string;
    bcProductIdsRaw?: string;
  }): Promise<number[] | undefined> {
    const { brandId, categoryIdsRaw, bcProductIdsRaw } = opts;
    const hasBrand = !!(brandId && brandId !== "");
    const catIds = (categoryIdsRaw ?? "").split(",").map(Number).filter(Boolean);
    const hasCategory = catIds.length > 0;
    const hasIndividual = !!bcProductIdsRaw;

    if (!hasBrand && !hasCategory && !hasIndividual) return undefined; // no filter at all

    let brandSet: Set<number> | null = null;
    let catSet: Set<number> | null = null;

    if (hasBrand) {
      brandSet = await fetchBcProductIdsByBrand(parseInt(brandId!));
    }

    if (hasCategory) {
      catSet = new Set<number>();
      for (const cid of catIds) {
        const s = await fetchBcProductIdsByCategory(cid);
        s.forEach(id => catSet!.add(id));
      }
    }

    let resolved: Set<number>;

    if (brandSet && catSet) {
      // Intersection: must be in brand AND in selected categories
      resolved = new Set<number>([...brandSet].filter(id => catSet!.has(id)));
    } else if (brandSet) {
      resolved = brandSet;
    } else if (catSet) {
      resolved = catSet;
    } else {
      resolved = new Set<number>();
    }

    // Add individually-selected products (only when not selectAll)
    if (hasIndividual) {
      bcProductIdsRaw!.split(",").map(Number).filter(Boolean).forEach(id => resolved.add(id));
    }

    return [...resolved];
  }

  // GET /api/reports/sales — BC-mirror-based Sales Report
  app.get("/api/reports/sales", requirePermission("reporting_sales"), async (req, res) => {
    try {
      const {
        view = "summary",
        dateFrom,
        dateTo,
        brandId,
        categoryIds: categoryIdsRaw,
        bcProductIds: bcProductIdsRaw,
        selectAll,
        skuFilter,
        bcStatusFilter,
        sortBy = "qty_sold",
        sortDir = "desc",
      } = req.query as Record<string, string>;
      const page = Math.max(0, parseInt(String(req.query.page ?? "0")));
      // Allow up to 50 000 rows for export calls (client sends limit=10000)
      const limit = Math.min(parseInt(String(req.query.limit ?? "20")), 50000);

      const resolvedIds = await resolveReportProductIds({ brandId, categoryIdsRaw, bcProductIdsRaw });

      const opts = {
        dateFrom, dateTo, bcProductIds: resolvedIds,
        skuFilter: skuFilter || undefined,
        bcStatusFilter: bcStatusFilter || undefined,
        page, limit, sortBy, sortDir,
      };
      const [result, totalLineItems] = await Promise.all([
        view === "summary"
          ? storage.getSalesReportSummary(opts)
          : storage.getSalesReportDetails(opts),
        storage.getBcOrderLineItemsCount(),
      ]);

      const noData = totalLineItems === 0;
      res.json({ ...result, noData });
    } catch (e: any) {
      console.error("[Sales Report] Error:", e.message, e.stack);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/reports/sales/stats — aggregate stats for the report sidebar
  app.get("/api/reports/sales/stats", requirePermission("reporting_sales"), async (req, res) => {
    try {
      const { dateFrom, dateTo, brandId, categoryIds: categoryIdsRaw, bcProductIds: raw, skuFilter, bcStatusFilter } = req.query as Record<string, string>;

      const resolvedIds = await resolveReportProductIds({ brandId, categoryIdsRaw, bcProductIdsRaw: raw });

      const stats = await storage.getSalesReportStats({
        dateFrom, dateTo, bcProductIds: resolvedIds,
        skuFilter: skuFilter || undefined,
        bcStatusFilter: bcStatusFilter || undefined,
      });
      res.json({ ...stats, dateFrom, dateTo });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── SKUVault Settings ──────────────────────────────────────────────────────

  app.get("/api/settings/skuvault", requireAuth, async (_req, res) => {
    try {
      const setting = await storage.getSetting("skuvault_config");
      const cfg = setting?.value ? (typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value) : {};
      // Never expose tokens — mask them
      res.json({
        tenantToken: cfg.tenantToken ? "••••••••" : "",
        userToken: cfg.userToken ? "••••••••" : "",
        warehouseId: cfg.warehouseId ?? null,
        warehouseLocation: cfg.warehouseLocation || "GENERAL",
        reasons: Array.isArray(cfg.reasons) ? cfg.reasons : [],
        hasCredentials: !!(cfg.tenantToken && cfg.userToken),
        lastTestedAt: cfg.lastTestedAt || null,
        lastTestOk: cfg.lastTestOk ?? null,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/settings/skuvault", requireAuth, async (req, res) => {
    try {
      const { tenantToken, userToken, warehouseId, warehouseLocation, reasons } = req.body as { tenantToken?: string; userToken?: string; warehouseId?: number; warehouseLocation?: string; reasons?: string[] };
      const existing = await storage.getSetting("skuvault_config");
      const current = existing?.value ? (typeof existing.value === "string" ? JSON.parse(existing.value) : existing.value) : {};
      const updated: Record<string, any> = { ...current };
      // Only update if the incoming value is not the masked placeholder
      if (tenantToken && tenantToken !== "••••••••") updated.tenantToken = tenantToken;
      if (userToken && userToken !== "••••••••") updated.userToken = userToken;
      if (warehouseId !== undefined && warehouseId !== null) updated.warehouseId = Number(warehouseId);
      if (warehouseLocation !== undefined) updated.warehouseLocation = warehouseLocation || "GENERAL";
      if (reasons !== undefined) updated.reasons = Array.isArray(reasons) ? reasons.filter((r) => r.trim()) : [];
      await storage.setSetting("skuvault_config", updated);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/settings/skuvault/test", requireAuth, async (_req, res) => {
    try {
      const setting = await storage.getSetting("skuvault_config");
      const cfg = setting?.value ? (typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value) : {};
      if (!cfg.tenantToken || !cfg.userToken) return res.status(400).json({ ok: false, message: "SKUVault credentials not configured." });
      const result = await testSkuVaultConnection({ tenantToken: cfg.tenantToken, userToken: cfg.userToken, warehouseId: cfg.warehouseId ?? 0, warehouseLocation: cfg.warehouseLocation });
      // Persist test result
      await storage.setSetting("skuvault_config", { ...cfg, lastTestedAt: new Date().toISOString(), lastTestOk: result.ok });
      res.json(result);
    } catch (e: any) { res.status(500).json({ ok: false, message: e.message }); }
  });

  // ── Inventory Audit Queue ──────────────────────────────────────────────────

  app.get("/api/inventory/audit/kpis", requireAuth, async (_req, res) => {
    try {
      const kpis = await storage.getAuditKPIs();
      res.json(kpis);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/inventory/audit", requireAuth, async (req, res) => {
    try {
      const page = Math.max(0, parseInt(String(req.query.page ?? "0")));
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "10"))));
      const search = (req.query.search as string) || undefined;
      const status = (req.query.status as string) || "pending";
      const source = (req.query.source as string) || undefined;
      const dateFrom = (req.query.dateFrom as string) || undefined;
      const dateTo = (req.query.dateTo as string) || undefined;
      const result = await storage.getAuditQueue({ page, limit, search, status, source, dateFrom, dateTo });
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Live SKUVault on-hand + pending quantities for a list of SKUs
  app.post("/api/inventory/skuvault-live-qty", requireAuth, async (req, res) => {
    try {
      const { skus } = req.body as { skus?: string[] };
      if (!Array.isArray(skus) || skus.length === 0) return res.json({});
      const svSetting = await storage.getSetting("skuvault_config");
      const svCfg = svSetting?.value ? (typeof svSetting.value === "string" ? JSON.parse(svSetting.value) : svSetting.value) : null;
      if (!svCfg?.tenantToken || !svCfg?.userToken) return res.status(503).json({ error: "SKUVault not configured" });
      const cfg: SkuVaultConfig = { tenantToken: svCfg.tenantToken, userToken: svCfg.userToken, warehouseId: svCfg.warehouseId ?? 0, warehouseLocation: svCfg.warehouseLocation };
      const qty = await getLiveSkuQuantities(cfg, skus);
      res.json(qty);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/inventory/audit/product/:productId/tasks", requireAuth, async (req, res) => {
    try {
      const productId = parseInt(req.params.productId);
      const status = (req.query.status as string) || undefined;
      const tasks = await storage.getAuditTasksForProduct(productId, status);
      // Enrich with completed_by_name
      const completedByIds = [...new Set(tasks.map((t) => t.completed_by).filter(Boolean))] as number[];
      let nameMap: Record<number, string> = {};
      if (completedByIds.length > 0) {
        const userRows = await storage.getUsersByIds(completedByIds);
        for (const u of userRows) nameMap[u.id] = u.name;
      }
      const enriched = tasks.map((t) => ({
        ...t,
        completed_by_name: t.completed_by ? (nameMap[t.completed_by] ?? null) : null,
      }));
      res.json(enriched);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/inventory/audit/tasks/:id", requireAuth, async (req, res) => {
    try {
      const task = await storage.getAuditTask(parseInt(req.params.id));
      if (!task) return res.status(404).json({ error: "Task not found" });
      res.json(task);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/inventory/audit/tasks/:id/complete", requireAuth, async (req, res) => {
    try {
      const authUser = (req as any).authUser;
      const id = parseInt(req.params.id);
      const { physical_qty, reason, notes } = req.body as { physical_qty: number; reason: string; notes?: string };
      if (physical_qty === undefined || physical_qty < 0) return res.status(400).json({ error: "physical_qty must be >= 0" });
      if (!reason) return res.status(400).json({ error: "reason is required" });

      const task = await storage.getAuditTask(id);
      if (!task) return res.status(404).json({ error: "Task not found" });

      const variance = physical_qty - (task.system_qty ?? 0);

      // Fetch SKUVault config
      const svSetting = await storage.getSetting("skuvault_config");
      const svCfg = svSetting?.value ? (typeof svSetting.value === "string" ? JSON.parse(svSetting.value) : svSetting.value) : null;
      if (!svCfg?.tenantToken || !svCfg?.userToken) {
        return res.status(400).json({ error: "SKUVault credentials not configured." });
      }

      // Get fresh system qty from SKUVault before completing
      let freshSystemQty = task.system_qty ?? 0;
      let qtyWarning: string | null = null;
      try {
        const svGet = await getSkuVaultInventory({ tenantToken: svCfg.tenantToken, userToken: svCfg.userToken, warehouseId: svCfg.warehouseId ?? 0, warehouseLocation: svCfg.warehouseLocation }, [task.sku]);
        // Items is a SKU-keyed dictionary: { [sku]: SvLocationEntry[] }
        const skuEntries = svGet.Items?.[task.sku];
        if (Array.isArray(skuEntries) && skuEntries.length > 0) {
          // Sum across all bins for an accurate total-stock warning
          freshSystemQty = skuEntries.reduce(
            (sum, e) => sum + (e.QuantityAvailable ?? e.QuantityOnHand ?? e.Quantity ?? 0), 0
          );
        }
        if (freshSystemQty !== (task.system_qty ?? 0)) {
          qtyWarning = `SKUVault quantity changed since task creation (was ${task.system_qty}, now ${freshSystemQty}).`;
        }
      } catch { /* Use stored qty if fetch fails */ }

      // Set inventory in SKUVault to the physical count
      const svSet = await setSkuVaultInventory(
        { tenantToken: svCfg.tenantToken, userToken: svCfg.userToken, warehouseId: svCfg.warehouseId ?? 0, warehouseLocation: svCfg.warehouseLocation || "GENERAL" },
        [{ sku: task.sku, quantity: physical_qty }],
        reason || "Inventory Audit - SalesApp"
      );

      const svErrors = (svSet.Errors ?? []).filter((e: any) => e.Sku === task.sku);
      if (svErrors.length > 0) {
        return res.status(502).json({ error: `SKUVault rejected the adjustment: ${svErrors[0].ErrorMessages?.join("; ")}` });
      }

      const resolvedAuditLocation = svSet.ResolvedLocations?.[task.sku] || null;

      const completed = await storage.completeAuditTask(id, {
        physical_qty, variance, reason, notes,
        completed_by: authUser.id,
        skuvault_result: svSet,
        skuvault_location: resolvedAuditLocation,
      });
      res.json({ ...completed, warning: qtyWarning });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/inventory/audit/tasks/batch-complete", requireAuth, async (req, res) => {
    try {
      const authUser = (req as any).authUser;
      const { items, reason, notes } = req.body as {
        items: { id: number; physical_qty: number; variance: number }[];
        reason: string;
        notes?: string;
      };
      if (!items?.length) return res.status(400).json({ error: "items array is required" });
      if (!reason) return res.status(400).json({ error: "reason is required" });

      const svSetting = await storage.getSetting("skuvault_config");
      const svCfg = svSetting?.value ? (typeof svSetting.value === "string" ? JSON.parse(svSetting.value) : svSetting.value) : null;
      if (!svCfg?.tenantToken || !svCfg?.userToken) return res.status(400).json({ error: "SKUVault credentials not configured." });

      // Fetch all tasks
      const tasks = await Promise.all(items.map((i) => storage.getAuditTask(i.id)));

      // Build SKUVault set payload
      const svItems = items.map((item, idx) => ({ sku: tasks[idx]?.sku ?? "", quantity: item.physical_qty }))
        .filter((i) => i.sku);
      const svSet = await setSkuVaultInventory(
        { tenantToken: svCfg.tenantToken, userToken: svCfg.userToken, warehouseId: svCfg.warehouseId ?? 0, warehouseLocation: svCfg.warehouseLocation || "GENERAL" },
        svItems,
        reason || "Inventory Audit - SalesApp"
      );
      const svErrorsBySku: Record<string, string> = {};
      for (const e of svSet.Errors ?? []) {
        svErrorsBySku[e.Sku] = e.ErrorMessages?.join("; ") || "Unknown error";
      }

      const results: { id: number; sku: string; success: boolean; error?: string }[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const task = tasks[i];
        const sku = task?.sku ?? "";
        if (svErrorsBySku[sku]) {
          await storage.failAuditTask(item.id);
          results.push({ id: item.id, sku, success: false, error: svErrorsBySku[sku] });
        } else {
          await storage.completeAuditTask(item.id, {
            physical_qty: item.physical_qty,
            variance: item.variance,
            reason, notes,
            completed_by: authUser.id,
            skuvault_result: svSet,
            skuvault_location: svSet.ResolvedLocations?.[sku] || null,
          });
          results.push({ id: item.id, sku, success: true });
        }
      }
      res.json({ results });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/reports/recent-exports — last N report export log entries
  app.get("/api/reports/recent-exports", requireAuth, async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? "5")), 20);
      const rows = await storage.getRecentExportLogs(limit);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/reports/export-log — Audit log for every CSV/Excel export
  app.post("/api/reports/export-log", requireAuth, async (req, res) => {
    try {
      const authUser = (req as any).authUser;
      const { report_name, view_name, filters, export_type, row_count } = req.body;
      // Always use the server-side authenticated user — never trust client-supplied identity
      await storage.logReportExport({
        user_id: authUser.id,
        user_name: authUser.name ?? authUser.username ?? "",
        report_name: String(report_name ?? ""),
        view_name: String(view_name ?? ""),
        filters: filters ?? {},
        export_type: String(export_type ?? "csv"),
        row_count: Number(row_count ?? 0),
      });
      res.status(201).json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Marketing Module ─────────────────────────────────────────────────────────
  const marketingStatuses = new Set(["draft", "ready", "queued", "scheduled", "sending", "sent", "paused", "failed", "cancelled"]);
  const allowedMarketingTransitions: Record<string, string[]> = {
    draft: ["ready", "paused"],
    ready: ["draft", "scheduled", "queued", "paused"],
    scheduled: ["ready", "queued", "paused", "cancelled"],
    queued: ["paused", "cancelled"],
    sending: ["sent", "failed", "paused"],
    paused: ["draft", "ready", "scheduled"],
    failed: ["draft", "queued"],
    cancelled: ["draft"],
    sent: [],
  };
  const getMarketingUserId = (req: Request) => Number((req as any).authUser?.id);
  const marketingUserCan = async (req: Request, action: string) => {
    const user = (req as any).authUser;
    return user?.role === "admin" || (await storage.getUserPermissionStrings(Number(user?.id))).includes(`marketing:${action}`);
  };
  const validMarketingAudienceTypes = new Set(["all_eligible", "customer_group", "selected_customers", "saved_audience"]);

  function getMarketingAudienceConfig(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  function validateMarketingAudience(
    audienceTypeValue: unknown,
    audienceConfigValue: unknown,
    audienceIdValue: unknown,
    customerIdsValue: unknown,
    requireComplete: boolean,
  ): string | null {
    const audienceType = String(audienceTypeValue ?? "").trim();
    if (!audienceType) return requireComplete ? "Choose an audience before continuing" : null;
    if (!validMarketingAudienceTypes.has(audienceType)) return "Invalid audience type";
    const config = getMarketingAudienceConfig(audienceConfigValue);
    if (audienceType === "saved_audience" && !Number(audienceIdValue)) return "A saved audience is required";
    if (audienceType === "customer_group") {
      const groupName = String(config.customerGroupName ?? config.customerGroup ?? "").trim();
      if (!groupName) return "Choose a BigCommerce customer group";
    }
    if (audienceType === "selected_customers" && requireComplete) {
      const ids = Array.isArray(customerIdsValue) ? customerIdsValue : [];
      if (!ids.some(id => Number.isInteger(Number(id)) && Number(id) > 0)) return "Select at least one customer";
    }
    return null;
  }

  app.get("/api/marketing/dashboard", requirePermission("marketing"), async (_req, res) => {
    try { res.json(await storage.getMarketingDashboard()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/marketing/sender-settings", requirePermission("marketing"), async (_req, res) => {
    try {
      res.json(await getMarketingSenderSettings());
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.put("/api/marketing/sender-settings", requirePermission("marketing", "send"), async (req, res) => {
    try {
      const requestedEmails = Array.isArray(req.body?.emails)
        ? req.body.emails.map((email: unknown) => String(email ?? "").trim())
        : [];
      if (!requestedEmails.length) return res.status(400).json({ error: "Add at least one campaign sender email." });
      if (requestedEmails.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
        return res.status(400).json({ error: "Every sender email must be valid." });
      }
      const requestedDefault = String(req.body?.defaultEmail ?? "").trim();
      if (requestedDefault && !requestedEmails.some(email => email.toLowerCase() === requestedDefault.toLowerCase())) {
        return res.status(400).json({ error: "The default sender must be one of the configured emails." });
      }
      const settings = normalizeMarketingSenderSettings({ emails: requestedEmails, defaultEmail: requestedDefault });
      await storage.setSetting("marketing_sender_settings", settings);
      res.json(settings);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // Marketing product picker. Credentials stay server-side and only the
  // snapshot fields needed by the campaign editor are returned.
  app.get("/api/marketing/products/search", requirePermission("marketing"), async (req, res) => {
    try {
      const query = String(req.query.query ?? "").trim();
      if (query.length < 2) return res.json([]);
      const setting = await storage.getSetting("bigcommerce_config");
      const config = setting?.value
        ? (typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value)
        : {};
      const storeHash = config.storeHash || process.env.BC_STORE_HASH;
      const token = config.token || process.env.BC_TOKEN;
      const storefrontUrl = String(config.storefrontUrl || "").replace(/\/$/, "");
      if (!storeHash || !token) return res.status(400).json({ error: "BigCommerce is not configured" });

      const response = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products?keyword=${encodeURIComponent(query)}&include=primary_image,variants&limit=50`,
        {
          headers: {
            "X-Auth-Token": String(token),
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        },
      );
      if (!response.ok) return res.status(502).json({ error: "BigCommerce product search failed" });
      const data = await response.json();
      const products = (data.data ?? []).map((product: any) => {
        const path = String(product.custom_url?.url || `/${String(product.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}/`);
        const productUrl = /^https?:\/\//i.test(path)
          ? path
          : storefrontUrl ? `${storefrontUrl}${path.startsWith("/") ? path : `/${path}`}` : "";
        return {
          id: Number(product.id),
          bigcommerce_id: Number(product.id),
          name: String(product.name ?? ""),
          sku: String(product.sku ?? ""),
          price: String(product.price ?? ""),
          image: String(product.primary_image?.url_standard ?? ""),
          stock_level: Number(product.inventory_level ?? 0),
          product_url: productUrl,
        };
      });
      res.json(products);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/marketing/customer-groups", requirePermission("marketing"), async (_req, res) => {
    try {
      const setting = await storage.getSetting("bigcommerce_config");
      const config = setting?.value
        ? (typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value)
        : {};
      const storeHash = config.storeHash || process.env.BC_STORE_HASH;
      const token = config.token || process.env.BC_TOKEN;
      if (!storeHash || !token) return res.status(400).json({ error: "BigCommerce is not configured" });

      const groups: Array<{ id: number; name: string }> = [];
      const pageSize = 250;
      for (let page = 1; ; page++) {
        const response = await fetch(
          `https://api.bigcommerce.com/stores/${storeHash}/v2/customer_groups?limit=${pageSize}&page=${page}`,
          { headers: { "X-Auth-Token": String(token), Accept: "application/json" } },
        );
        if (!response.ok) return res.status(502).json({ error: "BigCommerce customer groups could not be loaded" });
        const pageGroups = await response.json();
        if (!Array.isArray(pageGroups) || pageGroups.length === 0) break;
        for (const group of pageGroups) {
          const id = Number(group?.id);
          const name = String(group?.name ?? "").trim();
          if (Number.isInteger(id) && id > 0 && name) groups.push({ id, name });
        }
        if (pageGroups.length < pageSize) break;
      }
      groups.sort((a, b) => a.name.localeCompare(b.name));
      res.json(Array.from(new Map(groups.map(group => [group.id, group])).values()));
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Unable to load BigCommerce customer groups" });
    }
  });

  app.get("/api/marketing/campaigns", requirePermission("marketing"), async (req, res) => {
    try {
      const result = await storage.getMarketingCampaigns({
        search: String(req.query.search ?? ""),
        status: String(req.query.status ?? "all"),
        limit: Math.min(Number(req.query.limit ?? 50), 100),
        offset: Math.max(Number(req.query.offset ?? 0), 0),
      });
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/marketing/campaigns/:id", requirePermission("marketing"), async (req, res) => {
    try {
      const campaign = await storage.getMarketingCampaign(Number(req.params.id));
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      res.json(campaign);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/marketing/campaigns", requirePermission("marketing", "create"), async (req, res) => {
    try {
      const body = req.body ?? {};
      if (!String(body.name ?? "").trim()) return res.status(400).json({ error: "Campaign name is required" });
      const requestedStatus = String(body.status ?? "draft");
      if (!marketingStatuses.has(requestedStatus)) return res.status(400).json({ error: "Invalid campaign status" });
      if (requestedStatus !== "draft" && !(await marketingUserCan(req, "send"))) {
        return res.status(403).json({ error: "Sending permission is required to create a non-draft campaign" });
      }
      const audienceType = String(body.audience_type ?? "").trim();
      const audienceError = validateMarketingAudience(
        audienceType,
        body.audience_config,
        body.audience_id,
        body.customer_ids,
        requestedStatus !== "draft",
      );
      if (audienceError) return res.status(400).json({ error: audienceError });
      const campaign = await storage.createMarketingCampaign({
        name: String(body.name),
        internal_description: String(body.internal_description ?? ""),
        campaign_type: String(body.campaign_type ?? "email"),
        subject_line: String(body.subject_line ?? ""),
        preview_text: String(body.preview_text ?? ""),
         message_content: sanitizeMarketingEditorHtml(String(body.message_content ?? "")),
         sender_email: String(body.sender_email ?? "").trim(),
        audience_type: audienceType,
        audience_id: body.audience_id ? Number(body.audience_id) : null,
        audience_config: body.audience_config ?? {},
         product_snapshots: Array.isArray(body.product_snapshots) ? body.product_snapshots : [],
         product_display_options: normalizeMarketingProductDisplayOptions(body.product_display_options),
        scheduled_at: body.scheduled_at ? new Date(body.scheduled_at) : null,
         template_id: body.template_id ? Number(body.template_id) : null,
         timezone: String(body.timezone ?? "UTC"),
        created_by: getMarketingUserId(req),
        customer_ids: Array.isArray(body.customer_ids) ? body.customer_ids.map(Number).filter(Number.isInteger) : [],
      });
      res.status(201).json(campaign);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/marketing/campaigns/:id", requirePermission("marketing", "edit"), async (req, res) => {
    try {
      const body = req.body ?? {};
      const current = await storage.getMarketingCampaign(Number(req.params.id));
      if (!current) return res.status(404).json({ error: "Campaign not found" });
      const nextStatus = String(body.status ?? current.status);
      if (["ready", "scheduled", "queued", "sending", "sent"].includes(nextStatus)) {
        const audienceError = validateMarketingAudience(
          body.audience_type ?? current.audience_type,
          body.audience_config ?? current.audience_config,
          body.audience_id ?? current.audience_id,
          body.customer_ids ?? (current.recipients ?? []).map((recipient: any) => recipient.customer_id ?? recipient.id),
          true,
        );
        if (audienceError) return res.status(400).json({ error: audienceError });
      }
       const updateBody = body.message_content === undefined
         ? body
         : { ...body, message_content: sanitizeMarketingEditorHtml(String(body.message_content)) };
       const campaign = await storage.updateMarketingCampaign(Number(req.params.id), updateBody, getMarketingUserId(req));
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      res.json(campaign);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/marketing/campaigns/:id", requirePermission("marketing", "delete"), async (req, res) => {
    try {
      const campaign = await storage.getMarketingCampaign(Number(req.params.id));
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      if (campaign.status === "sent" || campaign.status === "sending") return res.status(409).json({ error: "Sent or sending campaigns cannot be deleted" });
      await storage.deleteMarketingCampaign(Number(req.params.id), getMarketingUserId(req));
      res.status(204).end();
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/marketing/campaigns/:id/status", requirePermission("marketing", "send"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const current = await storage.getMarketingCampaign(id);
      const next = String(req.body?.status ?? "");
      if (!current) return res.status(404).json({ error: "Campaign not found" });
      if (!marketingStatuses.has(next) || !allowedMarketingTransitions[current.status]?.includes(next)) {
        return res.status(409).json({ error: `Cannot move campaign from ${current.status} to ${next}` });
      }
      const audienceError = validateMarketingAudience(
        current.audience_type,
        current.audience_config,
        current.audience_id,
        (current.recipients ?? []).map((recipient: any) => recipient.customer_id ?? recipient.id),
        ["ready", "scheduled", "queued", "sending", "sent"].includes(next),
      );
      if (audienceError) return res.status(400).json({ error: audienceError });
      const campaign = await storage.updateMarketingCampaignStatus(id, next, getMarketingUserId(req));
      res.json(campaign);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/marketing/campaigns/:id/test-send", requirePermission("marketing", "send"), async (req, res) => {
    try {
      const email = String(req.body?.email ?? "").trim();
      if (!email) return res.status(400).json({ error: "A test email address is required" });
      const result = await sendMarketingTestEmail(Number(req.params.id), email);
      res.json({ ok: true, ...result });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.post("/api/marketing/campaigns/:id/send", requirePermission("marketing", "send"), async (req, res) => {
    try {
      if (req.body?.confirm !== true) return res.status(400).json({ error: "Explicit confirmation is required before sending" });
      const id = Number(req.params.id);
      const campaign = await storage.getMarketingCampaign(id);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      if (!["ready", "failed", "paused"].includes(campaign.status)) return res.status(409).json({ error: `Campaign cannot be sent from ${campaign.status}` });
      const audienceError = validateMarketingAudience(
        campaign.audience_type,
        campaign.audience_config,
        campaign.audience_id,
        (campaign.recipients ?? []).map((recipient: any) => recipient.customer_id ?? recipient.id),
        true,
      );
      if (audienceError) return res.status(400).json({ error: audienceError });
      const queued = await storage.updateMarketingCampaignStatus(id, "queued", getMarketingUserId(req));
      void processMarketingCampaign(id);
      res.json(queued);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.post("/api/marketing/campaigns/:id/schedule", requirePermission("marketing", "send"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const when = new Date(String(req.body?.scheduled_at ?? ""));
      if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) return res.status(400).json({ error: "Choose a future schedule time" });
      const campaign = await storage.getMarketingCampaign(id);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      if (!["draft", "ready", "paused"].includes(campaign.status)) return res.status(409).json({ error: `Campaign cannot be scheduled from ${campaign.status}` });
      const audienceError = validateMarketingAudience(
        campaign.audience_type,
        campaign.audience_config,
        campaign.audience_id,
        (campaign.recipients ?? []).map((recipient: any) => recipient.customer_id ?? recipient.id),
        true,
      );
      if (audienceError) return res.status(400).json({ error: audienceError });
      const updated = await storage.updateMarketingCampaign(id, { scheduled_at: when, timezone: String(req.body?.timezone ?? "UTC") }, getMarketingUserId(req));
      const scheduled = await storage.updateMarketingCampaignStatus(id, "scheduled", getMarketingUserId(req));
      res.json(scheduled ?? updated);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.post("/api/marketing/campaigns/:id/pause", requirePermission("marketing", "send"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const campaign = await storage.getMarketingCampaign(id);
      if (!campaign || !["scheduled", "queued", "sending"].includes(campaign.status)) return res.status(409).json({ error: "Only scheduled or active campaigns can be paused" });
      res.json(await storage.updateMarketingCampaignStatus(id, "paused", getMarketingUserId(req)));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.post("/api/marketing/campaigns/:id/duplicate", requirePermission("marketing", "create"), async (req, res) => {
    try {
      const original = await storage.getMarketingCampaign(Number(req.params.id));
      if (!original) return res.status(404).json({ error: "Campaign not found" });
      const copy = await storage.createMarketingCampaign({
        name: `${original.name} (Copy)`, internal_description: original.internal_description, campaign_type: original.campaign_type,
        subject_line: original.subject_line, preview_text: original.preview_text, message_content: original.message_content,
         sender_email: original.sender_email ?? "",
        audience_type: original.audience_type, audience_id: original.audience_id, audience_config: original.audience_config,
         template_id: original.template_id,
         product_snapshots: Array.isArray(original.product_snapshots) ? original.product_snapshots : [],
         product_display_options: normalizeMarketingProductDisplayOptions(original.product_display_options),
         timezone: original.timezone, created_by: getMarketingUserId(req),
        customer_ids: (original.recipients ?? []).map((r: any) => Number(r.id)).filter(Number.isInteger),
      });
      res.status(201).json(copy);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.get("/api/marketing/campaigns/:id/recipients", requirePermission("marketing"), async (req, res) => {
    try { res.json(await storage.getMarketingRecipients(Number(req.params.id), { status: String(req.query.status ?? "all"), limit: Math.min(Number(req.query.limit ?? 100), 200), offset: Math.max(Number(req.query.offset ?? 0), 0) })); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/marketing/analytics", requirePermission("marketing", "view_analytics"), async (req, res) => {
    try { res.json(await storage.getMarketingAnalytics({ campaignId: req.query.campaignId ? Number(req.query.campaignId) : undefined, dateFrom: String(req.query.dateFrom ?? ""), dateTo: String(req.query.dateTo ?? "") })); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/marketing/audiences", requirePermission("marketing"), async (req, res) => {
    try { res.json(await storage.getMarketingAudiences({ search: String(req.query.search ?? ""), type: String(req.query.type ?? "all") })); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/marketing/audiences/:id", requirePermission("marketing"), async (req, res) => {
    try {
      const audience = await storage.getMarketingAudience(Number(req.params.id));
      if (!audience) return res.status(404).json({ error: "Audience not found" });
      res.json(audience);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/marketing/audiences", requirePermission("marketing", "manage_audiences"), async (req, res) => {
    try {
      const body = req.body ?? {};
      if (!String(body.name ?? "").trim()) return res.status(400).json({ error: "Audience name is required" });
      const type = String(body.audience_type ?? "manual");
      if (!["manual", "dynamic"].includes(type)) return res.status(400).json({ error: "Invalid audience type" });
      const audience = await storage.createMarketingAudience({
        name: String(body.name), description: String(body.description ?? ""), audience_type: type,
        dynamic_filters: body.dynamic_filters ?? {},
        customer_ids: Array.isArray(body.customer_ids) ? body.customer_ids.map(Number).filter(Number.isInteger) : [],
        contact_ids: Array.isArray(body.contact_ids) ? body.contact_ids.map(Number).filter(Number.isInteger) : [],
        created_by: getMarketingUserId(req),
      });
      res.status(201).json(audience);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/marketing/audiences/:id", requirePermission("marketing", "manage_audiences"), async (req, res) => {
    try {
      const audience = await storage.updateMarketingAudience(Number(req.params.id), req.body ?? {}, getMarketingUserId(req));
      if (!audience) return res.status(404).json({ error: "Audience not found" });
      res.json(audience);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/marketing/audiences/:id", requirePermission("marketing", "manage_audiences"), async (req, res) => {
    try {
      const campaignUse = await storage.getMarketingCampaigns({ limit: 1000 });
      if (campaignUse.campaigns.some(c => c.audience_id === Number(req.params.id))) {
        return res.status(409).json({ error: "This audience is used by a campaign and cannot be deleted" });
      }
      await storage.deleteMarketingAudience(Number(req.params.id), getMarketingUserId(req));
      res.status(204).end();
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/marketing/audience-customers", requirePermission("marketing"), async (req, res) => {
    try { res.json(await storage.getMarketingAudienceCustomers({ search: String(req.query.search ?? ""), limit: Math.min(Number(req.query.limit ?? 25), 100), offset: Math.max(Number(req.query.offset ?? 0), 0) })); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/marketing/contacts", requirePermission("marketing"), async (req, res) => {
    try { res.json(await storage.getMarketingContacts({ search: String(req.query.search ?? ""), type: String(req.query.type ?? "all"), limit: Math.min(Number(req.query.limit ?? 25), 100), offset: Math.max(Number(req.query.offset ?? 0), 0) })); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/marketing/contacts/import", requirePermission("marketing", "manage_audiences"), async (req, res) => {
    try {
      const type = String(req.body?.contact_type ?? "lead").toLowerCase();
      if (!["lead", "prospect"].includes(type)) return res.status(400).json({ error: "Contact type must be lead or prospect" });
      const csv = String(req.body?.csv ?? "");
      if (!csv.trim()) return res.status(400).json({ error: "Choose a CSV file to import" });
      const parsed = parseMarketingCsv(csv);
      const emailIndex = parsed.headers.indexOf("email");
      if (emailIndex < 0) return res.status(400).json({ error: "CSV must include an email column" });
      const seen = new Set<string>();
      const records: Array<{ email: string; first_name?: string; last_name?: string; company?: string; phone?: string; contact_type: string }> = [];
      let invalid = 0;
      for (const row of parsed.rows) {
        const value = (row[emailIndex] ?? "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || seen.has(value)) { invalid++; continue; }
        seen.add(value);
        const valueFor = (names: string[]) => {
          const index = names.map(name => parsed.headers.indexOf(name)).find(index => index >= 0);
          return index === undefined ? "" : (row[index] ?? "").trim();
        };
        records.push({ email: value, first_name: valueFor(["first_name", "firstname", "given_name"]), last_name: valueFor(["last_name", "lastname", "surname"]), company: valueFor(["company", "organization", "business"]), phone: valueFor(["phone", "phone_number"]), contact_type: type });
      }
      const result = await storage.importMarketingContacts(records, getMarketingUserId(req));
      res.status(201).json({ ...result, invalid, total_rows: parsed.rows.length });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.get("/api/marketing/audiences/:id/members", requirePermission("marketing"), async (req, res) => {
    try {
      res.json(await storage.getMarketingAudienceMembers(Number(req.params.id), {
        search: String(req.query.search ?? ""), source: String(req.query.source ?? "all"), status: String(req.query.status ?? "all"),
        limit: Math.min(Number(req.query.limit ?? 25), 100), offset: Math.max(Number(req.query.offset ?? 0), 0),
      }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/marketing/audience-preview", requirePermission("marketing"), async (req, res) => {
    try { res.json(await storage.getMarketingAudiencePreview(req.body?.filters ?? {}, Math.min(Number(req.body?.limit ?? 25), 100))); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.get("/api/marketing/templates", requirePermission("marketing"), async (req, res) => {
    try { res.json(await storage.getMarketingTemplates({ search: String(req.query.search ?? ""), category: String(req.query.category ?? "all"), includeArchived: req.query.includeArchived === "true" })); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/marketing/templates", requirePermission("marketing", "manage_templates"), async (req, res) => {
    try {
      const key = `marketing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
       const template = await storage.upsertEmailTemplate(key, { name: String(req.body?.name ?? "").trim(), subject_template: String(req.body?.subject_template ?? ""), body: sanitizeMarketingEditorHtml(String(req.body?.body ?? "")), template_type: "marketing", category: String(req.body?.category ?? "general"), updated_by: getMarketingUserId(req) });
      res.status(201).json(template);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.patch("/api/marketing/templates/:id", requirePermission("marketing", "manage_templates"), async (req, res) => {
    try {
      const current = await storage.getMarketingTemplateById(Number(req.params.id));
      if (!current) return res.status(404).json({ error: "Template not found" });
       const template = await storage.upsertEmailTemplate(current.key, { name: String(req.body?.name ?? current.name), subject_template: String(req.body?.subject_template ?? current.subject_template), body: req.body?.body === undefined ? current.body : sanitizeMarketingEditorHtml(String(req.body.body)), template_type: "marketing", category: String(req.body?.category ?? current.category), is_active: req.body?.is_active ?? current.is_active, updated_by: getMarketingUserId(req) });
      res.json(template);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.post("/api/marketing/templates/:id/archive", requirePermission("marketing", "manage_templates"), async (req, res) => {
    try { res.json(await storage.archiveMarketingTemplate(Number(req.params.id), getMarketingUserId(req), req.body?.archived !== false)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.get("/api/marketing/automations", requirePermission("marketing"), async (req, res) => {
    try { res.json(await storage.getMarketingAutomations({ status: String(req.query.status ?? "all"), search: String(req.query.search ?? "") })); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/marketing/automations/:id", requirePermission("marketing"), async (req, res) => {
    try {
      const automation = await storage.getMarketingAutomation(Number(req.params.id));
      if (!automation) return res.status(404).json({ error: "Automation not found" });
      res.json({ ...automation, executions: await storage.getMarketingAutomationExecutions(automation.id) });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/marketing/automations", requirePermission("marketing", "manage_automations"), async (req, res) => {
    try {
      const allowedTriggers = new Set(["customer_created", "customer_signup_completed", "audience_membership"]);
      if (!allowedTriggers.has(String(req.body?.trigger_type))) return res.status(400).json({ error: "Unsupported automation trigger" });
      const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];
      if (!steps.length) return res.status(400).json({ error: "At least one automation step is required" });
      res.status(201).json(await storage.createMarketingAutomation({ name: String(req.body?.name ?? "").trim(), description: String(req.body?.description ?? ""), trigger_type: String(req.body.trigger_type), trigger_config: req.body?.trigger_config ?? {}, frequency_days: Math.max(0, Number(req.body?.frequency_days ?? 0)), created_by: getMarketingUserId(req), steps }));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.patch("/api/marketing/automations/:id", requirePermission("marketing", "manage_automations"), async (req, res) => {
    try { res.json(await storage.updateMarketingAutomation(Number(req.params.id), req.body ?? {}, getMarketingUserId(req))); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.post("/api/marketing/automations/:id/status", requirePermission("marketing", "manage_automations"), async (req, res) => {
    try {
      const status = String(req.body?.status ?? "");
      if (!["draft", "active", "paused", "archived"].includes(status)) return res.status(400).json({ error: "Invalid automation status" });
      res.json(await storage.updateMarketingAutomationStatus(Number(req.params.id), status, getMarketingUserId(req)));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.get("/api/marketing/customers/:id/preference", requirePermission("marketing"), async (req, res) => {
    try { res.json(await storage.getMarketingCustomerPreference(Number(req.params.id))); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/marketing/customers/:id/preference", requirePermission("marketing", "manage_suppressions"), async (req, res) => {
    try {
      const subscribed = Boolean(req.body?.email_subscribed);
      const preference = await storage.upsertMarketingCustomerPreference(Number(req.params.id), { email_subscribed: subscribed, userId: getMarketingUserId(req) });
      if (!subscribed) await storage.createMarketingSuppression({ customerId: Number(req.params.id), reason: String(req.body?.reason ?? "Unsubscribed by staff"), source: "manual", createdBy: getMarketingUserId(req) });
      res.json(preference);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.get("/api/marketing/suppressions", requirePermission("marketing", "manage_suppressions"), async (req, res) => {
    try { res.json(await storage.getMarketingSuppressions(req.query.customerId ? Number(req.query.customerId) : undefined)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/marketing/suppressions", requirePermission("marketing", "manage_suppressions"), async (req, res) => {
    try {
      if (!String(req.body?.reason ?? "").trim()) return res.status(400).json({ error: "A suppression reason is required" });
      res.status(201).json(await storage.createMarketingSuppression({ customerId: Number(req.body?.customer_id), email: String(req.body?.email ?? ""), reason: String(req.body.reason), source: "manual", createdBy: getMarketingUserId(req) }));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.delete("/api/marketing/suppressions/:id", requirePermission("marketing", "manage_suppressions"), async (req, res) => {
    try { res.json(await storage.revokeMarketingSuppression(Number(req.params.id), getMarketingUserId(req), String(req.body?.detail ?? "Re-enabled by staff"))); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // Public, signed product-click endpoint. It only redirects to a URL present in
  // the campaign snapshot, so the signed link cannot become an open redirect.
  app.get("/api/marketing/click/:token", async (req, res) => {
    try {
      const decoded = verifyMarketingClickToken(String(req.params.token));
      if (!decoded) return res.status(400).send("Invalid product link");
      const [campaign, recipient] = await Promise.all([
        storage.getMarketingCampaign(decoded.campaignId),
        storage.getMarketingRecipient(decoded.recipientId),
      ]);
      if (!campaign || !recipient || Number(recipient.campaign_id) !== decoded.campaignId) {
        return res.status(404).send("Product link not found");
      }
      const product = (Array.isArray(campaign.product_snapshots) ? campaign.product_snapshots : [])
        .find((candidate: any) => Number(candidate?.id ?? candidate?.bigcommerce_id) === decoded.productId);
      const targetUrl = String(product?.product_url ?? "").trim();
      if (!/^https?:\/\//i.test(targetUrl) || targetUrl !== decoded.targetUrl) {
        return res.status(404).send("Product link not found");
      }
      await storage.recordMarketingEvent({
        campaign_id: decoded.campaignId,
        recipient_id: decoded.recipientId,
        event_type: "clicked",
        detail: {
          product_id: decoded.productId,
          bigcommerce_id: Number(product?.bigcommerce_id ?? product?.id) || null,
        },
      });
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(302, targetUrl);
    } catch (e: any) {
      return res.status(500).send("Unable to process product link");
    }
  });

  // Public, signed unsubscribe endpoint. It intentionally does not expose customer data.
  app.get("/api/marketing/unsubscribe/:token", async (req, res) => {
    try {
      const decoded = verifyMarketingUnsubscribeToken(String(req.params.token));
      if (!decoded) return res.status(400).send("<h1>Invalid unsubscribe link</h1>");
      if (decoded.entityType === "contact" && decoded.contactId) {
        await storage.deactivateMarketingContact(decoded.contactId);
        await storage.recordMarketingEvent({ campaign_id: decoded.campaignId, event_type: "unsubscribed", detail: { marketing_contact_id: decoded.contactId } });
      } else if (decoded.customerId) {
        await storage.upsertMarketingCustomerPreference(decoded.customerId, { email_subscribed: false });
        await storage.createMarketingSuppression({ customerId: decoded.customerId, reason: "Unsubscribed from marketing email", source: "unsubscribe" });
        await storage.recordMarketingEvent({ campaign_id: decoded.campaignId, event_type: "unsubscribed", detail: { customer_id: decoded.customerId } });
      }
      res.status(200).send("<!doctype html><html><body style=\"font-family:Arial;padding:48px;text-align:center\"><h1>You’re unsubscribed</h1><p>You will no longer receive marketing emails from Mid Atlantic Distribution.</p></body></html>");
    } catch (e: any) { res.status(500).send("Unable to process unsubscribe"); }
  });

  // The app already runs cron-based background work in this process. Keep a
  // small, idempotent marketing poller compatible with the single Render web service.
  const marketingQueueTimer = setInterval(() => void processMarketingQueue(), 30_000);
  marketingQueueTimer.unref?.();
  void processMarketingQueue();

  return httpServer;
}
