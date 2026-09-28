import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  CheckCircle2,
  Download,
  Info,
  Loader2,
  Search,
  Upload,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import BulkOrderUploadCard from "./BulkOrderUploadCard";
import { getAuthHeaders } from "@/lib/api";
import * as api from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { customerNameFromOrderFormFileName, parseBulkOrderCsv } from "@shared/bulk-order-csv";

interface BulkOrderImportRecord {
  id: number;
  order_id: number | null;
  source_file_name: string;
  customer_name: string;
  customer_email: string | null;
  missing_file_name: string;
  source_row_count: number;
  drafted_item_count: number;
  missing_item_count: number;
  missing_quantity: number;
  created_by_name?: string | null;
  created_at: string;
  order_status?: string | null;
  order_total?: string | null;
}

interface BulkOrderImportResult {
  id: number;
  order_id: number | null;
  customer_name: string;
  customer_email: string | null;
  source_file_name: string;
  missing_file_name: string;
  customer_mismatch_warning?: string | null;
  source_row_count: number;
  drafted_item_count: number;
  missing_item_count: number;
  missing_quantity: number;
  order_total: string;
  created_at: string;
}

interface OrderFormPreview {
  customer_name: string | null;
  customer_email: string | null;
  completed_item_count: number;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return window.btoa(binary);
}

function displayCustomerName(customer: api.BigCommerceCustomer): string {
  return [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim()
    || customer.company?.trim()
    || customer.email
    || `Customer #${customer.id}`;
}

function normalizeCustomerIdentity(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function formatCustomerAddress(address: api.BigCommerceAddress): string {
  const recipient = [address.first_name, address.last_name].filter(Boolean).join(" ").trim();
  const locality = [address.city, address.state, address.zip].filter(Boolean).join(", ");
  return [
    recipient || address.company,
    address.street_1,
    address.street_2,
    locality,
    address.country,
  ].filter(Boolean).join(" · ");
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function BulkOrder() {
  const [, setLocation] = useLocation();
  const { hasPermission } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canViewAll = hasPermission("orders", "view_all_drafts");
  const [showAllImports, setShowAllImports] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileSizeBytes, setFileSizeBytes] = useState<number | null>(null);
  const [csvContents, setCsvContents] = useState("");
  const [xlsxBase64, setXlsxBase64] = useState("");
  const [orderFormPreview, setOrderFormPreview] = useState<OrderFormPreview | null>(null);
  const [previewingFile, setPreviewingFile] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<api.BigCommerceCustomer | null>(null);
  const [customerAddresses, setCustomerAddresses] = useState<api.BigCommerceAddress[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<api.BigCommerceAddress | null>(null);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [addressesError, setAddressesError] = useState("");
  const [result, setResult] = useState<BulkOrderImportResult | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const lookupTerm = customerSearch.trim();
  const customerQuery = useQuery({
    queryKey: ["bulk-order-pos-customer-search", lookupTerm],
    enabled: lookupTerm.length >= 2 && !selectedCustomer,
    queryFn: () => api.searchBulkOrderCustomers(lookupTerm),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const importsQuery = useQuery({
    queryKey: ["bulk-order-imports", showAllImports],
    queryFn: async () => {
      const params = showAllImports ? "?scope=all" : "";
      const response = await fetch(`/api/orders/bulk-imports${params}`, {
        headers: getAuthHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not load Bulk Order history.");
      return data as BulkOrderImportRecord[];
    },
  });

  const exactCustomerMatch = useMemo(() => {
    if (!lookupTerm || !customerQuery.data) return null;
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
    const expected = normalize(lookupTerm);
    const matches = customerQuery.data.filter(customer => {
      const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(" ");
      return [fullName, customer.company ?? "", customer.email ?? ""]
        .some(value => normalize(value) === expected);
    });
    return matches.length === 1 ? matches[0] : null;
  }, [customerQuery.data, lookupTerm]);

  const customerMismatchWarning = useMemo(() => {
    if (!selectedCustomer || !fileName) return null;

    const formName = orderFormPreview?.customer_name?.trim() ?? "";
    const formEmail = orderFormPreview?.customer_email?.trim() ?? "";
    const selectedNames = [
      displayCustomerName(selectedCustomer),
      selectedCustomer.company ?? "",
    ].filter(Boolean);
    const matchesSelectedName = (value: string) => selectedNames.some(
      name => normalizeCustomerIdentity(name) === normalizeCustomerIdentity(value),
    );
    const selectedEmail = String(selectedCustomer.email ?? "").trim();
    const fileNameCustomer = customerNameFromOrderFormFileName(fileName);
    const genericFileName = ["", "order", "orderform", "bulkorder"].includes(
      normalizeCustomerIdentity(fileNameCustomer),
    );
    const mismatch = Boolean(
      (formName && !matchesSelectedName(formName))
      || (formEmail && selectedEmail && formEmail.toLowerCase() !== selectedEmail.toLowerCase())
      || (!formEmail && !formName && !genericFileName && !matchesSelectedName(fileNameCustomer)),
    );

    return mismatch
      ? "Selected customer doesn't match the form. The draft will use this customer."
      : null;
  }, [fileName, orderFormPreview, selectedCustomer]);

  useEffect(() => {
    if (!selectedCustomer) {
      setCustomerAddresses([]);
      setSelectedAddress(null);
      setAddressesLoading(false);
      setAddressesError("");
      return;
    }

    let active = true;
    setCustomerAddresses([]);
    setSelectedAddress(null);
    setAddressesLoading(true);
    setAddressesError("");
    api.getCustomerAddresses(selectedCustomer.id)
      .then(addresses => {
        if (!active) return;
        setCustomerAddresses(addresses);
        setSelectedAddress(addresses[0] ?? null);
      })
      .catch(error => {
        if (!active) return;
        setAddressesError(error instanceof Error ? error.message : "Could not load BigCommerce addresses.");
      })
      .finally(() => {
        if (active) setAddressesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedCustomer?.id]);

  const importMutation = useMutation({
    mutationFn: async () => {
      const hasContent = Boolean(csvContents || xlsxBase64);
      if (!fileName || !hasContent || !selectedCustomer || !selectedAddress) {
        throw new Error("Choose an Order Form, customer, and shipping address.");
      }
      if (xlsxBase64 && !orderFormPreview?.completed_item_count) {
        throw new Error("Enter at least one quantity in the XLSX workbook before creating a draft.");
      }
      const response = await fetch("/api/orders/bulk-imports", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          fileName,
          ...(csvContents ? { csv: csvContents } : { xlsxBase64 }),
          bigcommerceCustomerId: selectedCustomer.id,
          addressId: selectedAddress.id,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const duplicateInfo = data.existing_import_id
          ? ` Existing import: #${data.existing_import_id}.`
          : "";
        throw new Error(`${data.error || "Bulk Order import failed."}${duplicateInfo}`);
      }
      return data as BulkOrderImportResult;
    },
    onSuccess: async imported => {
      setResult(imported);
      setFileName("");
      setFileSizeBytes(null);
      setCsvContents("");
      setXlsxBase64("");
      setOrderFormPreview(null);
      setSelectedCustomer(null);
      setCustomerSearch("");
      setCustomerAddresses([]);
      setSelectedAddress(null);
      await queryClient.invalidateQueries({ queryKey: ["bulk-order-imports"] });
      const summary = imported.order_id
        ? `Draft #${imported.order_id} created; ${imported.missing_quantity} units are missing.`
        : "No requested units were in stock, so no empty draft was created.";
      toast({
        title: imported.customer_mismatch_warning ? "Bulk Order processed with warning" : "Bulk Order processed",
        description: [imported.customer_mismatch_warning, summary].filter(Boolean).join(" "),
      });
    },
    onError: error => {
      toast({
        title: "Could not process Order Form",
        description: error instanceof Error ? error.message : "Please review the file and try again.",
        variant: "destructive",
      });
    },
  });

  const handleFile = async (file?: File) => {
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    const isCsv = lowerName.endsWith(".csv");
    const isXlsx = lowerName.endsWith(".xlsx");
    if (!isCsv && !isXlsx) {
      toast({ title: "Choose a CSV or XLSX Order Form", variant: "destructive" });
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast({ title: "Order Form is too large", description: "The maximum file size is 4 MB.", variant: "destructive" });
      return;
    }

    setFileName(file.name);
    setFileSizeBytes(file.size);
    setCsvContents("");
    setXlsxBase64("");
    setOrderFormPreview(null);
    setSelectedCustomer(null);
    setCustomerAddresses([]);
    setSelectedAddress(null);
    setCustomerSearch("");
    setResult(null);
    setPreviewingFile(isXlsx);
    try {
      if (isCsv) {
        const text = await file.text();
        setCsvContents(text);
        let preview: OrderFormPreview | null = null;
        try {
          const parsed = parseBulkOrderCsv(text, { allowEmptyItems: true });
          preview = {
            customer_name: parsed.customerName ?? null,
            customer_email: parsed.customerEmail ?? null,
            completed_item_count: parsed.items.length,
          };
        } catch {
          // Keep the file selectable; the import endpoint will report CSV validation errors.
        }
        setOrderFormPreview(preview);
        setCustomerSearch(
          preview?.customer_email
          || preview?.customer_name
          || customerNameFromOrderFormFileName(file.name),
        );
      } else {
        const base64 = arrayBufferToBase64(await file.arrayBuffer());
        const response = await fetch("/api/orders/bulk-imports/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ fileName: file.name, xlsxBase64: base64 }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not read this XLSX workbook.");

        const preview = data as OrderFormPreview;
        setXlsxBase64(base64);
        setOrderFormPreview(preview);
        setCustomerSearch(
          preview.customer_email
          || preview.customer_name
          || customerNameFromOrderFormFileName(file.name),
        );
      }
    } catch (error) {
      setFileName("");
      setFileSizeBytes(null);
      setCsvContents("");
      setXlsxBase64("");
      setOrderFormPreview(null);
      toast({
        title: "Could not read this Order Form",
        description: error instanceof Error ? error.message : "Please choose a valid CSV or XLSX file.",
        variant: "destructive",
      });
    } finally {
      setPreviewingFile(false);
    }
  };

  const removeSelectedFile = () => {
    setFileName("");
    setFileSizeBytes(null);
    setCsvContents("");
    setXlsxBase64("");
    setOrderFormPreview(null);
    setSelectedCustomer(null);
    setCustomerSearch("");
    setCustomerAddresses([]);
    setSelectedAddress(null);
    setAddressesError("");
    setResult(null);
  };

  const downloadMissingItems = async (record: Pick<BulkOrderImportRecord, "id" | "missing_file_name">) => {
    setDownloadingId(record.id);
    try {
      const response = await fetch(`/api/orders/bulk-imports/${record.id}/missing-items`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Could not download the Missing Items CSV.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = record.missing_file_name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const customerMatches = customerQuery.data ?? [];
  const hasFileContent = Boolean(csvContents || xlsxBase64);
  const canCreateDraft = Boolean(
    fileName
    && hasFileContent
    && selectedCustomer
    && selectedAddress
    && !addressesLoading
    && !addressesError
    && !previewingFile
    && !(Boolean(xlsxBase64) && !orderFormPreview?.completed_item_count)
    && !importMutation.isPending,
  );
  const currentStep = !fileName ? 1 : selectedCustomer && selectedAddress ? 3 : 2;
  const steps = ["Upload Order Form", "Select customer", "Create Draft"];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-3 py-4 pb-28 sm:space-y-6 sm:px-6 sm:py-6 md:pb-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Bulk Order</h1>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
            Turn a completed Order Form into a POS draft.
          </p>
        </div>
        <Button className="w-full text-xs sm:w-auto" variant="outline" onClick={() => setLocation("/orders/drafts")}>
          Open Draft Orders
        </Button>
      </header>

      <nav aria-label="Bulk Order progress">
        <ol className="grid grid-cols-3 gap-2 rounded-xl border bg-card p-3 sm:p-4">
          {steps.map((label, index) => {
            const stepNumber = index + 1;
            const completed = stepNumber < currentStep;
            const active = stepNumber === currentStep;
            return (
              <li
                key={label}
                aria-current={active ? "step" : undefined}
                className={`flex min-w-0 items-center gap-2 text-xs sm:gap-3 ${
                  active ? "font-semibold text-primary" : completed ? "font-medium text-foreground" : "text-muted-foreground"
                }`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : completed
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-muted-foreground/30 bg-background"
                }`}>
                  {completed ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : stepNumber}
                </span>
                <span className="min-w-0 leading-tight">{label}</span>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="grid items-stretch gap-5 lg:grid-cols-2">
        <BulkOrderUploadCard
          fileName={fileName}
          fileSizeBytes={fileSizeBytes}
          preview={orderFormPreview}
          previewing={previewingFile}
          disabled={previewingFile || importMutation.isPending}
          onFileSelected={handleFile}
          onRemoveFile={removeSelectedFile}
        />

        <Card className="min-w-0">
          <CardHeader className="pb-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Users className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-sm">Select customer</CardTitle>
                <CardDescription className="mt-1 text-xs">
                  Find the customer and confirm the shipping address for this draft.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <label className="sr-only" htmlFor="bulk-order-customer">Search customers</label>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                id="bulk-order-customer"
                className="min-h-11 pl-9 text-sm"
                value={customerSearch}
                placeholder="Search name, company, phone, or email"
                onChange={event => {
                  setCustomerSearch(event.target.value);
                  setSelectedCustomer(null);
                }}
              />
            </div>
            {selectedCustomer ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs">
                <div className="min-w-0">
                  <div className="truncate font-medium text-emerald-950">{displayCustomerName(selectedCustomer)}</div>
                  {selectedCustomer.company && (
                    <div className="truncate text-emerald-800">{selectedCustomer.company}</div>
                  )}
                  <div className="truncate text-emerald-800">
                    {selectedCustomer.email || "No email on BigCommerce record"}
                    {selectedCustomer.phone ? ` · ${selectedCustomer.phone}` : ""}
                  </div>
                </div>
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-label="Customer selected" />
              </div>
            ) : (
              <div className="min-h-24 max-h-56 space-y-1 overflow-y-auto rounded-lg border p-1">
                {customerQuery.isFetching ? (
                  <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Searching customers…
                  </div>
                ) : lookupTerm.length < 2 ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">Choose an Order Form or search for a customer.</p>
                ) : customerQuery.isError ? (
                  <p className="px-3 py-3 text-xs text-destructive">
                    {customerQuery.error instanceof Error ? customerQuery.error.message : "BigCommerce customer search failed."}
                  </p>
                ) : customerMatches.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">No BigCommerce customers match this search.</p>
                ) : (
                  customerMatches.map(customer => (
                    <button
                      key={customer.id}
                      type="button"
                      className="flex min-h-12 w-full items-start justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setCustomerSearch(displayCustomerName(customer));
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium">
                          {displayCustomerName(customer)}
                          {customer.company && customer.company !== displayCustomerName(customer)
                            ? ` · ${customer.company}`
                            : ""}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {customer.email || "No email"}
                          {customer.phone ? ` · ${customer.phone}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">Select</span>
                    </button>
                  ))
                )}
              </div>
            )}
            {customerMismatchWarning && (
              <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {customerMismatchWarning}
              </p>
            )}
            {exactCustomerMatch && !selectedCustomer && (
              <p className="text-xs text-muted-foreground">Select the matching customer.</p>
            )}
            {selectedCustomer && (
              <div className="space-y-2 border-t pt-4">
                <label className="text-xs font-medium" htmlFor="bulk-order-address">Shipping address</label>
                {addressesLoading ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading BigCommerce addresses…
                  </p>
                ) : addressesError ? (
                  <p className="text-xs text-destructive">
                    Could not load addresses. Clear and reselect the customer to try again.
                  </p>
                ) : customerAddresses.length === 0 ? (
                  <p className="text-xs text-destructive">
                    This customer has no saved BigCommerce shipping addresses. Add an address or select another customer.
                  </p>
                ) : customerAddresses.length === 1 ? (
                  <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                    {formatCustomerAddress(customerAddresses[0])}
                  </div>
                ) : (
                  <select
                    id="bulk-order-address"
                    className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={String(selectedAddress?.id ?? "")}
                    onChange={event => {
                      const address = customerAddresses.find(item => String(item.id) === event.target.value) ?? null;
                      setSelectedAddress(address);
                    }}
                  >
                    <option value="" disabled>Select a shipping address</option>
                    {customerAddresses.map(address => (
                      <option key={address.id} value={String(address.id)}>
                        {formatCustomerAddress(address)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          Drafts are created based on available inventory only. Missing item lists are available for download below.
        </p>
      </div>

      <div className="hidden justify-end md:flex">
        <Button className="min-h-11 min-w-56 text-xs" onClick={() => importMutation.mutate()} disabled={!canCreateDraft}>
          {importMutation.isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…</>
          ) : (
            <><Upload className="mr-2 h-4 w-4" /> Create POS Draft</>
          )}
        </Button>
      </div>

      {result && (
        <Card className="border-emerald-200">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-medium">{result.customer_name} — import complete</p>
                <p className="text-xs text-muted-foreground">
                  {result.order_id
                    ? `Draft #${result.order_id} · ${result.drafted_item_count} lines · $${Number(result.order_total).toFixed(2)}`
                    : "No units were available, so an empty POS draft was not created."}
                  {" · "}{result.missing_quantity} missing units across {result.missing_item_count} lines
                </p>
                {result.customer_mismatch_warning && (
                  <p role="status" className="mt-1 text-xs text-amber-700">
                    {result.customer_mismatch_warning}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="text-xs"
                onClick={() => void downloadMissingItems(result)}
                disabled={downloadingId === result.id}
              >
                {downloadingId === result.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Download Missing Items CSV
              </Button>
              {result.order_id && (
                <Button variant="outline" className="text-xs" onClick={() => setLocation("/orders/drafts")}>
                  Open Draft Orders
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-sm">Processed imports</CardTitle>
            <CardDescription className="text-xs">Drafts and Missing Items files remain available here after refresh.</CardDescription>
          </div>
          {canViewAll && (
            <Button
              size="sm"
              variant={showAllImports ? "default" : "outline"}
              className="text-xs"
              onClick={() => setShowAllImports(value => !value)}
            >
              {showAllImports ? "Showing all imports" : "Show all imports"}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {importsQuery.isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading imports…
            </div>
          ) : importsQuery.isError ? (
            <p className="py-6 text-xs text-destructive">
              {importsQuery.error instanceof Error ? importsQuery.error.message : "Could not load import history."}
            </p>
          ) : (importsQuery.data ?? []).length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No Bulk Order files have been processed yet.</div>
          ) : (
            <>
              <div className="space-y-3 lg:hidden">
                {(importsQuery.data ?? []).map(record => (
                  <div key={record.id} className="space-y-3 rounded-xl border p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{record.customer_name}</p>
                        <p className="truncate text-xs text-muted-foreground">{record.source_file_name}</p>
                      </div>
                      <time className="shrink-0 text-right text-xs text-muted-foreground">
                        {formatDate(record.created_at)}
                      </time>
                    </div>
                    {showAllImports && (
                      <p className="text-xs text-muted-foreground">
                        Created by {record.created_by_name || "—"}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-xs">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Draft</p>
                        {record.order_id ? (
                          <>
                            <p className="font-medium">#{record.order_id}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {record.order_status || "draft"} · ${Number(record.order_total || 0).toFixed(2)}
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">No in-stock lines</p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Missing</p>
                        <p className="font-medium">{record.missing_quantity} units</p>
                        <p className="text-xs text-muted-foreground">{record.missing_item_count} lines</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full text-xs"
                      onClick={() => void downloadMissingItems(record)}
                      disabled={downloadingId === record.id}
                    >
                      {downloadingId === record.id
                        ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        : <Download className="mr-2 h-4 w-4" />}
                      Download Missing Items CSV
                    </Button>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-[11px] text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Processed</th>
                      <th className="px-3 py-2 font-medium">Customer / source file</th>
                      {showAllImports && <th className="px-3 py-2 font-medium">Created by</th>}
                      <th className="px-3 py-2 font-medium">Draft</th>
                      <th className="px-3 py-2 text-right font-medium">Missing</th>
                      <th className="px-3 py-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(importsQuery.data ?? []).map(record => (
                      <tr key={record.id} className="border-b text-xs last:border-0">
                        <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{formatDate(record.created_at)}</td>
                        <td className="max-w-[340px] px-3 py-3">
                          <div className="truncate font-medium">{record.customer_name}</div>
                          <div className="truncate text-xs text-muted-foreground">{record.source_file_name}</div>
                        </td>
                        {showAllImports && <td className="px-3 py-3 text-muted-foreground">{record.created_by_name || "—"}</td>}
                        <td className="px-3 py-3">
                          {record.order_id ? (
                            <div>
                              <div className="font-medium">Draft #{record.order_id}</div>
                              <div className="text-xs text-muted-foreground">
                                {record.order_status || "draft"} · ${Number(record.order_total || 0).toFixed(2)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No in-stock lines</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="font-medium">{record.missing_quantity} units</div>
                          <div className="text-xs text-muted-foreground">{record.missing_item_count} lines</div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={() => void downloadMissingItems(record)}
                            disabled={downloadingId === record.id}
                          >
                            {downloadingId === record.id
                              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              : <Download className="mr-2 h-4 w-4" />}
                            Download CSV
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
        <Button className="min-h-12 w-full text-xs" onClick={() => importMutation.mutate()} disabled={!canCreateDraft}>
          {importMutation.isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…</>
          ) : (
            <><Upload className="mr-2 h-4 w-4" /> Create POS Draft</>
          )}
        </Button>
      </div>
    </div>
  );
}