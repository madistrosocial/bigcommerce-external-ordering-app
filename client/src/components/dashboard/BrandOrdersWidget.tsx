import type { ReactNode } from "react";
import { Link } from "wouter";
import { CalendarDays, ChevronRight, Loader2, Pin, Plus, RefreshCw, ShoppingBag, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTimeService } from "@/hooks/useTimeService";

export type BrandOrdersMetricKey = "today" | "yesterday" | "thisMonth" | "total";

export interface BrandOrdersWidgetOrder {
  bigcommerce_order_id: number;
  order_number: number;
  customer_name: string | null;
  customer_email: string | null;
  crm_customer_id: number | null;
  order_total: string | null;
}

export interface BrandOrdersWidgetBrand {
  id: number;
  name: string;
  today: number;
  yesterday: number;
  thisMonth: number;
  total: number;
  ordersToday?: BrandOrdersWidgetOrder[];
}

export interface BrandOrdersWidgetProps {
  title: string;
  description?: string;
  titleIcon?: ReactNode;
  brands: BrandOrdersWidgetBrand[];
  canViewOrders: boolean;
  loading?: boolean;
  error?: string | null;
  today?: string | null;
  timezone?: string;
  showHeader?: boolean;
  className?: string;
  manageButtonLabel?: string;
  manageButtonLoading?: boolean;
  removeDisabled?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  infoText?: string;
  footer?: ReactNode;
  brandSubtitle?: (brand: BrandOrdersWidgetBrand) => ReactNode;
  titleLevel?: "h1" | "h2";
  onManageBrands?: () => void;
  onRetry?: () => void;
  onRemoveBrand?: (brandId: number) => void;
  onMetricClick?: (brand: BrandOrdersWidgetBrand, metric: BrandOrdersMetricKey) => void;
  onOrderClick?: (order: BrandOrdersWidgetOrder) => void;
}

const metricLabels: Record<BrandOrdersMetricKey, { title: string; caption: string }> = {
  today: { title: "Orders Today", caption: "Created today" },
  yesterday: { title: "Orders Yesterday", caption: "Created yesterday" },
  thisMonth: { title: "Orders This Month", caption: "Month to date" },
  total: { title: "Total Orders", caption: "All time" },
};

function dateLabel(value: string, timezone: string) {
  const date = new Date(`${value}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatOrderTotal(value: string | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));
}

export function BrandOrdersWidget({
  title,
  description,
  titleIcon,
  brands,
  canViewOrders,
  loading = false,
  error = null,
  today = null,
  timezone,
  showHeader = true,
  className = "",
  manageButtonLabel = "Manage brands",
  manageButtonLoading = false,
  removeDisabled = false,
  emptyTitle = "No brands selected",
  emptyDescription = "Add brands to see their order metrics and today's orders.",
  infoText,
  footer,
  brandSubtitle,
  titleLevel = "h1",
  onManageBrands,
  onRetry,
  onRemoveBrand,
  onMetricClick,
  onOrderClick,
}: BrandOrdersWidgetProps) {
  const fmt = useTimeService();
  const dateTimezone = timezone || fmt.tz;
  const Title = titleLevel;

  return (
    <div className={`space-y-5 ${className}`}>
      {showHeader && (
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              {titleIcon}
              <Title className="text-xl font-bold text-slate-900">{title}</Title>
            </div>
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          {onManageBrands && (
            <Button onClick={onManageBrands} disabled={manageButtonLoading}>
              {manageButtonLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {manageButtonLabel}
            </Button>
          )}
        </header>
      )}

      {loading ? (
        <Card><CardContent className="flex min-h-48 items-center justify-center text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent></Card>
      ) : error ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-red-700">{error}</p>
          {onRetry && <Button variant="outline" onClick={onRetry}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button>}
        </CardContent></Card>
      ) : brands.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600"><Pin className="h-6 w-6" /></div>
            <h2 className="mt-4 text-base font-semibold text-slate-800">{emptyTitle}</h2>
            <p className="mt-1 max-w-md text-sm text-slate-500">{emptyDescription}</p>
            {onManageBrands && <Button className="mt-4" onClick={onManageBrands}><Plus className="mr-2 h-4 w-4" />Add brands</Button>}
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {brands.map((brand) => (
              <Card key={brand.id} className="overflow-hidden border-slate-200 shadow-sm transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
                        <ShoppingBag className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-slate-900">{brand.name}</h2>
                        {brandSubtitle ? (
                          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                            {brandSubtitle(brand)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    {onRemoveBrand && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 shrink-0 px-2 text-slate-400 hover:text-red-600"
                        aria-label={`Remove ${brand.name}`}
                        title="Remove brand"
                        onClick={() => onRemoveBrand(brand.id)}
                        disabled={removeDisabled}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {(Object.keys(metricLabels) as BrandOrdersMetricKey[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => onMetricClick?.(brand, key)}
                        disabled={!onMetricClick}
                        aria-disabled={!canViewOrders}
                        title={!canViewOrders ? "Orders → View permission is required to open matching orders" : undefined}
                        className="group rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-default disabled:hover:border-slate-200 disabled:hover:bg-slate-50/70"
                        aria-label={`Open ${metricLabels[key].title.toLowerCase()} orders for ${brand.name}`}
                      >
                        <span className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{metricLabels[key].title}</span>
                          <ChevronRight className="h-3.5 w-3.5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
                        </span>
                        <span className="mt-1 block text-2xl font-bold tabular-nums text-slate-900">{brand[key].toLocaleString()}</span>
                        <span className="mt-0.5 block text-[10px] text-slate-400">{metricLabels[key].caption}</span>
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold text-slate-800">Today’s orders</h3>
                      {canViewOrders && (
                        <span className="text-[10px] text-slate-400">
                          Top {Math.min(10, brand.today)}{brand.today > 10 ? ` of ${brand.today}` : ""}
                        </span>
                      )}
                    </div>
                    {!canViewOrders ? (
                      <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                        Customer order details require Orders → View permission.
                      </p>
                    ) : brand.ordersToday && brand.ordersToday.length > 0 ? (
                      <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
                        <table className="w-full min-w-[285px] table-fixed text-left text-[10px]">
                          <thead className="bg-slate-50 text-[9px] uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="w-[68px] px-2 py-2 font-semibold">Order #</th>
                              <th className="px-2 py-2 font-semibold">Customer</th>
                              <th className="w-[82px] px-2 py-2 text-right font-semibold">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {brand.ordersToday.map((order) => (
                              <tr key={order.bigcommerce_order_id} className="align-top hover:bg-blue-50/40">
                                <td className="whitespace-nowrap px-2 py-2">
                                  {onOrderClick ? (
                                    <button
                                      type="button"
                                      className="font-semibold text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                      onClick={() => onOrderClick(order)}
                                      aria-label={`Open BigCommerce order ${order.order_number}`}
                                    >
                                      #{order.order_number}
                                    </button>
                                  ) : (
                                    <span className="font-semibold text-slate-700">#{order.order_number}</span>
                                  )}
                                </td>
                                <td className="max-w-[150px] px-2 py-2">
                                  {order.crm_customer_id ? (
                                    <Link
                                      href={`/crm/customers/${order.crm_customer_id}`}
                                      className="block truncate font-medium text-blue-700 hover:underline"
                                      title="Open CRM profile"
                                    >
                                      {order.customer_name || order.customer_email || "Unknown customer"}
                                    </Link>
                                  ) : (
                                    <span className="block truncate font-medium text-slate-800">
                                      {order.customer_name || order.customer_email || "Unknown customer"}
                                    </span>
                                  )}
                                  {order.customer_name && (
                                    <span className="mt-0.5 block truncate text-slate-400">{order.customer_email || "Email unavailable"}</span>
                                  )}
                                </td>
                                <td className="whitespace-nowrap px-2 py-2 text-right font-semibold tabular-nums text-slate-800">
                                  {formatOrderTotal(order.order_total)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : brand.today > 0 ? (
                      <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Order details for today are not available in the synced order records yet.
                      </p>
                    ) : (
                      <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                        No orders today.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>

          {(infoText || today) && (
            <div className="flex flex-col gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs text-blue-900 sm:flex-row sm:items-center sm:justify-between">
              {infoText && <p>{infoText}</p>}
              {today && (
                <Badge variant="outline" className="w-fit shrink-0 border-blue-200 bg-white text-blue-800">
                  <CalendarDays className="mr-1.5 h-3 w-3" />
                  {dateLabel(today, dateTimezone)}
                </Badge>
              )}
            </div>
          )}
        </>
      )}

      {footer}
    </div>
  );
}
