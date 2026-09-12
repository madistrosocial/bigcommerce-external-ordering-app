import type { ReactNode } from "react";

// ─── Report Engine — Shared Types ─────────────────────────────────────────────

export type SortDir = "asc" | "desc";

export interface SortState {
  column: string;
  dir: SortDir;
}

export interface PaginationState {
  page: number;
  limit: number;
  total: number;
}

// ─── Column Definition ────────────────────────────────────────────────────────

export interface ColumnDef<R = Record<string, unknown>> {
  key: string;
  label: string;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  width?: string;
  render?: (row: R) => ReactNode;
}

// ─── Filter Definitions ───────────────────────────────────────────────────────

export type FilterType = "daterange" | "text" | "select" | "multiselect";

export interface FilterDef {
  key: string;
  label: string;
  type: FilterType;
  placeholder?: string;
  options?: { label: string; value: string }[];
}

export type FilterValues = Record<string, string | string[]>;

// ─── View Definition ──────────────────────────────────────────────────────────

export interface ReportView {
  key: string;
  label: string;
  columns: ColumnDef[];
  defaultSort: SortState;
  filters?: FilterDef[];
}

// ─── Report Config ────────────────────────────────────────────────────────────

export interface ReportConfig {
  name: string;
  description?: string;
  dataUrl: string;
  views: ReportView[];
  defaultView: string;
  globalFilters?: FilterDef[];
  exportPermission?: string;
}

// ─── API Response ─────────────────────────────────────────────────────────────

export interface ReportResponse<R = Record<string, unknown>> {
  rows: R[];
  total: number;
}
