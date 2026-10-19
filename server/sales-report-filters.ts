import type { RequestHandler } from "express";
import { sql } from "drizzle-orm";

type SalesReportFilterOptions = {
  dateFrom?: string;
  dateTo?: string;
  bcProductIds?: number[];
  skuFilter?: string;
  bcStatusFilter?: string[];
};

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function isValidIdList(value: unknown, allowEmpty = true): boolean {
  if (value === undefined || value === null || value === "") return allowEmpty;
  if (typeof value !== "string") return false;
  const ids = value.split(",");
  return ids.length > 0 && ids.every((id) => {
    if (!/^[1-9]\d*$/.test(id)) return false;
    const parsed = Number(id);
    return Number.isSafeInteger(parsed) && parsed > 0;
  });
}

function isValidSingleId(value: unknown): boolean {
  return value === undefined
    || value === null
    || value === ""
    || (typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)));
}

export function salesReportFilterError(input: {
  dateFrom?: unknown;
  dateTo?: unknown;
  bcProductIds?: unknown;
  brandId?: unknown;
  categoryIds?: unknown;
}): string | null {
  const { dateFrom, dateTo, bcProductIds, brandId, categoryIds } = input;
  if (dateFrom !== undefined && dateFrom !== "" && !isValidDate(dateFrom)) return "Invalid dateFrom";
  if (dateTo !== undefined && dateTo !== "" && !isValidDate(dateTo)) return "Invalid dateTo";
  if (!isValidIdList(bcProductIds)) return "Invalid bcProductIds";
  if (!isValidSingleId(brandId)) return "Invalid brandId";
  if (!isValidIdList(categoryIds)) return "Invalid categoryIds";
  return null;
}

export const validateSalesReportFilters: RequestHandler = (req, res, next) => {
  const error = salesReportFilterError({
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
    bcProductIds: req.query.bcProductIds,
    brandId: req.query.brandId,
    categoryIds: req.query.categoryIds,
  });
  if (error) return res.status(400).json({ error });
  next();
};

export function parseSalesReportIds(value?: string): number[] {
  if (!value) return [];
  return value.split(",").map(Number);
}

export function buildSalesReportWhere(input: SalesReportFilterOptions) {
  const conditions = [];
  const { dateFrom, dateTo, bcProductIds, skuFilter, bcStatusFilter } = input;
  if (dateFrom) conditions.push(sql`AND li.order_date >= ${dateFrom}::date`);
  if (dateTo) conditions.push(sql`AND li.order_date < ${dateTo}::date + interval '1 day'`);

  if (bcProductIds !== undefined) {
    const safeIds = bcProductIds.filter((id) => Number.isSafeInteger(id) && id > 0);
    conditions.push(safeIds.length
      ? sql`AND li.bigcommerce_product_id IN (${sql.join(safeIds.map((id) => sql`${id}`), sql`, `)})`
      : sql`AND 1=0`);
  }

  if (skuFilter) conditions.push(sql`AND li.sku = ${skuFilter}`);
  const statuses = (bcStatusFilter ?? []).filter((status) => typeof status === "string");
  if (statuses.length) {
    conditions.push(sql`AND COALESCE(com.status, '') IN (${sql.join(statuses.map((status) => sql`${status}`), sql`, `)})`);
  }
  return sql`WHERE 1=1 ${sql.join(conditions, sql` `)}`;
}
