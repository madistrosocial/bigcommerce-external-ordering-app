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

export function DropshipDashboardPanel({ embedded = false }: { embedded?: boolean } = {}) {
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
    <>
      <BrandOrdersWidget
        className={embedded ? "min-w-0" : "px-4 py-5 md:px-6"}
        title={embedded ? "Dropship Brand Monitor" : "Dropship Dashboard"}
        description={embedded ? "Pin BigCommerce brands to track their orders alongside your sales and inventory activity." : "Monitor BigCommerce orders by the brands you pin here."}
        titleIcon={<PackageOpen className="h-5 w-5 text-blue-600" />}
        titleLevel={embedded ? "h2" : "h1"}
        brands={pinnedBrands}
        canViewOrders={canViewOrders}
        loading={dashboardQuery.isLoading}
        error={dashboardQuery.isError ? `Unable to load the dropship dashboard: ${(dashboardQuery.error as Error).message}` : null}
        today={embedded ? undefined : dashboardQuery.data?.dates.today}
        timezone={dashboardQuery.data?.timezone}
        manageButtonLabel={embedded ? "Pin brands" : "Add brands to dashboard"}
        manageButtonLoading={brandsQuery.isLoading}
        removeDisabled={savePins.isPending}
        emptyTitle="Choose brands to monitor"
        emptyDescription="Pin one or more BigCommerce brands to see their order counts and open matching orders in Sales History."
        infoText={embedded ? undefined : "Counts include distinct BigCommerce orders with synced order lines linked to products currently assigned to each brand."}
        brandSubtitle={(brand) => `BigCommerce brand · ID ${brand.id}`}
        onManageBrands={openManage}
        onRetry={() => dashboardQuery.refetch()}
        onRemoveBrand={removeBrand}
        onMetricClick={openSalesHistory}
        onOrderClick={(order) => setLocation(`/orders/bc/${order.bigcommerce_order_id}`)}
        footer={!embedded && dashboardQuery.data?.dataFreshness && (
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
      />
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
    </>
  );
}

export default function DropshipDashboardPage() {
  return <DropshipDashboardPanel />;
}