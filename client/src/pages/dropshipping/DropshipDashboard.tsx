import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import * as api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BrandOrdersWidget, type BrandOrdersMetricKey } from "@/components/dashboard/BrandOrdersWidget";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useTimeService } from "@/hooks/useTimeService";
import { Loader2, PackageOpen, Search } from "lucide-react";

export default function DropshipDashboardPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canViewOrders = hasPermission("orders", "view");
  const fmt = useTimeService();
  const [manageOpen, setManageOpen] = useState(false);
  const [brandSearch, setBrandSearch] = useState("");
  const [draftBrandIds, setDraftBrandIds] = useState<number[]>([]);

  const dashboardQuery = useQuery({
    queryKey: ["dropship-dashboard"],
    queryFn: api.getDropshipDashboard,
    refetchInterval: 60_000,
  });
  const brandsQuery = useQuery({
    queryKey: ["dropship-dashboard-brands"],
    queryFn: api.getDropshipDashboardBrands,
    staleTime: 60 * 60_000,
  });

  const savePins = useMutation({
    mutationFn: api.saveDropshipDashboardPins,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dropship-dashboard"] });
      toast({ title: "Dashboard brands saved" });
      setManageOpen(false);
    },
    onError: (error: Error) => toast({
      title: "Could not save dashboard brands",
      description: error.message,
      variant: "destructive",
    }),
  });

  const pinnedBrands = dashboardQuery.data?.pinnedBrands ?? [];
  const availableBrands = brandsQuery.data ?? [];
  const filteredBrands = useMemo(() => {
    const query = brandSearch.trim().toLowerCase();
    return query
      ? availableBrands.filter((brand) => brand.name.toLowerCase().includes(query))
      : availableBrands;
  }, [availableBrands, brandSearch]);

  const openManage = () => {
    setDraftBrandIds(brandsQuery.isSuccess
      ? pinnedBrands.filter((brand) => availableBrands.some((available) => available.id === brand.id)).map((brand) => brand.id)
      : pinnedBrands.map((brand) => brand.id));
    setBrandSearch("");
    setManageOpen(true);
  };

  const toggleBrand = (brandId: number) => {
    setDraftBrandIds((current) => current.includes(brandId)
      ? current.filter((id) => id !== brandId)
      : [...current, brandId]);
  };

  const openSalesHistory = (brand: api.DropshipDashboardBrand, metric: BrandOrdersMetricKey) => {
    if (!canViewOrders) {
      toast({
        title: "Orders access required",
        description: "Your account can view brand totals but does not have permission to open BigCommerce order details. Ask an administrator for Orders → View access.",
        variant: "destructive",
      });
      return;
    }
    const dates = dashboardQuery.data?.dates;
    const params = new URLSearchParams({
      salesChannel: "allorders",
      brandId: String(brand.id),
      brandName: brand.name,
    });
    if (dates && metric === "today") {
      params.set("dateFrom", dates.today);
      params.set("dateTo", dates.today);
    } else if (dates && metric === "yesterday") {
      params.set("dateFrom", dates.yesterday);
      params.set("dateTo", dates.yesterday);
    } else if (dates && metric === "thisMonth") {
      params.set("dateFrom", dates.monthStart);
      params.set("dateTo", dates.today);
    }
    setLocation(`/orders/list?${params.toString()}`);
  };

  const removeBrand = (brandId: number) => {
    savePins.mutate(pinnedBrands.filter((brand) => brand.id !== brandId).map((brand) => brand.id));
  };

  return (
    <div className="space-y-5 px-4 py-5 md:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <PackageOpen className="h-5 w-5 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900">Dropship Dashboard</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Monitor BigCommerce orders by the brands you pin here.
          </p>
        </div>
        <Button onClick={openManage} disabled={brandsQuery.isLoading}>
          {brandsQuery.isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Add brands to dashboard
        </Button>
      </header>

      {dashboardQuery.isLoading ? (
        <Card><CardContent className="flex min-h-48 items-center justify-center text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent></Card>
      ) : dashboardQuery.isError ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-red-700">Unable to load the dropship dashboard: {(dashboardQuery.error as Error).message}</p>
          <Button variant="outline" onClick={() => dashboardQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button>
        </CardContent></Card>
      ) : pinnedBrands.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600"><Pin className="h-6 w-6" /></div>
            <h2 className="mt-4 text-base font-semibold text-slate-800">Choose brands to monitor</h2>
            <p className="mt-1 max-w-md text-sm text-slate-500">Pin one or more BigCommerce brands to see their order counts and open matching orders in Sales History.</p>
            <Button className="mt-4" onClick={openManage}><Plus className="mr-2 h-4 w-4" />Add brands</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {pinnedBrands.map((brand) => (
              <Card key={brand.id} className="overflow-hidden border-slate-200 shadow-sm transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
                        <ShoppingBag className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-slate-900">{brand.name}</h2>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                          BigCommerce brand · ID {brand.id}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 shrink-0 px-2 text-slate-400 hover:text-red-600"
                      aria-label={`Remove ${brand.name} from dashboard`}
                      title="Remove from dashboard"
                      onClick={() => removeBrand(brand.id)}
                      disabled={savePins.isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {(Object.keys(metricLabels) as MetricKey[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => openSalesHistory(brand, key)}
                        aria-disabled={!canViewOrders}
                        title={!canViewOrders ? "Orders → View permission is required to open matching orders" : undefined}
                        className="group rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
                                  <button
                                    type="button"
                                    className="font-semibold text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                    onClick={() => setLocation(`/orders/bc/${order.bigcommerce_order_id}`)}
                                    aria-label={`Open BigCommerce order ${order.order_number}`}
                                  >
                                    #{order.order_number}
                                  </button>
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

          <div className="flex flex-col gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs text-blue-900 sm:flex-row sm:items-center sm:justify-between">
            <p>Counts include distinct BigCommerce orders with synced order lines linked to products currently assigned to each brand.</p>
            {dashboardQuery.data?.dates && (
              <Badge variant="outline" className="w-fit shrink-0 border-blue-200 bg-white text-blue-800">
                <CalendarDays className="mr-1.5 h-3 w-3" />
                {dateLabel(dashboardQuery.data.dates.today, dashboardQuery.data.timezone)}
              </Badge>
            )}
          </div>
        </>
      )}

      {dashboardQuery.data?.dataFreshness && (
        <div className={`rounded-xl border px-4 py-3 text-xs ${dashboardQuery.data.dataFreshness.autoSyncEnabled && dashboardQuery.data.dataFreshness.lineItemCount > 0 ? "border-emerald-100 bg-emerald-50/60 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          {dashboardQuery.data.dataFreshness.lineItemCount === 0 ? (
            <p><strong>Order detail data has not been synced yet.</strong> Run a full “Sync Order Line Items” from Admin → CRM Settings before relying on these counts.</p>
          ) : dashboardQuery.data.dataFreshness.autoSyncEnabled ? (
            <p><strong>Order line-item auto-sync is on.</strong> Latest sync: {dashboardQuery.data.dataFreshness.lastIncrementalSync ? fmt.dateTime(dashboardQuery.data.dataFreshness.lastIncrementalSync) : dashboardQuery.data.dataFreshness.lastFullSync ? fmt.dateTime(dashboardQuery.data.dataFreshness.lastFullSync) : "not recorded"}.</p>
          ) : (
            <p><strong>Order line-item auto-sync is off.</strong> Counts may be out of date. Last sync: {dashboardQuery.data.dataFreshness.lastIncrementalSync ? fmt.dateTime(dashboardQuery.data.dataFreshness.lastIncrementalSync) : dashboardQuery.data.dataFreshness.lastFullSync ? fmt.dateTime(dashboardQuery.data.dataFreshness.lastFullSync) : "not recorded"}. Configure this in Admin → CRM Settings.</p>
          )}
        </div>
      )}

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-h-[85vh] max-w-xl">
          <DialogHeader>
            <DialogTitle>Choose dashboard brands</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">Select any number of BigCommerce brands. Your selection is saved to your user account.</p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={brandSearch} onChange={(event) => setBrandSearch(event.target.value)} className="pl-9" placeholder="Search brands…" />
          </div>
          <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-slate-200">
            {brandsQuery.isLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : brandsQuery.isError ? (
              <div className="space-y-3 p-4 text-sm text-red-700">
                <p>Could not load BigCommerce brands: {(brandsQuery.error as Error).message}</p>
                <Button variant="outline" size="sm" onClick={() => brandsQuery.refetch()}>Try again</Button>
              </div>
            ) : filteredBrands.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">No matching brands.</p>
            ) : filteredBrands.map((brand) => {
              const selected = draftBrandIds.includes(brand.id);
              return (
                <label key={brand.id} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50">
                  <input type="checkbox" checked={selected} onChange={() => toggleBrand(brand.id)} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{brand.name}</span>
                  <span className="text-[11px] text-slate-400">ID {brand.id}</span>
                  {selected && <Badge className="border-0 bg-blue-100 text-blue-700">Pinned</Badge>}
                </label>
              );
            })}
          </div>
          <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
            <span className="text-xs text-slate-500">{draftBrandIds.length} selected</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setManageOpen(false)}>Cancel</Button>
              <Button onClick={() => savePins.mutate(draftBrandIds)} disabled={savePins.isPending || brandsQuery.isError}>
                {savePins.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save dashboard
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}