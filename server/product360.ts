import { db } from "../db";
import { sql } from "drizzle-orm";
import { storage } from "./storage";

type Product360Range = { dateFrom: string; dateTo: string };
type Product360Category = { id: number; name: string; parent_id: number };
type Product360CategoryCatalog = { categories: Product360Category[]; warning?: string };

const PRODUCT_360_MAIN_CATEGORIES = ["Disposables", "E-Liquid", "Hardware", "Smoke Shop"];
const PRODUCT_360_CATEGORY_CACHE_KEY = "report_bc_categories_cache";

function categoryKey(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function parseCategoryIds(value: unknown): number[] {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
}

async function getProduct360CategoryCatalog(): Promise<Product360CategoryCatalog> {
  const cached = await storage.getSetting(PRODUCT_360_CATEGORY_CACHE_KEY);
  if (cached?.value) {
    const cachedValue = cached.value as { data?: unknown; ts?: unknown };
    if (Array.isArray(cachedValue.data) && (!cachedValue.ts || Date.now() - Number(cachedValue.ts) < 3600_000)) {
      return {
        categories: cachedValue.data
          .map((category: any) => ({
            id: Number(category.id),
            name: String(category.name ?? ""),
            parent_id: Number(category.parent_id ?? 0),
          }))
          .filter((category: Product360Category) => Number.isInteger(category.id) && category.id > 0 && category.name),
      };
    }
  }

  const setting = await storage.getSetting("bigcommerce_config");
  let storeHash = process.env.BC_STORE_HASH || process.env.BIGCOMMERCE_STORE_HASH || "";
  let token = process.env.BC_TOKEN || process.env.BIGCOMMERCE_ACCESS_TOKEN || "";
  if (setting?.value) {
    const config = typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value;
    storeHash = config.storeHash || storeHash;
    token = config.token || config.accessToken || token;
  }
  if (!storeHash || !token) {
    return { categories: [], warning: "BigCommerce category names are unavailable because the category catalog is not configured." };
  }

  try {
    const apiBase = (process.env.BIGCOMMERCE_API_BASE || "https://api.bigcommerce.com").replace(/\/$/, "");
    const headers = { "X-Auth-Token": String(token), "Content-Type": "application/json", Accept: "application/json" };
    const categories: Product360Category[] = [];
    for (let page = 1; ; page++) {
      const response = await fetch(`${apiBase}/stores/${storeHash}/v3/catalog/categories?limit=250&page=${page}`, { headers });
      if (!response.ok) throw new Error(`BigCommerce category request failed: ${response.status}`);
      const body = await response.json();
      const pageCategories = Array.isArray(body.data) ? body.data : [];
      categories.push(...pageCategories.map((category: any) => ({
        id: Number(category.id),
        name: String(category.name ?? ""),
        parent_id: Number(category.parent_id ?? 0),
      })).filter((category: Product360Category) => Number.isInteger(category.id) && category.id > 0 && category.name));
      if (pageCategories.length < 250) break;
    }
    await storage.setSetting(PRODUCT_360_CATEGORY_CACHE_KEY, { data: categories, ts: Date.now() });
    return { categories };
  } catch (error) {
    console.warn("[Product 360] category catalog unavailable:", error);
    return { categories: [], warning: "BigCommerce category names could not be loaded. Category Mix will appear after the catalog is available." };
  }
}

function resolveMainCategory(categoryIds: number[], categories: Map<number, Product360Category>): string {
  const matches = new Set<string>();
  for (const categoryId of categoryIds) {
    let current = categories.get(categoryId);
    const visited = new Set<number>();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      const key = categoryKey(current.name);
      if (PRODUCT_360_MAIN_CATEGORIES.some((name) => categoryKey(name) === key)) matches.add(key);
      if (!current.parent_id || current.parent_id === current.id) break;
      current = categories.get(current.parent_id);
    }
  }
  return PRODUCT_360_MAIN_CATEGORIES.find((name) => matches.has(categoryKey(name))) || "Other / Uncategorized";
}

function safeDate(value: unknown, fallback: string): string {
  const candidate = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : fallback;
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function safeSearch(value: unknown): string {
  return String(value ?? "")
    .trim()
    .slice(0, 100)
    .replace(/[%_]/g, (char) => `\\${char}`);
}

function dateRange(from?: unknown, to?: unknown): Product360Range {
  const today = new Date();
  const end = safeDate(to, today.toISOString().slice(0, 10));
  const startDate = new Date(`${end}T00:00:00Z`);
  startDate.setUTCDate(startDate.getUTCDate() - 29);
  return {
    dateFrom: safeDate(from, startDate.toISOString().slice(0, 10)),
    dateTo: end,
  };
}

function rangeDays(range: Product360Range): number {
  const from = new Date(`${range.dateFrom}T00:00:00Z`).getTime();
  const to = new Date(`${range.dateTo}T00:00:00Z`).getTime();
  return Math.max(1, Math.floor((to - from) / 86_400_000) + 1);
}

function salesCte(range: Product360Range, productId?: number): string {
  const productFilter = productId ? `AND li.bigcommerce_product_id = ${Math.trunc(productId)}` : "";
  return `
    SELECT
      li.bigcommerce_product_id,
      li.variant_id,
      SUM(li.quantity)::numeric AS units_sold,
      SUM(li.quantity * li.base_price)::numeric AS revenue,
      COUNT(DISTINCT li.bigcommerce_order_id)::int AS orders,
      MAX(li.order_date) AS last_sold
    FROM bc_order_line_items li
    WHERE li.order_date >= ${quote(range.dateFrom)}::date
      AND li.order_date < ${quote(range.dateTo)}::date + interval '1 day'
      ${productFilter}
    GROUP BY li.bigcommerce_product_id, li.variant_id
  `;
}

type Product360Filters = { brand?: string; categoryIds?: number[] };

function lineItemProductFilter(filters?: Product360Filters): string {
  const conditions = [
    filters?.brand ? `p_filter.brand_name = ${quote(filters.brand)}` : "",
    filters?.categoryIds?.length
      ? `p_filter.categories ?| ARRAY[${filters.categoryIds.map((id) => quote(String(Math.trunc(id)))).join(", ")}]`
      : "",
  ].filter(Boolean);
  return conditions.length
    ? `AND EXISTS (
        SELECT 1
        FROM products p_filter
        WHERE p_filter.bigcommerce_id = li.bigcommerce_product_id
          AND ${conditions.join(" AND ")}
      )`
    : "";
}

function productBaseCte(range: Product360Range, productId?: number, filters?: Product360Filters): string {
  const conditions = [
    productId ? `p.id = ${Math.trunc(productId)}` : "",
    filters?.brand ? `p.brand_name = ${quote(filters.brand)}` : "",
    filters?.categoryIds?.length
      ? `p.categories ?| ARRAY[${filters.categoryIds.map((id) => quote(String(Math.trunc(id)))).join(", ")}]`
      : "",
  ].filter(Boolean);
  const productFilter = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const days = rangeDays(range);
  return `
    WITH sales AS (${salesCte(range, productId)}),
    product_sales AS (
      SELECT
        bigcommerce_product_id,
        SUM(units_sold)::numeric AS units_sold,
        SUM(revenue)::numeric AS revenue,
        SUM(orders)::int AS orders,
        MAX(last_sold) AS last_sold
      FROM sales
      GROUP BY bigcommerce_product_id
    )
    SELECT
      p.id,
      p.bigcommerce_id,
      p.name,
      p.sku,
      p.image,
      p.price::numeric AS price,
      p.cost_price::numeric AS cost_price,
      p.brand_name,
      p.categories,
      p.variants,
      COALESCE(
        NULLIF((
          SELECT SUM(NULLIF(v->>'stock_level', '')::numeric)
          FROM jsonb_array_elements(COALESCE(p.variants, '[]'::jsonb)) v
        ), 0),
        p.stock_level,
        0
      )::numeric AS current_stock,
      COALESCE(ps.units_sold, 0)::numeric AS units_sold,
      COALESCE(ps.revenue, 0)::numeric AS revenue,
      COALESCE(ps.orders, 0)::int AS orders,
      ps.last_sold,
      CASE
        WHEN ps.units_sold > 0 THEN ps.units_sold / ${days}.0
        ELSE 0
      END::numeric AS sales_velocity,
      CASE
        WHEN ps.units_sold > 0 THEN (
          COALESCE(NULLIF((
            SELECT SUM(NULLIF(v->>'stock_level', '')::numeric)
            FROM jsonb_array_elements(COALESCE(p.variants, '[]'::jsonb)) v
          ), 0), p.stock_level, 0) / (ps.units_sold / ${days}.0)
        )
        ELSE NULL
      END::numeric AS days_of_stock,
      CASE
        WHEN p.cost_price IS NULL THEN NULL
        ELSE COALESCE(ps.revenue, 0) - (COALESCE(ps.units_sold, 0) * p.cost_price)
      END::numeric AS gross_profit,
      jsonb_array_length(COALESCE(p.variants, '[]'::jsonb))::int AS variants_count
    FROM products p
    LEFT JOIN product_sales ps ON ps.bigcommerce_product_id = p.bigcommerce_id
    ${productFilter}
  `;
}

function categoryIdsForMainCategory(label: string, categories: Product360Category[]): number[] {
  const rootIds = new Set(categories.filter((category) => categoryKey(category.name) === categoryKey(label)).map((category) => category.id));
  const matchingIds = new Set(rootIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
      if (category.parent_id && matchingIds.has(category.parent_id) && !matchingIds.has(category.id)) {
        matchingIds.add(category.id);
        changed = true;
      }
    }
  }
  return Array.from(matchingIds);
}

function normalizeRows(rows: Record<string, unknown>[]) {
  return rows.map((row) => {
    const normalized = { ...row };
    for (const key of ["id", "bigcommerce_id", "variants_count", "orders", "products", "sort_order", "healthy", "low_stock", "overstock", "no_sales", "out_of_stock"]) {
      if (normalized[key] !== null && normalized[key] !== undefined) normalized[key] = Number(normalized[key]);
    }
    for (const key of ["units", "units_sold", "revenue", "cost_price", "current_stock", "sales_velocity", "days_of_stock", "gross_profit", "price"]) {
      if (normalized[key] !== null && normalized[key] !== undefined) normalized[key] = Number(normalized[key]);
    }
    return normalized;
  });
}

export async function getProduct360Overview(input: { dateFrom?: unknown; dateTo?: unknown; brand?: unknown; category?: unknown }) {
  const range = dateRange(input.dateFrom, input.dateTo);
  const categoryCatalog = await getProduct360CategoryCatalog();
  const brand = String(input.brand ?? "").trim().slice(0, 100);
  const category = PRODUCT_360_MAIN_CATEGORIES.find((label) => categoryKey(label) === categoryKey(input.category));
  const categoryIds = category ? categoryIdsForMainCategory(category, categoryCatalog.categories) : undefined;
  const filters: Product360Filters = {
    brand: brand || undefined,
    categoryIds: category ? (categoryIds?.length ? categoryIds : [0]) : undefined,
  };
  const base = productBaseCte(range, undefined, filters);
  const lineFilter = lineItemProductFilter(filters);
  const [metrics, trend, fastSellers, profitDrivers, restockAlerts, slowMovers, brandPerformance, inventoryStatus, salesVelocity, replenishmentPriority, recentActivity, brandOptions, categorySales] = await Promise.all([
    db.execute(sql.raw(`
      SELECT
        COUNT(*)::int AS total_products,
        COUNT(*) FILTER (WHERE current_stock > 0)::int AS active_products,
        COUNT(*) FILTER (WHERE sales_velocity > 5)::int AS fast_sellers,
        COUNT(*) FILTER (WHERE sales_velocity > 0 AND days_of_stock <= 7)::int AS restock_needed,
        COUNT(*) FILTER (WHERE current_stock <= 10)::int AS low_stock,
        COUNT(*) FILTER (WHERE current_stock > 0 AND (days_of_stock >= 90 OR (units_sold = 0 AND current_stock > 0)))::int AS overstock,
        COUNT(*) FILTER (WHERE gross_profit > 0)::int AS profit_drivers,
        COUNT(*) FILTER (WHERE current_stock > 0 AND sales_velocity < 1)::int AS slow_movers
      FROM (${base}) product_base
    `)),
    db.execute(sql.raw(`
      SELECT
        TO_CHAR(DATE_TRUNC('day', li.order_date), 'Mon DD') AS label,
        DATE_TRUNC('day', li.order_date)::date AS day,
        SUM(li.quantity)::numeric AS units,
        SUM(li.quantity * li.base_price)::numeric AS revenue,
        SUM(CASE WHEN p.cost_price IS NULL THEN NULL ELSE li.quantity * (li.base_price - p.cost_price) END)::numeric AS gross_profit
      FROM bc_order_line_items li
      LEFT JOIN products p ON p.bigcommerce_id = li.bigcommerce_product_id
      WHERE li.order_date >= ${quote(range.dateFrom)}::date
        AND li.order_date < ${quote(range.dateTo)}::date + interval '1 day'
        ${lineFilter}
      GROUP BY day, label
      ORDER BY day
    `)),
    db.execute(sql.raw(`
      SELECT id, name, sku, units_sold, revenue, sales_velocity, current_stock, days_of_stock
      FROM (${base}) product_base
      WHERE sales_velocity > 0
      ORDER BY sales_velocity DESC, units_sold DESC
      LIMIT 8
    `)),
    db.execute(sql.raw(`
      SELECT id, name, sku, revenue, gross_profit, sales_velocity, current_stock
      FROM (${base}) product_base
      WHERE gross_profit IS NOT NULL AND gross_profit > 0
      ORDER BY gross_profit DESC
      LIMIT 8
    `)),
    db.execute(sql.raw(`
      SELECT id, name, sku, current_stock, units_sold, sales_velocity, days_of_stock, gross_profit
      FROM (${base}) product_base
      WHERE sales_velocity > 0 AND days_of_stock <= 14
      ORDER BY days_of_stock ASC, sales_velocity DESC
      LIMIT 8
    `)),
    db.execute(sql.raw(`
      SELECT id, name, sku, current_stock, units_sold, sales_velocity, days_of_stock, last_sold
      FROM (${base}) product_base
      WHERE current_stock > 0 AND (sales_velocity < 1 OR last_sold IS NULL)
      ORDER BY current_stock DESC, sales_velocity ASC
      LIMIT 8
    `)),
    db.execute(sql.raw(`
      SELECT
        COALESCE(NULLIF(brand_name, ''), 'Unbranded') AS label,
        SUM(units_sold)::numeric AS units,
        SUM(revenue)::numeric AS revenue
      FROM (${base}) product_base
      WHERE units_sold > 0
      GROUP BY label
      ORDER BY units DESC, revenue DESC
      LIMIT 8
    `)),
    db.execute(sql.raw(`
      SELECT
        COUNT(*) FILTER (WHERE current_stock > 10 AND units_sold > 0 AND days_of_stock > 14 AND days_of_stock < 90)::int AS healthy,
        COUNT(*) FILTER (WHERE current_stock > 0 AND current_stock <= 10)::int AS low_stock,
        COUNT(*) FILTER (WHERE current_stock > 0 AND units_sold > 0 AND days_of_stock >= 90)::int AS overstock,
        COUNT(*) FILTER (WHERE current_stock > 0 AND units_sold = 0)::int AS no_sales,
        COUNT(*) FILTER (WHERE current_stock <= 0)::int AS out_of_stock
      FROM (${base}) product_base
    `)),
    db.execute(sql.raw(`
      SELECT
        label,
        sort_order,
        COUNT(*)::int AS products
      FROM (
        SELECT
          CASE
            WHEN sales_velocity <= 0 THEN '0'
            WHEN sales_velocity <= 1 THEN '0.1 - 1'
            WHEN sales_velocity <= 5 THEN '1.1 - 5'
            WHEN sales_velocity <= 10 THEN '5.1 - 10'
            ELSE '10.1+'
          END AS label,
          CASE
            WHEN sales_velocity <= 0 THEN 1
            WHEN sales_velocity <= 1 THEN 2
            WHEN sales_velocity <= 5 THEN 3
            WHEN sales_velocity <= 10 THEN 4
            ELSE 5
          END AS sort_order
        FROM (${base}) product_base
      ) velocity_buckets
      GROUP BY label, sort_order
      ORDER BY sort_order
    `)),
    db.execute(sql.raw(`
      SELECT
        label,
        COUNT(*)::int AS products
      FROM (
        SELECT
          CASE
            WHEN current_stock <= 0 OR (sales_velocity > 0 AND days_of_stock <= 7) THEN 'Urgent'
            WHEN sales_velocity > 0 AND days_of_stock <= 14 THEN 'Restock Soon'
            WHEN current_stock > 0 AND units_sold = 0 THEN 'No Action'
            WHEN current_stock > 0 AND days_of_stock >= 90 THEN 'No Action'
            WHEN current_stock <= 10 THEN 'Monitor'
            ELSE 'Healthy'
          END AS label
        FROM (${base}) product_base
      ) priority_buckets
      GROUP BY label
      ORDER BY CASE label
        WHEN 'Urgent' THEN 1
        WHEN 'Restock Soon' THEN 2
        WHEN 'Monitor' THEN 3
        WHEN 'Healthy' THEN 4
        ELSE 5
      END
    `)),
    db.execute(sql.raw(`
      SELECT event_date, event, product_name, detail
      FROM (
        SELECT
          l.created_at AS event_date,
          'Stock updated' AS event,
          COALESCE(p.name, 'Unknown product') AS product_name,
          'Inventory push' AS detail
        FROM inventory_push_logs l
        LEFT JOIN products p ON p.id = l.product_id
        UNION ALL
        SELECT
          l.created_at AS event_date,
          'Stock updated' AS event,
          COALESCE(p.name, 'Unknown product') AS product_name,
          'Inventory removal' AS detail
        FROM inventory_remove_logs l
        LEFT JOIN products p ON p.id = l.product_id
      ) activity
      ORDER BY event_date DESC
      LIMIT 5
    `)),
    db.execute(sql.raw(`
      SELECT DISTINCT COALESCE(NULLIF(TRIM(brand_name), ''), 'Unbranded') AS label
      FROM products
      ORDER BY label
      LIMIT 200
    `)),
    db.execute(sql.raw(`
      SELECT p.categories,
        SUM(li.quantity)::numeric AS units,
        SUM(li.quantity * li.base_price)::numeric AS revenue
      FROM bc_order_line_items li
      JOIN products p ON p.bigcommerce_id = li.bigcommerce_product_id
      WHERE li.order_date >= ${quote(range.dateFrom)}::date
        AND li.order_date < ${quote(range.dateTo)}::date + interval '1 day'
        ${lineFilter}
      GROUP BY p.id, p.categories
    `)),
  ]);

  const categoryMap = new Map(categoryCatalog.categories.map((category) => [category.id, category]));
  const categoryTotals = new Map(PRODUCT_360_MAIN_CATEGORIES.map((label) => [label, { label, units: 0, revenue: 0 }]));
  let otherTotals = { label: "Other / Uncategorized", units: 0, revenue: 0 };
  for (const row of categorySales.rows as Record<string, unknown>[]) {
    const label = resolveMainCategory(parseCategoryIds(row.categories), categoryMap);
    const target = label === "Other / Uncategorized" ? otherTotals : categoryTotals.get(label)!;
    target.units += Number(row.units || 0);
    target.revenue += Number(row.revenue || 0);
  }
  const categoryPerformance = [
    ...Array.from(categoryTotals.values()),
    ...(otherTotals.units || otherTotals.revenue ? [otherTotals] : []),
  ];

  return {
    range,
    metrics: metrics.rows[0] ?? {},
    trend: normalizeRows(trend.rows as Record<string, unknown>[]),
    fastSellers: normalizeRows(fastSellers.rows as Record<string, unknown>[]),
    profitDrivers: normalizeRows(profitDrivers.rows as Record<string, unknown>[]),
    restockAlerts: normalizeRows(restockAlerts.rows as Record<string, unknown>[]),
    slowMovers: normalizeRows(slowMovers.rows as Record<string, unknown>[]),
    brandPerformance: normalizeRows(brandPerformance.rows as Record<string, unknown>[]),
    inventoryStatus: normalizeRows(inventoryStatus.rows as Record<string, unknown>[]),
    salesVelocity: normalizeRows(salesVelocity.rows as Record<string, unknown>[]),
    replenishmentPriority: normalizeRows(replenishmentPriority.rows as Record<string, unknown>[]),
    recentActivity: normalizeRows(recentActivity.rows as Record<string, unknown>[]),
    brandOptions: (brandOptions.rows as Record<string, unknown>[]).map((row) => String(row.label || "")).filter(Boolean),
    categoryOptions: categoryCatalog.categories.length ? PRODUCT_360_MAIN_CATEGORIES : [],
    categoryPerformance,
    categoryWarning: categoryCatalog.warning,
  };
}

export async function getProduct360Products(input: {
  dateFrom?: unknown;
  dateTo?: unknown;
  search?: unknown;
  stockStatus?: unknown;
  replenishmentStatus?: unknown;
  page?: unknown;
  limit?: unknown;
  sortBy?: unknown;
  sortDir?: unknown;
}) {
  const range = dateRange(input.dateFrom, input.dateTo);
  const search = safeSearch(input.search);
  const stockStatus = String(input.stockStatus ?? "");
  const replenishmentStatus = String(input.replenishmentStatus ?? "");
  const page = Math.max(0, Number(input.page) || 0);
  const limit = Math.min(100, Math.max(10, Number(input.limit) || 25));
  const sortDir = String(input.sortDir).toLowerCase() === "asc" ? "ASC" : "DESC";
  const sortMap: Record<string, string> = {
    name: "name",
    units_sold: "units_sold",
    revenue: "revenue",
    gross_profit: "gross_profit",
    sales_velocity: "sales_velocity",
    current_stock: "current_stock",
    days_of_stock: "days_of_stock",
    last_sold: "last_sold",
  };
  const sortBy = sortMap[String(input.sortBy)] || "units_sold";
  const searchCondition = search
    ? `AND (name ILIKE ${quote(`%${search}%`)} ESCAPE '\\\\' OR sku ILIKE ${quote(`%${search}%`)} ESCAPE '\\\\' OR brand_name ILIKE ${quote(`%${search}%`)} ESCAPE '\\\\' OR bigcommerce_id::text ILIKE ${quote(`%${search}%`)} ESCAPE '\\\\' OR variants::text ILIKE ${quote(`%${search}%`)} ESCAPE '\\\\')`
    : "";
  const stockCondition = stockStatus === "low"
    ? "AND current_stock <= 10"
    : stockStatus === "healthy"
      ? "AND current_stock > 10"
      : stockStatus === "no_data"
        ? "AND current_stock IS NULL"
        : "";
  const replenishCondition = replenishmentStatus === "urgent"
    ? "AND sales_velocity > 0 AND days_of_stock <= 7"
    : replenishmentStatus === "soon"
      ? "AND sales_velocity > 0 AND days_of_stock > 7 AND days_of_stock <= 14"
      : replenishmentStatus === "overstock"
        ? "AND current_stock > 0 AND (days_of_stock >= 90 OR (units_sold = 0 AND current_stock > 0))"
        : "";
  const base = productBaseCte(range);
  const result = await db.execute(sql.raw(`
    SELECT *, COUNT(*) OVER()::int AS total_count
    FROM (${base}) product_base
    WHERE 1=1
      ${searchCondition}
      ${stockCondition}
      ${replenishCondition}
    ORDER BY ${sortBy} ${sortDir} NULLS LAST, name ASC
    LIMIT ${limit} OFFSET ${page * limit}
  `));
  const rows = normalizeRows(result.rows as Record<string, unknown>[]);
  const total = Number(rows[0]?.total_count ?? 0);
  return { range, rows: rows.map(({ total_count: _total, ...row }) => row), total, page, limit };
}

export async function getProduct360Detail(input: {
  id: number;
  dateFrom?: unknown;
  dateTo?: unknown;
  customerVisibility?: "ALL" | "ASSIGNED_AND_UNASSIGNED" | "ASSIGNED_ONLY";
  visibilityUserId?: number;
}) {
  const range = dateRange(input.dateFrom, input.dateTo);
  const base = productBaseCte(range, input.id);
  const days = rangeDays(range);
  const visibility = input.customerVisibility || "ASSIGNED_ONLY";
  const visibilityUserId = Math.trunc(input.visibilityUserId || 0);
  const customerVisibilityCondition = visibility === "ALL"
    ? ""
    : visibility === "ASSIGNED_AND_UNASSIGNED"
      ? `AND li.bigcommerce_customer_id IS NOT NULL AND (
          NOT EXISTS (
            SELECT 1 FROM customers_mirror cm_scope
            JOIN customer_sales_rep csr_scope ON csr_scope.customer_id = cm_scope.id
            WHERE cm_scope.bigcommerce_customer_id = li.bigcommerce_customer_id
          )
          OR EXISTS (
            SELECT 1 FROM customers_mirror cm_scope
            JOIN customer_sales_rep csr_scope ON csr_scope.customer_id = cm_scope.id
            WHERE cm_scope.bigcommerce_customer_id = li.bigcommerce_customer_id
              AND csr_scope.assigned_user_id = ${visibilityUserId}
          )
        )`
      : `AND li.bigcommerce_customer_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM customers_mirror cm_scope
          JOIN customer_sales_rep csr_scope ON csr_scope.customer_id = cm_scope.id
          WHERE cm_scope.bigcommerce_customer_id = li.bigcommerce_customer_id
            AND csr_scope.assigned_user_id = ${visibilityUserId}
        )`;
  const [product, trend, variants, customers, history] = await Promise.all([
    db.execute(sql.raw(`SELECT * FROM (${base}) product_base LIMIT 1`)),
    db.execute(sql.raw(`
      SELECT
        DATE_TRUNC('day', li.order_date)::date AS day,
        TO_CHAR(DATE_TRUNC('day', li.order_date), 'Mon DD') AS label,
        SUM(li.quantity)::numeric AS units,
        SUM(li.quantity * li.base_price)::numeric AS revenue,
        SUM(CASE WHEN p.cost_price IS NULL THEN NULL ELSE li.quantity * (li.base_price - p.cost_price) END)::numeric AS gross_profit
      FROM bc_order_line_items li
      LEFT JOIN products p ON p.bigcommerce_id = li.bigcommerce_product_id
      WHERE li.bigcommerce_product_id = (SELECT bigcommerce_id FROM products WHERE id = ${Math.trunc(input.id)})
        AND li.order_date >= ${quote(range.dateFrom)}::date
        AND li.order_date < ${quote(range.dateTo)}::date + interval '1 day'
      GROUP BY day, label
      ORDER BY day
    `)),
    db.execute(sql.raw(`
      WITH variant_sales AS (${salesCte(range, input.id)})
      SELECT
        v->>'id' AS variant_id,
        COALESCE(NULLIF(v->>'sku', ''), '') AS sku,
        COALESCE(
          NULLIF((
            SELECT string_agg(
              COALESCE(NULLIF(option_value->>'label', ''), NULLIF(option_value->>'value', ''), ''),
              ' / ' ORDER BY option_index
            )
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(v->'option_values') = 'array' THEN v->'option_values'
                ELSE '[]'::jsonb
              END
            ) WITH ORDINALITY AS option_values(option_value, option_index)
          ), ''),
          NULLIF(v->>'label', ''),
          'Base product'
        ) AS label,
        COALESCE(NULLIF(v->>'price', '')::numeric, p.price)::numeric AS price,
        NULLIF(v->>'cost_price', '')::numeric AS cost_price,
        COALESCE(NULLIF(v->>'stock_level', '')::numeric, 0)::numeric AS current_stock,
        COALESCE(vs.units_sold, 0)::numeric AS units_sold,
        COALESCE(vs.revenue, 0)::numeric AS revenue,
        CASE WHEN COALESCE(vs.units_sold, 0) > 0 THEN vs.units_sold / ${days}.0 ELSE 0 END::numeric AS sales_velocity,
        CASE WHEN COALESCE(vs.units_sold, 0) > 0 THEN COALESCE(NULLIF(v->>'stock_level', '')::numeric, 0) / (vs.units_sold / ${days}.0) ELSE NULL END::numeric AS days_of_stock,
        CASE WHEN NULLIF(v->>'cost_price', '') IS NULL AND p.cost_price IS NULL THEN NULL
             ELSE COALESCE(vs.revenue, 0) - (COALESCE(vs.units_sold, 0) * COALESCE(NULLIF(v->>'cost_price', '')::numeric, p.cost_price)) END::numeric AS gross_profit
      FROM products p
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.variants, '[]'::jsonb)) v
      LEFT JOIN variant_sales vs ON vs.variant_id = NULLIF(v->>'id', '')::int
      WHERE p.id = ${Math.trunc(input.id)}
      ORDER BY units_sold DESC, label
    `)),
    db.execute(sql.raw(`
      SELECT
        COALESCE(NULLIF(li.bigcommerce_customer_id::text, ''), 'unknown') AS customer_id,
        COALESCE(cm.company, NULLIF(li.customer_name, ''), NULLIF(li.customer_email, ''), 'Unknown customer') AS customer,
        SUM(li.quantity)::numeric AS units_purchased,
        SUM(li.quantity * li.base_price)::numeric AS revenue,
        MAX(li.order_date) AS last_purchase,
        COUNT(DISTINCT li.bigcommerce_order_id)::int AS orders
      FROM bc_order_line_items li
      LEFT JOIN customers_mirror cm ON cm.bigcommerce_customer_id = li.bigcommerce_customer_id
      WHERE li.bigcommerce_product_id = (SELECT bigcommerce_id FROM products WHERE id = ${Math.trunc(input.id)})
        AND li.order_date >= ${quote(range.dateFrom)}::date
        AND li.order_date < ${quote(range.dateTo)}::date + interval '1 day'
        ${customerVisibilityCondition}
      GROUP BY customer_id, customer
      ORDER BY units_purchased DESC
      LIMIT 50
    `)),
    db.execute(sql.raw(`
        SELECT event_date, event, previous_value, new_value, user_name, source
      FROM (
        SELECT created_at AS event_date, 'Inventory push' AS event, previous_inventory::text AS previous_value, new_inventory::text AS new_value, COALESCE(u.name, 'System') AS user_name, 'inventory_push_logs' AS source
        FROM inventory_push_logs l LEFT JOIN users u ON u.id = l.user_id
        WHERE l.product_id = ${Math.trunc(input.id)}
        UNION ALL
        SELECT created_at AS event_date, 'Inventory removal' AS event, previous_inventory::text, new_inventory::text, COALESCE(u.name, 'System'), 'inventory_remove_logs'
        FROM inventory_remove_logs l LEFT JOIN users u ON u.id = l.user_id
        WHERE l.product_id = ${Math.trunc(input.id)}
      ) events
      ORDER BY event_date DESC
      LIMIT 50
    `)),
  ]);

  return {
    range,
    product: normalizeRows(product.rows as Record<string, unknown>[])[0] ?? null,
    trend: normalizeRows(trend.rows as Record<string, unknown>[]),
    variants: normalizeRows(variants.rows as Record<string, unknown>[]),
    customers: normalizeRows(customers.rows as Record<string, unknown>[]),
    history: normalizeRows(history.rows as Record<string, unknown>[]),
  };
}