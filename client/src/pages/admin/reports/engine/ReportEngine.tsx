import { useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/lib/store";
import { getAuthHeaders } from "@/lib/api";
import { ReportTable } from "./ReportTable";
import { ReportFilters } from "./ReportFilters";
import type {
  ReportConfig,
  ReportView,
  FilterValues,
  SortState,
  PaginationState,
} from "./types";

const PAGE_SIZE = 50;

interface ReportEngineProps {
  config: ReportConfig;
}

// ─── CSV / Excel export helpers ────────────────────────────────────────────────

function rowsToCSV(columns: ReportView["columns"], rows: Record<string, unknown>[]): string {
  const header = columns.map((c) => `"${c.label}"`).join(",");
  const body = rows.map((row) =>
    columns.map((c) => {
      const v = row[c.key] ?? "";
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(",")
  );
  return [header, ...body].join("\n");
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildQueryParams(
  view: string,
  filters: FilterValues,
  sort: SortState,
  page: number,
  limit: number,
  allRows = false
): string {
  const params = new URLSearchParams();
  params.set("view", view);
  params.set("sortBy", sort.column);
  params.set("sortDir", sort.dir);
  if (!allRows) {
    params.set("page", String(page));
    params.set("limit", String(limit));
  } else {
    params.set("page", "0");
    params.set("limit", "100000");
  }

  for (const [key, val] of Object.entries(filters)) {
    if (!val || (Array.isArray(val) && val.length === 0)) continue;
    if (Array.isArray(val)) {
      params.set(key, val.join(","));
    } else if (typeof val === "string" && val.includes("|")) {
      const [from, to] = val.split("|");
      if (from) params.set(`${key}From`, from);
      if (to) params.set(`${key}To`, to);
    } else {
      params.set(key, val as string);
    }
  }
  return params.toString();
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function ReportEngine({ config }: ReportEngineProps) {
  const { toast } = useToast();
  const { currentUser } = useStore();

  const [activeViewKey, setActiveViewKey] = useState(config.defaultView);
  const [sort, setSort] = useState<SortState>(() => {
    const view = config.views.find((v) => v.key === config.defaultView);
    return view?.defaultSort ?? { column: "", dir: "desc" };
  });
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<FilterValues>({});
  const [exporting, setExporting] = useState(false);

  const activeView = config.views.find((v) => v.key === activeViewKey) ?? config.views[0];

  const allFilters = [
    ...(config.globalFilters ?? []),
    ...(activeView.filters ?? []),
  ];

  // Reset page & sort when view changes
  useEffect(() => {
    setPage(0);
    setSort(activeView.defaultSort);
    setFilters({});
  }, [activeViewKey]);

  const queryKey = [config.dataUrl, activeViewKey, filters, sort, page];
  const queryParams = buildQueryParams(activeViewKey, filters, sort, page, PAGE_SIZE);

  const { data, isLoading } = useQuery<{ rows: Record<string, unknown>[]; total: number }>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`${config.dataUrl}?${queryParams}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    placeholderData: (prev) => prev,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pagination: PaginationState = { page, limit: PAGE_SIZE, total };

  const handleSort = useCallback((col: string) => {
    setSort((prev) =>
      prev.column === col
        ? { column: col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { column: col, dir: "desc" }
    );
    setPage(0);
  }, []);

  const handleFilterChange = useCallback((key: string, val: string | string[]) => {
    setFilters((prev) => ({ ...prev, [key]: val }));
    setPage(0);
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilters({});
    setPage(0);
  }, []);

  // ─── Export ────────────────────────────────────────────────────────────────

  const handleExport = async (type: "csv" | "excel") => {
    setExporting(true);
    try {
      const allParams = buildQueryParams(activeViewKey, filters, sort, 0, 100000, true);
      const res = await fetch(`${config.dataUrl}?${allParams}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const allData: { rows: Record<string, unknown>[]; total: number } = await res.json();
      const exportRows = allData.rows;

      const csv = rowsToCSV(activeView.columns, exportRows);
      const slug = config.name.toLowerCase().replace(/\s+/g, "_");
      const viewSlug = activeView.label.toLowerCase().replace(/\s+/g, "_");
      const ts = new Date().toISOString().slice(0, 10);

      if (type === "csv") {
        downloadBlob(csv, `${slug}_${viewSlug}_${ts}.csv`, "text/csv;charset=utf-8;");
      } else {
        downloadBlob(`\uFEFF${csv}`, `${slug}_${viewSlug}_${ts}.csv`, "application/vnd.ms-excel;charset=utf-8;");
      }

      // Audit log
      await fetch("/api/reports/export-log", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: currentUser?.id,
          user_name: currentUser?.name || currentUser?.username || "",
          report_name: config.name,
          view_name: activeView.label,
          filters,
          export_type: type,
          row_count: exportRows.length,
        }),
      }).catch(() => {});

      toast({ title: `Exported ${exportRows.length.toLocaleString()} rows as ${type.toUpperCase()}` });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 max-w-screen-xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">{config.name}</h1>
          {config.description && (
            <p className="text-sm text-slate-500 mt-0.5">{config.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => handleExport("csv")}
            disabled={exporting || isLoading}
            data-testid="btn-export-csv"
          >
            <FileText className="h-3.5 w-3.5" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => handleExport("excel")}
            disabled={exporting || isLoading}
            data-testid="btn-export-excel"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Excel
          </Button>
          {exporting && <span className="text-xs text-slate-400">Preparing…</span>}
        </div>
      </div>

      {/* View tabs */}
      {config.views.length > 1 && (
        <div className="flex gap-1 border-b border-slate-200">
          {config.views.map((v) => (
            <button
              key={v.key}
              onClick={() => setActiveViewKey(v.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                v.key === activeViewKey
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
              data-testid={`tab-${v.key}`}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      {allFilters.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
          <ReportFilters
            filters={allFilters}
            values={filters}
            onChange={handleFilterChange}
            onReset={handleResetFilters}
          />
        </div>
      )}

      {/* Table */}
      <ReportTable
        columns={activeView.columns}
        rows={rows}
        sort={sort}
        pagination={pagination}
        isLoading={isLoading}
        onSort={handleSort}
        onPageChange={setPage}
      />
    </div>
  );
}
