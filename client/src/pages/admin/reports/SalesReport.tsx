import { ReportEngine } from "./engine/ReportEngine";
import { useTimeService } from "@/hooks/useTimeService";
import type { ReportConfig } from "./engine/types";

function formatCurrency(v: unknown): string {
  const n = Number(v ?? 0);
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default function SalesReportPage() {
  const fmt = useTimeService();

  const config: ReportConfig = {
    name: "Sales Report",
    description: "Analyze sales performance by product or individual order lines.",
    dataUrl: "/api/reports/sales",
    defaultView: "summary",
    globalFilters: [
      {
        key: "date",
        label: "Date",
        type: "daterange",
      },
      {
        key: "search",
        label: "Product / SKU",
        type: "text",
        placeholder: "Search product name or SKU…",
      },
      {
        key: "status",
        label: "Order Status",
        type: "select",
        options: [
          { label: "Synced", value: "synced" },
          { label: "Pending", value: "pending_sync" },
          { label: "All (incl. draft)", value: "all" },
        ],
      },
    ],
    views: [
      {
        key: "summary",
        label: "Summary",
        defaultSort: { column: "qty_sold", dir: "desc" },
        columns: [
          { key: "product_name", label: "Product", sortable: true },
          { key: "variant_label", label: "Variant", sortable: true },
          { key: "sku", label: "SKU", sortable: true, width: "130px" },
          {
            key: "qty_sold",
            label: "Qty Sold",
            sortable: true,
            align: "right",
            width: "100px",
            render: (row) => Number(row.qty_sold ?? 0).toLocaleString(),
          },
          {
            key: "revenue",
            label: "Revenue",
            sortable: true,
            align: "right",
            width: "120px",
            render: (row) => formatCurrency(row.revenue),
          },
        ],
      },
      {
        key: "details",
        label: "Order Details",
        defaultSort: { column: "order_date", dir: "desc" },
        columns: [
          { key: "product_name", label: "Product", sortable: true },
          { key: "variant_label", label: "Variant", sortable: true },
          { key: "sku", label: "SKU", sortable: true, width: "120px" },
          {
            key: "order_number",
            label: "Order #",
            sortable: true,
            width: "100px",
            render: (row) =>
              row.order_number ? (
                <span className="font-mono text-blue-600">#{String(row.order_number)}</span>
              ) : (
                <span className="text-slate-400 font-mono">Local</span>
              ),
          },
          { key: "customer_name", label: "Customer", sortable: true },
          {
            key: "quantity",
            label: "Qty",
            sortable: true,
            align: "right",
            width: "70px",
            render: (row) => Number(row.quantity ?? 0).toLocaleString(),
          },
          {
            key: "unit_price",
            label: "Unit Price",
            sortable: true,
            align: "right",
            width: "110px",
            render: (row) => formatCurrency(row.unit_price),
          },
          {
            key: "order_date",
            label: "Order Date",
            sortable: true,
            width: "150px",
            render: (row) => fmt.dateTime(row.order_date as string),
          },
        ],
      },
    ],
  };

  return <ReportEngine config={config} />;
}
