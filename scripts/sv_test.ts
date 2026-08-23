/**
 * One-shot SKUVault API probe — run with: npx tsx scripts/sv_test.ts
 * Tests multiple endpoints and parameter variants for NXDPMM-PCTM.
 */
import { db } from "../db";
import { settings } from "../shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  const rows = await db.select().from(settings).where(eq(settings.key, "skuvault_config"));
  const cfg = rows[0]?.value as any;
  if (!cfg?.tenantToken || !cfg?.userToken) {
    console.error("No SKUVault config found in DB");
    process.exit(1);
  }

  const TenantToken = cfg.tenantToken;
  const UserToken   = cfg.userToken;
  const SKU = "NXDPMM-PCTM";

  async function post(path: string, body: Record<string, unknown>) {
    const res = await fetch(`https://app.skuvault.com/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ TenantToken, UserToken, ...body }),
    });
    const text = await res.text();
    let pretty = text;
    try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch {}
    return { status: res.status, body: pretty };
  }

  const tests: Array<[string, string, Record<string, unknown>]> = [
    ["getInventoryByLocation", "/inventory/getInventoryByLocation", { ProductSKUs: [SKU], PageNumber: 0, PageSize: 10 }],
    ["getAvailableQuantities (ProductSKUs)", "/inventory/getAvailableQuantities", { ProductSKUs: [SKU], PageNumber: 0, PageSize: 10 }],
    ["getAvailableQuantities (Skus)", "/inventory/getAvailableQuantities", { Skus: [SKU], PageNumber: 0, PageSize: 10 }],
    ["getProducts (Skus)", "/products/getProducts", { Skus: [SKU], PageNumber: 0, PageSize: 10 }],
    ["getProducts (ProductSKUs)", "/products/getProducts", { ProductSKUs: [SKU], PageNumber: 0, PageSize: 10 }],
    ["getWarehouses", "/inventory/getWarehouses", {}],
  ];

  for (const [label, path, body] of tests) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`ENDPOINT: ${label}`);
    console.log(`PATH    : ${path}`);
    const r = await post(path, body);
    console.log(`HTTP    : ${r.status}`);
    console.log(r.body.slice(0, 3000));
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
