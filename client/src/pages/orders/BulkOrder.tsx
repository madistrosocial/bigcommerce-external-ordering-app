import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Search,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getAuthHeaders } from "@/lib/api";
import * as api from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { customerNameFromOrderFormFileName } from "@shared/bulk-order-csv";

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
  source_row_count: number;
  drafted_item_count: number;
  missing_item_count: number;
  missing_quantity: number;
  order_total: string;
  created_at: string;
}

interface WorkbookPreview {
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
  const [csvContents, setCsvContents] = useState("");
  const [xlsxBase64, setXlsxBase64] = useState("");
  const [workbookPreview, setWorkbookPreview] = useState<WorkbookPreview | null>(null);
  const [previewingFile, setPreviewingFile] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
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
        throw new Error("Choose an Order Form, POS customer, and shipping address.");
      }
      if (xlsxBase64 && !workbookPreview?.completed_item_count) {
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
      setCsvContents("");
      setXlsxBase64("");
      setWorkbookPreview(null);
      setSelectedCustomer(null);
      setCustomerSearch("");
      setCustomerAddresses([]);
      setSelectedAddress(null);
      setFileInputKey(key => key + 1);
      await queryClient.invalidateQueries({ queryKey: ["bulk-order-imports"] });
      toast({
        title: "Bulk Order processed",
        description: imported.order_id
          ? `Draft #${imported.order_id} created; ${imported.missing_quantity} units are missing.`
          : "No requested units were in stock, so no empty draft was created.",
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
    setCsvContents("");
    setXlsxBase64("");
    setWorkbookPreview(null);
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
        setCustomerSearch(customerNameFromOrderFormFileName(file.name));
      } else {
        const base64 = arrayBufferToBase64(await file.arrayBuffer());
        const response = await fetch("/api/orders/bulk-imports/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ fileName: file.name, xlsxBase64: base64 }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not read this XLSX workbook.");

        const preview = data as WorkbookPreview;
        setXlsxBase64(base64);
        setWorkbookPreview(preview);
        setCustomerSearch(
          preview.customer_email
          || preview.customer_name
          || customerNameFromOrderFormFileName(file.name),
        );
      }
    } catch (error) {
      setFileName("");
      setCsvContents("");
      setXlsxBase64("");
      setWorkbookPreview(null);
      toast({
        title: "Could not read this Order Form",
        description: error instanceof Error ? error.message : "Please choose a valid CSV or XLSX file.",
        variant: "destructive",
      });
    } finally {
      setPreviewingFile(false);
    }
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

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bulk Order</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Processed order form will be saved as Draft Order.
          </p>
        </div>
        <Button variant="outline" onClick={() => setLocation("/orders/drafts")}>
          Open Draft Orders
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import a completed order form
          </CardTitle>
          <CardDescription>
            Supports CSV and XLSX file types.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="bulk-order-csv">Order Form file</label>
              <Input
                key={fileInputKey}
                id="bulk-order-csv"
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={event => void handleFile(event.target.files?.[0])}
              />
              {fileName && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileSpreadsheet className="h-4 w-4" />
                  {fileName}
                </p>
              )}
              {previewingFile && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Reading workbook details…
                </p>
              )}
              {workbookPreview && (
                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  <div className="font-medium">
                    Workbook customer: {workbookPreview.customer_name || "Name not found"}
                  </div>
                  <div className="text-muted-foreground">
                    {workbookPreview.customer_email || "Email not found"}
                  </div>
                  {!workbookPreview.completed_item_count && (
                    <div className="mt-2 text-amber-700">
                      No quantities are filled in yet. Complete at least one Qty cell before creating a draft.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="bulk-order-customer">Select POS customer</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="bulk-order-customer"
                  className="pl-9"
                  value={customerSearch}
                  placeholder="Search name, company, phone, or email"
                  onChange={event => {
                    setCustomerSearch(event.target.value);
                    setSelectedCustomer(null);
                  }}
                />
              </div>
              {selectedCustomer ? (
                <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
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
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                </div>
              ) : (
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-1">
                  {customerQuery.isFetching ? (
                    <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Searching POS customers…
                    </div>
                  ) : lookupTerm.length < 2 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">Choose an Order Form or search for a POS customer.</p>
                  ) : customerQuery.isError ? (
                    <p className="px-3 py-2 text-sm text-destructive">
                      {customerQuery.error instanceof Error ? customerQuery.error.message : "BigCommerce customer search failed."}
                    </p>
                  ) : customerMatches.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No BigCommerce customers match this search.</p>
                  ) : (
                    customerMatches.map(customer => (
                      <button
                        key={customer.id}
                        type="button"
                        className="flex w-full items-start justify-between gap-3 rounded px-3 py-2 text-left hover:bg-muted"
                        onClick={() => {
                          setSelectedCustomer(customer);
                          setCustomerSearch(displayCustomerName(customer));
                        }}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
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
              {exactCustomerMatch && !selectedCustomer && (
                <p className="text-xs text-muted-foreground">Select the matching POS customer.</p>
              )}
              {selectedCustomer && (
                <div className="space-y-2 border-t pt-3">
                  <label className="text-sm font-medium" htmlFor="bulk-order-address">Shipping address</label>
                  {addressesLoading ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading BigCommerce addresses…
                    </p>
                  ) : addressesError ? (
                    <p className="text-sm text-destructive">
                      Could not load addresses. Clear and reselect the customer to try again.
                    </p>
                  ) : customerAddresses.length === 0 ? (
                    <p className="text-sm text-destructive">
                      This customer has no saved BigCommerce shipping addresses. Add an address or select another customer.
                    </p>
                  ) : customerAddresses.length === 1 ? (
                    <div className="rounded-md border bg-muted/30 p-3 text-sm">
                      {formatCustomerAddress(customerAddresses[0])}
                    </div>
                  ) : (
                    <select
                      id="bulk-order-address"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="flex max-w-2xl items-start gap-2 text-xs text-muted-foreground">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              Drafts contain only available quantities. Any shortfall is saved in the Missing Items CSV. No BigCommerce order is submitted during import.
            </div>
            <Button
              onClick={() => importMutation.mutate()}
              disabled={
                !fileName
                || (!csvContents && !xlsxBase64)
                || !selectedCustomer
                || !selectedAddress
                || addressesLoading
                || Boolean(addressesError)
                || previewingFile
                || (Boolean(xlsxBase64) && !workbookPreview?.completed_item_count)
                || importMutation.isPending
              }
            >
              {importMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…</>
              ) : (
                <><Upload className="mr-2 h-4 w-4" /> Create POS Draft</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card className="border-emerald-200">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <p className="font-medium">{result.customer_name} — import complete</p>
                <p className="text-sm text-muted-foreground">
                  {result.order_id
                    ? `Draft #${result.order_id} · ${result.drafted_item_count} lines · $${Number(result.order_total).toFixed(2)}`
                    : "No units were available, so an empty POS draft was not created."}
                  {" · "}{result.missing_quantity} missing units across {result.missing_item_count} lines
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => void downloadMissingItems(result)}
                disabled={downloadingId === result.id}
              >
                {downloadingId === result.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Download Missing Items CSV
              </Button>
              {result.order_id && (
                <Button variant="outline" onClick={() => setLocation("/orders/drafts")}>
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
            <CardTitle>Processed imports</CardTitle>
            <CardDescription>Drafts and Missing Items files remain available here after refresh.</CardDescription>
          </div>
          {canViewAll && (
            <Button
              size="sm"
              variant={showAllImports ? "default" : "outline"}
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
            <p className="py-6 text-sm text-destructive">
              {importsQuery.error instanceof Error ? importsQuery.error.message : "Could not load import history."}
            </p>
          ) : (importsQuery.data ?? []).length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No Bulk Order files have been processed yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
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
                    <tr key={record.id} className="border-b last:border-0">
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}