import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ColumnDef, SortState, PaginationState } from "./types";

interface ReportTableProps<R = Record<string, unknown>> {
  columns: ColumnDef<R>[];
  rows: R[];
  sort: SortState;
  pagination: PaginationState;
  isLoading: boolean;
  onSort: (col: string) => void;
  onPageChange: (page: number) => void;
}

function SortIcon({ col, sort }: { col: string; sort: SortState }) {
  if (sort.column !== col) return <ChevronsUpDown className="h-3 w-3 ml-1 text-slate-300 inline" />;
  return sort.dir === "asc"
    ? <ChevronUp className="h-3 w-3 ml-1 text-blue-500 inline" />
    : <ChevronDown className="h-3 w-3 ml-1 text-blue-500 inline" />;
}

export function ReportTable<R extends Record<string, unknown>>({
  columns,
  rows,
  sort,
  pagination,
  isLoading,
  onSort,
  onPageChange,
}: ReportTableProps<R>) {
  const { page, limit, total } = pagination;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = total === 0 ? 0 : page * limit + 1;
  const end = Math.min((page + 1) * limit, total);

  return (
    <div className="flex flex-col gap-0">
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm min-w-max">
          <thead className="bg-slate-50 sticky top-0 z-10">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap border-b border-slate-200 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} ${col.sortable ? "cursor-pointer select-none hover:text-slate-800 transition-colors" : ""}`}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={() => col.sortable && onSort(col.key)}
                >
                  {col.label}
                  {col.sortable && <SortIcon col={col.key} sort={sort} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="py-16 text-center text-slate-400">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-5 w-5 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                    <span className="text-sm">Loading report…</span>
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-16 text-center text-slate-400 text-sm">
                  No results match your filters.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-2.5 text-slate-700 ${col.align === "right" ? "text-right tabular-nums" : col.align === "center" ? "text-center" : ""}`}
                    >
                      {col.render ? col.render(row) : (row[col.key] as React.ReactNode) ?? "—"}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-3 px-1">
        <p className="text-xs text-slate-400">
          {total === 0 ? "No results" : `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()} rows`}
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
            disabled={page === 0 || isLoading}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-slate-500 min-w-[80px] text-center">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
            disabled={page >= totalPages - 1 || isLoading}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
