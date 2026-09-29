import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Image as ImageIcon,
  Loader2,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldAlert,
  Upload,
  X,
} from "lucide-react";

const PAGE_SIZE = 25;
type SyncKind = "details" | "images";
type SyncField = "cost" | "description" | "inventory" | "identity";
type StartSyncInput = {
  kind: SyncKind;
  productIds: number[];
  fields: SyncField[];
  forceImageReupload: boolean;
};

type SyncJob = {
  id: number;
  kind: SyncKind;
  status: "running" | "completed" | "failed";
  total: number;
  processed: number;
  updated: number;
  unchanged: number;
  failed: number;
  skipped: number;
  photosAdded: number;
  selectedFields: string[];
  forceImageReupload?: boolean;
  currentSku?: string | null;
  startedAt: string;
  completedAt?: string | null;
  error?: string | null;
};

type SyncItem = {
  productId: number;
  vendorSku: string;
  title: string;
  bigcommerceProductId: number;
  status: "pending" | "in_progress" | "updated" | "unchanged" | "failed" | "skipped";
  updatedFields: string[];
  photosAdded: number;
  error?: string | null;
};

const SYNC_FIELDS: Array<{ value: SyncField; label: string; note: string }> = [
  { value: "cost", label: "Extended cost", note: "Kole extended cost" },
  { value: "description", label: "Description", note: "Product description" },
  { value: "inventory", label: "Inventory quantity", note: "Available inventory" },
  { value: "identity", label: "Product name, brand, UPC", note: "Catalog identity fields" },
];

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function statusPresentation(status?: SyncItem["status"]) {
  switch (status) {
    case "in_progress":
      return { label: "In progress", className: "border-amber-200 bg-amber-50 text-amber-800", dot: "bg-amber-500" };
    case "updated":
      return { label: "Updated", className: "border-emerald-200 bg-emerald-50 text-emerald-800", dot: "bg-emerald-600" };
    case "unchanged":
      return { label: "No change", className: "border-slate-200 bg-slate-100 text-slate-700", dot: "bg-slate-400" };
    case "failed":
      return { label: "Failed", className: "border-rose-200 bg-rose-50 text-rose-800", dot: "bg-rose-600" };
    case "skipped":
      return { label: "Skipped", className: "border-orange-200 bg-orange-50 text-orange-800", dot: "bg-orange-500" };
    case "pending":
    default:
      return { label: "Not yet updated", className: "border-slate-200 bg-white text-slate-600", dot: "bg-slate-300" };
  }
}

function SyncStatus({ status }: { status?: SyncItem["status"] }) {
  const presentation = statusPresentation(status);
  return (
    <Badge variant="outline" className={`${presentation.className} gap-1.5 px-2 py-1 text-[11px] font-medium`}>
      <span className={`h-1.5 w-1.5 rounded-full ${presentation.dot}`} />
      {presentation.label}
    </Badge>
  );
}

function SummaryMetric({ label, value, tone = "text-slate-900" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-xl font-semibold tabular-nums ${tone}`}>{value.toLocaleString()}</p>
    </div>
  );
}

export default function ProductSyncPage() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("dropshipping", "manage");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<SyncKind>("details");
  const [selectedFields, setSelectedFields] = useState<SyncField[]>(["cost", "description", "inventory", "identity"]);
  const [selectedProductIdsByKind, setSelectedProductIdsByKind] = useState<Record<SyncKind, Set<number>>>({
    details: new Set(),
    images: new Set(),
  });
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [logoDraft, setLogoDraft] = useState<string | null>(null);
  const [forceImageReupload, setForceImageReupload] = useState(false);
  const [selectAllPending, setSelectAllPending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setAppliedSearch(search.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const productParams = useMemo(
    () => ({ page, limit: PAGE_SIZE, ...(appliedSearch ? { search: appliedSearch } : {}), imported: true as const }),
    [page, appliedSearch],
  );

  const productsQuery = useQuery({
    queryKey: ["kole-product-sync-products", productParams],
    queryFn: () => api.getKoleProducts(productParams),
    placeholderData: (previous) => previous,
  });

  const latestQuery = useQuery({
    queryKey: ["kole-product-sync-latest", kind],
    queryFn: () => api.getKoleProductSyncLatest(kind) as Promise<SyncJob | null>,
    refetchInterval: (query) => query.state.data?.status === "running" ? 5000 : false,
  });
  const latestSummary = latestQuery.data;
  const jobQuery = useQuery({
    queryKey: ["kole-product-sync-job", kind, latestSummary?.id],
    queryFn: () => api.getKoleProductSyncJob(latestSummary!.id) as Promise<SyncJob>,
    enabled: !!latestSummary?.id,
    refetchInterval: (query) => query.state.data?.status === "running" ? 2500 : false,
  });
  const job = jobQuery.data ?? latestSummary;

  const itemsQuery = useQuery({
    queryKey: ["kole-product-sync-items", kind, job?.id, page, appliedSearch],
    queryFn: () => api.getKoleProductSyncItems(job!.id, {
      page,
      limit: PAGE_SIZE,
      ...(appliedSearch ? { search: appliedSearch } : {}),
    }) as Promise<{ rows: SyncItem[]; total: number; page: number; limit: number }>,
    enabled: !!job?.id,
    placeholderData: (previous) => previous,
    refetchInterval: job?.status === "running" ? 2500 : false,
  });

  const logoQuery = useQuery({
    queryKey: ["kole-product-sync-logo"],
    queryFn: api.getKoleProductSyncLogo,
  });

  const startSync = useMutation({
    mutationFn: (input: StartSyncInput) => api.startKoleProductSync(
      input.kind,
      input.productIds,
      input.kind === "details" ? input.fields : undefined,
      input.kind === "images" && input.forceImageReupload,
    ) as Promise<SyncJob>,
    onSuccess: (result, input) => {
      setSelectedProductIdsByKind((current) => ({ ...current, [input.kind]: new Set() }));
      if (input.kind === "images") setForceImageReupload(false);
      queryClient.setQueryData(["kole-product-sync-latest", input.kind], result);
      queryClient.setQueryData(["kole-product-sync-job", input.kind, result.id], result);
      queryClient.invalidateQueries({ queryKey: ["kole-product-sync-items", input.kind] });
      toast({
        title: input.kind === "details" ? "Details sync started" : "Image sync started",
        description: `${result.total.toLocaleString()} selected mapped product${result.total === 1 ? "" : "s"} queued for processing.`,
      });
    },
    onError: (error: Error) => toast({
      title: "Could not start sync",
      description: error.message || "Try again in a moment.",
      variant: "destructive",
    }),
  });

  const saveLogo = useMutation({
    mutationFn: (dataUrl: string) => api.saveKoleProductSyncLogo(dataUrl),
    onSuccess: () => {
      setLogoDraft(null);
      queryClient.invalidateQueries({ queryKey: ["kole-product-sync-logo"] });
      toast({ title: "Logo overlay saved", description: "The saved overlay will be used for image sync." });
    },
    onError: (error: Error) => toast({ title: "Could not save logo overlay", description: error.message, variant: "destructive" }),
  });

  const deleteLogo = useMutation({
    mutationFn: api.deleteKoleProductSyncLogo,
    onSuccess: () => {
      setLogoDraft(null);
      queryClient.setQueryData(["kole-product-sync-logo"], { dataUrl: null });
      toast({ title: "Logo overlay removed" });
    },
    onError: (error: Error) => toast({ title: "Could not remove logo overlay", description: error.message, variant: "destructive" }),
  });

  const products = productsQuery.data?.rows ?? [];
  const mappedProducts = products.filter((product) => !!product.bigcommerce_product_id);
  const mappedProductIds = mappedProducts.map((product) => product.id);
  const imageHistoryQuery = useQuery({
    queryKey: ["kole-product-sync-image-history", mappedProductIds],
    queryFn: () => api.getKoleProductSyncImageHistory(mappedProductIds),
    enabled: kind === "images" && mappedProductIds.length > 0,
    refetchInterval: job?.status === "running" ? 5000 : false,
  });
  const itemByProductId = new Map((itemsQuery.data?.rows ?? []).map((item) => [item.productId, item]));
  const selectedProductIds = selectedProductIdsByKind[kind];
  const currentPageProductIds = mappedProducts.map((product) => product.id);
  const selectedCurrentPageCount = currentPageProductIds.filter((id) => selectedProductIds.has(id)).length;
  const allCurrentPageSelected = currentPageProductIds.length > 0 && selectedCurrentPageCount === currentPageProductIds.length;
  const someCurrentPageSelected = selectedCurrentPageCount > 0 && !allCurrentPageSelected;
  const totalPages = Math.max(Math.ceil((productsQuery.data?.total ?? 0) / PAGE_SIZE), 1);
  const progress = job?.total ? Math.min(100, Math.round((job.processed / job.total) * 100)) : 0;
  const logoUrl = logoDraft ?? logoQuery.data?.dataUrl ?? null;
  const syncPending = selectAllPending || startSync.isPending || latestQuery.isLoading || jobQuery.isLoading || job?.status === "running";
  const imageSyncReady = !!logoQuery.data?.dataUrl && !logoDraft;

  useEffect(() => {
    if (kind === "images" && job && job.status !== "running") {
      queryClient.invalidateQueries({ queryKey: ["kole-product-sync-image-history"] });
    }
  }, [kind, job?.id, job?.status, queryClient]);

  const toggleField = (field: SyncField) => {
    setSelectedFields((current) => current.includes(field)
      ? current.filter((item) => item !== field)
      : [...current, field]);
  };

  const toggleProductSelection = (productId: number) => {
    setSelectedProductIdsByKind((current) => {
      const next = new Set(current[kind]);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return { ...current, [kind]: next };
    });
  };

  const toggleCurrentPageSelection = () => {
    setSelectedProductIdsByKind((current) => {
      const next = new Set(current[kind]);
      if (allCurrentPageSelected) {
        currentPageProductIds.forEach((id) => next.delete(id));
      } else {
        currentPageProductIds.forEach((id) => next.add(id));
      }
      return { ...current, [kind]: next };
    });
  };

  const clearProductSelection = () => {
    setSelectedProductIdsByKind((current) => ({ ...current, [kind]: new Set() }));
  };

  const selectAllMappedListings = async () => {
    if (!canManage || syncPending || productsQuery.isFetching || !productsQuery.data?.total) return;
    const targetKind = kind;
    const searchTerm = appliedSearch;
    setSelectAllPending(true);
    try {
      const pageSize = 100;
      const params = {
        limit: pageSize,
        imported: true as const,
        ...(searchTerm ? { search: searchTerm } : {}),
      };
      const firstPage = await api.getKoleProducts({ ...params, page: 1 });
      const pageCount = Math.ceil(firstPage.total / pageSize);
      const selectedIds = new Set(
        firstPage.rows
          .filter((product) => !!product.bigcommerce_product_id)
          .map((product) => product.id),
      );
      for (let pageNumber = 2; pageNumber <= pageCount; pageNumber++) {
        const result = await api.getKoleProducts({ ...params, page: pageNumber });
        for (const product of result.rows) {
          if (product.bigcommerce_product_id) selectedIds.add(product.id);
        }
      }
      if (selectedIds.size === 0) {
        toast({ title: "No mapped listings to select" });
        return;
      }
      setSelectedProductIdsByKind((current) => {
        const next = new Set(current[targetKind]);
        selectedIds.forEach((id) => next.add(id));
        return { ...current, [targetKind]: next };
      });
      toast({
        title: "Mapped listings selected",
        description: `${selectedIds.size.toLocaleString()} ${searchTerm ? "matching " : ""}listing${selectedIds.size === 1 ? "" : "s"} selected across all pages for ${targetKind === "details" ? "Details Sync" : "Image Sync"}.`,
      });
    } catch (error) {
      toast({
        title: "Could not select all mapped listings",
        description: (error as Error)?.message || "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setSelectAllPending(false);
    }
  };

  const handleLogoFile = (file?: File) => {
    if (!file) return;
    if (file.type !== "image/png") {
      toast({ title: "Choose a transparent PNG", description: "The logo overlay must be a PNG with transparency.", variant: "destructive" });
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast({ title: "Logo file is too large", description: "Choose a transparent PNG that is 3 MB or smaller.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setLogoDraft(reader.result);
      else toast({ title: "Could not read image", description: "Try selecting the image again.", variant: "destructive" });
    };
    reader.onerror = () => toast({ title: "Could not read image", description: "Try selecting the image again.", variant: "destructive" });
    reader.readAsDataURL(file);
  };

  const startCurrentSync = () => {
    if (!canManage || syncPending) return;
    if (kind === "images" && !imageSyncReady) {
      toast({ title: "Save a logo overlay first", description: "Image sync uses the saved transparent logo overlay.", variant: "destructive" });
      return;
    }
    if (kind === "details" && selectedFields.length === 0) {
      toast({ title: "Select at least one detail", description: "Choose which product details to sync.", variant: "destructive" });
      return;
    }
    if (selectedProductIds.size === 0) {
      toast({ title: "Select mapped products", description: "Choose at least one listing below to sync.", variant: "destructive" });
      return;
    }
    startSync.mutate({
      kind,
      productIds: Array.from(selectedProductIds),
      fields: selectedFields,
      forceImageReupload: kind === "images" && forceImageReupload,
    });
  };

  return (
    <main className="min-h-[100dvh] bg-[#f3f5f2] px-3 py-5 text-slate-800 sm:px-5 lg:px-8">
      <div className="mx-auto max-w-[1440px] space-y-5">
        <header className="flex flex-col justify-between gap-4 border-b border-slate-200/90 pb-5 sm:flex-row sm:items-end">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#527367]">
              <span className="h-px w-5 bg-[#89a79a]" />
              Kole · BigCommerce
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#1e332d] sm:text-[30px]">Product sync</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-600">
              Maintain mapped catalog details and image overlays. Review the latest run before starting another.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start rounded-lg border border-[#d6e2da] bg-[#eaf1ec] px-3 py-2 text-xs font-medium text-[#416556] sm:self-auto">
            <PackageCheck className="h-4 w-4" />
            Mapped catalog
          </div>
        </header>

        {!canManage && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p><span className="font-semibold">Read-only access.</span> Dropshipping: Manage permission is required to start a sync or change the saved logo overlay. Ask an administrator for access.</p>
          </div>
        )}

        <Tabs value={kind} onValueChange={(value) => {
          const nextKind = value as SyncKind;
          setKind(nextKind);
          setPage(1);
          if (nextKind !== "images") setForceImageReupload(false);
        }}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TabsList className="h-11 w-full justify-start rounded-xl border border-[#dfe6e0] bg-[#e9ede9] p-1 sm:w-auto">
              <TabsTrigger value="details" className="h-9 flex-1 gap-2 rounded-lg px-4 text-sm data-[state=active]:bg-white data-[state=active]:text-[#245143] data-[state=active]:shadow-sm sm:flex-none">
                <RefreshCw className="h-4 w-4" /> Details Sync
              </TabsTrigger>
              <TabsTrigger value="images" className="h-9 flex-1 gap-2 rounded-lg px-4 text-sm data-[state=active]:bg-white data-[state=active]:text-[#245143] data-[state=active]:shadow-sm sm:flex-none">
                <ImageIcon className="h-4 w-4" /> Image Sync
              </TabsTrigger>
            </TabsList>
            <p className="text-xs text-slate-500">
              {productsQuery.data?.total.toLocaleString() ?? "—"} products in the imported catalog
            </p>
          </div>

          <TabsContent value="details" className="mt-4 space-y-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <Card className="overflow-hidden border-[#dce4dd] bg-white shadow-sm">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#638375]">Details sync</p>
                      <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#243b32]">Choose what to update</h2>
                      <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">Select listings below. Only those products and the selected fields will be synced.</p>
                    </div>
                    <Button
                      onClick={startCurrentSync}
                      disabled={!canManage || syncPending || selectedFields.length === 0 || selectedProductIds.size === 0}
                      className="h-10 w-full shrink-0 bg-[#315f4d] text-white hover:bg-[#274f40] sm:w-auto"
                    >
                      {startSync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      {job?.status === "running" ? "Sync in progress" : startSync.isPending ? "Starting sync" : `Start details sync${selectedProductIds.size ? ` · ${selectedProductIds.size}` : ""}`}
                    </Button>
                  </div>
                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    {SYNC_FIELDS.map((field) => (
                      <label key={field.value} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 transition-colors ${selectedFields.includes(field.value) ? "border-[#a8c0b3] bg-[#f2f7f3]" : "border-slate-200 bg-white hover:bg-slate-50"} ${!canManage ? "cursor-not-allowed opacity-75" : ""}`}>
                        <Checkbox checked={selectedFields.includes(field.value)} onCheckedChange={() => toggleField(field.value)} disabled={!canManage || syncPending} className="mt-0.5" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-slate-800">{field.label}</span>
                          <span className="mt-0.5 block text-xs text-slate-500">{field.note}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-[#dce4dd] bg-[#e9f0eb] shadow-sm">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#638375]">Latest details run</p>
                      <p className="mt-1 text-sm font-semibold text-[#243b32]">
                        {job ? job.status === "running" ? "Running now" : job.status === "failed" ? "Run failed" : "Run complete" : "No run recorded"}
                      </p>
                    </div>
                    {job?.status === "running" ? <Loader2 className="h-4 w-4 animate-spin text-[#527367]" /> : <Clock3 className="h-4 w-4 text-[#638375]" />}
                  </div>
                  {job ? (
                    <>
                      <div className="mt-4 flex items-end justify-between gap-3">
                        <span className="font-mono text-2xl font-semibold tabular-nums text-[#243b32]">{job.processed.toLocaleString()}<span className="text-sm font-medium text-slate-500"> / {job.total.toLocaleString()}</span></span>
                        <span className="pb-1 font-mono text-xs text-slate-500">{progress}%</span>
                      </div>
                      <Progress value={progress} className="mt-2 h-2 bg-[#d4e2d9] [&>div]:bg-[#57836d]" />
                      {job.status === "running" && job.currentSku && <p className="mt-2 truncate text-xs text-slate-500">Current SKU: <span className="font-mono text-slate-700">{job.currentSku}</span></p>}
                      <div className="mt-4 grid grid-cols-2 gap-y-3 border-t border-[#d4e0d7] pt-3">
                        <SummaryMetric label="Updated" value={job.updated} tone="text-emerald-800" />
                        <SummaryMetric label="No change" value={job.unchanged} />
                        <SummaryMetric label="Failed" value={job.failed} tone={job.failed ? "text-rose-700" : "text-slate-900"} />
                        <SummaryMetric label="Skipped" value={job.skipped} tone={job.skipped ? "text-orange-700" : "text-slate-900"} />
                      </div>
                      <p className="mt-3 text-[11px] text-slate-500">Started {formatDate(job.startedAt)}</p>
                      {job.error && <p className="mt-2 flex gap-1.5 text-xs text-rose-700"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{job.error}</p>}
                    </>
                  ) : (
                    <p className="mt-4 rounded-md border border-dashed border-[#bdcec2] bg-white/60 px-3 py-4 text-xs leading-5 text-slate-600">
                      Start a details sync to see live progress and per-product results here.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="images" className="mt-4 space-y-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <Card className="border-[#dce4dd] bg-white shadow-sm">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#638375]">Image sync</p>
                      <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#243b32]">Apply the saved logo overlay</h2>
                      <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">Select listings below. Images are prepared on a 1200 × 1200 white-padded canvas with the saved transparent logo overlay.</p>
                    </div>
                    <Button onClick={startCurrentSync} disabled={!canManage || syncPending || !imageSyncReady || selectedProductIds.size === 0} className="h-10 w-full shrink-0 bg-[#315f4d] text-white hover:bg-[#274f40] sm:w-auto">
                      {startSync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                      {job?.status === "running" ? "Sync in progress" : startSync.isPending ? "Starting sync" : `Start image sync${selectedProductIds.size ? ` · ${selectedProductIds.size}` : ""}`}
                    </Button>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="flex flex-col justify-center rounded-lg border border-dashed border-[#bdcec2] bg-[#f7f9f7] p-4">
                      <input
                        ref={fileRef}
                        id="sync-logo-upload"
                        type="file"
                         accept="image/png"
                        className="hidden"
                        onChange={(event) => {
                          handleLogoFile(event.target.files?.[0]);
                          event.currentTarget.value = "";
                        }}
                      />
                      <div className="flex items-start gap-3">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#e3ede6] text-[#4f7663]"><Upload className="h-4 w-4" /></div>
                        <div>
                          <Label htmlFor="sync-logo-upload" className="text-sm font-semibold text-slate-800">Transparent logo overlay</Label>
                           <p className="mt-1 text-xs leading-5 text-slate-500">Choose a transparent PNG. Its transparent padding sets the logo position on the 1200 × 1200 canvas.</p>
                          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => fileRef.current?.click()} disabled={!canManage || saveLogo.isPending || deleteLogo.isPending}>
                            Choose image
                          </Button>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Button size="sm" onClick={() => logoDraft && saveLogo.mutate(logoDraft)} disabled={!canManage || !logoDraft || saveLogo.isPending || deleteLogo.isPending}>
                          {saveLogo.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          Save overlay
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (logoDraft) setLogoDraft(null);
                            else if (logoQuery.data?.dataUrl && window.confirm("Remove the saved logo overlay?")) deleteLogo.mutate();
                          }}
                          disabled={!canManage || (!logoDraft && !logoQuery.data?.dataUrl) || saveLogo.isPending || deleteLogo.isPending}
                          className="text-slate-600"
                        >
                          {deleteLogo.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                          {logoDraft ? "Discard preview" : "Remove saved overlay"}
                        </Button>
                      </div>
                      {!logoDraft && !logoQuery.data?.dataUrl && (
                        <p className="mt-3 text-xs text-amber-800">No saved overlay. Add and save a logo before starting image sync.</p>
                      )}
                    </div>

                    <div className="flex min-h-[190px] flex-col items-center justify-center rounded-lg border border-[#dfe6e0] bg-white p-3">
                      <div className="grid aspect-square w-full max-w-[170px] place-items-center overflow-hidden rounded-md border border-slate-200 bg-white p-4" style={{ backgroundImage: "linear-gradient(45deg, #edf0ed 25%, transparent 25%), linear-gradient(-45deg, #edf0ed 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #edf0ed 75%), linear-gradient(-45deg, transparent 75%, #edf0ed 75%)", backgroundSize: "16px 16px", backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0" }}>
                        {logoQuery.isLoading ? <div className="h-8 w-24 animate-pulse rounded bg-slate-200" /> : logoUrl ? <img src={logoUrl} alt="Logo overlay preview" className="max-h-full max-w-full object-contain" /> : <span className="text-center text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">No logo saved</span>}
                      </div>
                      <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">{logoDraft ? "Unsaved preview" : logoUrl ? "Current overlay" : "Overlay preview"}</p>
                    </div>
                  </div>
                  {logoQuery.isError && <p className="mt-3 text-xs text-rose-700">Could not load the saved overlay: {(logoQuery.error as Error).message}</p>}
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/80 p-3">
                    <div className="flex items-start gap-2.5">
                      <Checkbox
                        id="force-image-reupload"
                        checked={forceImageReupload}
                        onCheckedChange={(checked) => setForceImageReupload(checked === true)}
                        disabled={!canManage || syncPending}
                        className="mt-0.5"
                      />
                      <div className="space-y-1">
                        <Label htmlFor="force-image-reupload" className="cursor-pointer text-xs font-semibold text-amber-950">
                          Re-upload previously synced images
                        </Label>
                        <p className="text-[11px] leading-4 text-amber-900/80">
                          Bypasses upload history for this run only. Image sync appends photos, so duplicates may be added if the existing photos are still on the listing.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-[#dce4dd] bg-[#e9f0eb] shadow-sm">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#638375]">Latest image run</p>
                      <p className="mt-1 text-sm font-semibold text-[#243b32]">
                        {job ? job.status === "running" ? "Running now" : job.status === "failed" ? "Run failed" : "Run complete" : "No run recorded"}
                      </p>
                    </div>
                    {job?.status === "running" ? <Loader2 className="h-4 w-4 animate-spin text-[#527367]" /> : <Clock3 className="h-4 w-4 text-[#638375]" />}
                  </div>
                  {job ? (
                    <>
                      <div className="mt-4 flex items-end justify-between gap-3">
                        <span className="font-mono text-2xl font-semibold tabular-nums text-[#243b32]">{job.processed.toLocaleString()}<span className="text-sm font-medium text-slate-500"> / {job.total.toLocaleString()}</span></span>
                        <span className="pb-1 font-mono text-xs text-slate-500">{progress}%</span>
                      </div>
                      <Progress value={progress} className="mt-2 h-2 bg-[#d4e2d9] [&>div]:bg-[#57836d]" />
                      {job.status === "running" && job.currentSku && <p className="mt-2 truncate text-xs text-slate-500">Current SKU: <span className="font-mono text-slate-700">{job.currentSku}</span></p>}
                      <div className="mt-4 grid grid-cols-2 gap-y-3 border-t border-[#d4e0d7] pt-3">
                        <SummaryMetric label="Updated" value={job.updated} tone="text-emerald-800" />
                        <SummaryMetric label="No change" value={job.unchanged} />
                        <SummaryMetric label="Photos added" value={job.photosAdded} />
                        <SummaryMetric label="Failed" value={job.failed} tone={job.failed ? "text-rose-700" : "text-slate-900"} />
                      </div>
                      <p className="mt-3 text-[11px] text-slate-500">Started {formatDate(job.startedAt)}</p>
                      {job.forceImageReupload && <p className="mt-2 text-[11px] leading-4 text-amber-800">Upload history was bypassed for this run. Check for duplicate photos if any previous images remained on the listing.</p>}
                      {job.error && <p className="mt-2 flex gap-1.5 text-xs text-rose-700"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{job.error}</p>}
                    </>
                  ) : (
                    <p className="mt-4 rounded-md border border-dashed border-[#bdcec2] bg-white/60 px-3 py-4 text-xs leading-5 text-slate-600">
                      Start an image sync to see live progress and per-product results here.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <section aria-label="Mapped product sync results">
          <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#638375]">{kind === "details" ? "Details sync" : "Image sync"} · results</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#243b32]">Mapped products</h2>
              <p className="mt-1 text-xs text-slate-500">
                {selectedProductIds.size.toLocaleString()} selected for this sync. {appliedSearch ? "Select all matching listings across pages or check individual listings." : "Select all mapped listings across pages or check individual listings."}
              </p>
              {kind === "images" && imageHistoryQuery.isFetching && (
                <p className="mt-1 text-[11px] text-slate-500">Checking previous image uploads…</p>
              )}
              {kind === "images" && imageHistoryQuery.isError && (
                <p className="mt-1 text-[11px] text-rose-700">
                  Previous image-upload history could not be loaded: {(imageHistoryQuery.error as Error).message}
                </p>
              )}
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAllMappedListings}
                  disabled={!canManage || syncPending || productsQuery.isFetching || !productsQuery.data?.total}
                  aria-label={`Select all ${productsQuery.data?.total ?? 0} mapped listings${appliedSearch ? " matching the current search" : ""} across all pages`}
                  className="shrink-0"
                >
                  {selectAllPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {selectAllPending ? "Selecting…" : appliedSearch ? "Select all matches" : "Select all mapped"}
                  <span className="font-mono text-[10px]">({productsQuery.data?.total ?? 0})</span>
                </Button>
                {selectedProductIds.size > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearProductSelection} disabled={!canManage || syncPending}>
                    Clear selection
                  </Button>
                )}
              </div>
              <div className="relative w-full sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search SKU or product name" aria-label="Search mapped products by SKU or product name" className="h-10 border-slate-200 bg-white pl-9" />
              </div>
            </div>
          </div>

          <Card className="overflow-hidden border-[#dce4dd] bg-white shadow-sm">
            {productsQuery.isLoading ? (
              <div className="space-y-3 p-4 sm:p-5" aria-label="Loading products">
                {[0, 1, 2, 3].map((item) => <div key={item} className="h-[68px] animate-pulse rounded-lg bg-[#eef2ee]" />)}
              </div>
            ) : productsQuery.isError ? (
              <div className="flex flex-col items-center px-5 py-12 text-center">
                <AlertTriangle className="h-6 w-6 text-rose-600" />
                <p className="mt-3 text-sm font-semibold text-slate-800">Mapped products could not be loaded</p>
                <p className="mt-1 text-xs text-slate-500">{(productsQuery.error as Error).message}</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => productsQuery.refetch()}>Retry</Button>
              </div>
            ) : mappedProducts.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-12 text-center">
                <div className="grid h-11 w-11 place-items-center rounded-full bg-[#edf3ee] text-[#638375]"><PackageCheck className="h-5 w-5" /></div>
                <p className="mt-3 text-sm font-semibold text-slate-800">{appliedSearch ? "No mapped products match this search" : "No mapped products on this page"}</p>
                <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">Only products linked to a BigCommerce product are listed here. Search by SKU or product name.</p>
              </div>
            ) : (
              <>
                <div className="hidden grid-cols-[36px_minmax(0,1fr)_150px_170px] gap-4 border-b border-slate-200 bg-[#f7f9f7] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:grid">
                  <div className="flex items-center">
                    <Checkbox
                      checked={allCurrentPageSelected ? true : someCurrentPageSelected ? "indeterminate" : false}
                      onCheckedChange={toggleCurrentPageSelection}
                      disabled={!canManage || syncPending}
                      aria-label="Select all mapped products on this page"
                    />
                  </div>
                  <span>Product</span><span>Sync status</span><span>Result</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {mappedProducts.map((product) => {
                    const item = itemByProductId.get(product.id);
                    const status = item?.status;
                    const previousSourceCount = imageHistoryQuery.data?.[product.id] ?? 0;
                    return (
                      <article key={product.id} className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3 gap-y-3 px-4 py-4 transition-colors hover:bg-[#fbfcfb] md:grid-cols-[36px_minmax(0,1fr)_150px_170px] md:items-center md:gap-4 md:px-5">
                        <div className="row-span-3 flex items-center justify-center md:row-span-1">
                          <Checkbox
                            checked={selectedProductIds.has(product.id)}
                            onCheckedChange={() => toggleProductSelection(product.id)}
                            disabled={!canManage || syncPending}
                            aria-label={`Select ${product.title || product.vendor_sku || "product"} for ${kind === "details" ? "details" : "image"} sync`}
                          />
                        </div>
                        <div className="col-start-2 min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{product.title || item?.title || "Untitled product"}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                            <span>SKU <span className="font-mono font-medium text-slate-700">{product.vendor_sku}</span></span>
                            <span>BigCommerce <span className="font-mono text-slate-700">#{product.bigcommerce_product_id}</span></span>
                          </div>
                        </div>
                        <div className="col-start-2 flex items-center justify-between gap-2 md:col-start-3 md:block">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 md:hidden">Status</span>
                          <SyncStatus status={status} />
                        </div>
                        <div className="col-start-2 flex min-w-0 items-start justify-between gap-3 md:col-start-4 md:block">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 md:hidden">Result</span>
                          <div className="min-w-0 text-right md:text-left">
                            {kind === "images" && previousSourceCount > 0 && (
                              <p className="mb-1 text-xs font-medium text-emerald-700">
                                Previously uploaded · {previousSourceCount} source image{previousSourceCount === 1 ? "" : "s"}
                              </p>
                            )}
                            {item ? (
                              <>
                                {item.updatedFields.length > 0 && <p className="truncate text-xs text-slate-600">{item.updatedFields.join(", ")}</p>}
                                {kind === "images" && item.photosAdded > 0 && <p className="mt-0.5 text-xs text-slate-600">{item.photosAdded} photo{item.photosAdded === 1 ? "" : "s"} added</p>}
                                {item.error && <p className="mt-0.5 line-clamp-2 text-xs text-rose-700">{item.error}</p>}
                                {!item.updatedFields.length && !item.photosAdded && !item.error && <p className="text-xs text-slate-400">—</p>}
                              </>
                            ) : <p className="text-xs text-slate-400">No run result</p>}
                          </div>
                        </div>
                        {status === "in_progress" && <div className="col-span-full h-px overflow-hidden bg-slate-100 md:hidden"><div className="h-full w-1/3 animate-pulse bg-amber-400" /></div>}
                      </article>
                    );
                  })}
                </div>
              </>
            )}

            <div className="flex flex-col gap-2 border-t border-slate-200 bg-[#fafbfa] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="text-xs text-slate-500">
                {productsQuery.data ? `${productsQuery.data.total.toLocaleString()} catalog records · page ${page} of ${totalPages}` : "Mapped catalog"}
                {productsQuery.isFetching && !productsQuery.isLoading && <span className="ml-2 inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Updating</span>}
              </p>
              <div className="flex items-center justify-between gap-2 sm:justify-end">
                <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || productsQuery.isFetching} aria-label="Previous page">
                  <ArrowLeft className="h-3.5 w-3.5" /><span className="sm:inline">Previous</span>
                </Button>
                <span className="min-w-[72px] text-center font-mono text-xs tabular-nums text-slate-500">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || productsQuery.isFetching} aria-label="Next page">
                  <span className="sm:inline">Next</span><ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </Card>
          {job?.status === "failed" && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-rose-700"><AlertTriangle className="h-3.5 w-3.5" />The latest {kind === "details" ? "details" : "image"} run failed. Review product-level results above before retrying.</p>
          )}
          {job?.status === "completed" && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />Completed {formatDate(job.completedAt)}.</p>
          )}
        </section>
      </div>
    </main>
  );
}