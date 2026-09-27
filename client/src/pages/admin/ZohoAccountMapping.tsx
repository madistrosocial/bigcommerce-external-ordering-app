import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Link2, Loader2, RefreshCw, Search, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  clearZohoCrmCredentials,
  deleteZohoAccountMapping,
  getAdminZohoCrmCredentials,
  getZohoAccountMappings,
  getZohoCrmStatus,
  refreshZohoAccountMappings,
  saveZohoAccountMapping,
  saveZohoCrmCredentials,
  searchZohoAccounts,
} from "@/lib/api";

type Mapping = {
  id: number;
  customer_id: number;
  zoho_account_id: string | null;
  zoho_account_name: string;
  zoho_account_email: string | null;
  relationship_type: string;
  status: string;
  match_method: string;
  manually_confirmed: boolean;
  customer: {
    id: number;
    bigcommerce_customer_id: number;
    company: string | null;
    first_name: string;
    last_name: string;
    email: string;
  };
};

const statusClass: Record<string, string> = {
  mapped: "bg-emerald-100 text-emerald-700 border-0",
  unmatched: "bg-slate-100 text-slate-600 border-0",
  needs_review: "bg-amber-100 text-amber-700 border-0",
};

export default function ZohoAccountMappingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Mapping | null>(null);
  const [accountSearch, setAccountSearch] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [relationshipType, setRelationshipType] = useState("primary");
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});

  const mappings = useQuery({
    queryKey: ["zoho-account-mappings", search, status],
    queryFn: () => getZohoAccountMappings({ search, status, page: 1, limit: 100 }),
  });
  const statusQuery = useQuery({ queryKey: ["zoho-crm-status"], queryFn: getZohoCrmStatus });
  const adminCredentialQuery = useQuery({ queryKey: ["admin-zoho-crm-credentials"], queryFn: getAdminZohoCrmCredentials });
  const accounts = useQuery({
    queryKey: ["zoho-accounts", accountSearch],
    queryFn: () => searchZohoAccounts(accountSearch),
    enabled: accountSearch.trim().length >= 2,
  });

  const saveCredentials = useMutation({
    mutationFn: () => saveZohoCrmCredentials({ credentials: Object.fromEntries(
      Object.entries(credentialValues).filter(([, value]) => value.trim()),
    ) }),
    onSuccess: next => {
      setCredentialValues({});
      queryClient.setQueryData(["admin-zoho-crm-credentials"], next);
      queryClient.setQueryData(["zoho-crm-status"], next);
      toast({ title: "Zoho CRM settings saved" });
    },
    onError: (error: any) => toast({ title: "Unable to save CRM settings", description: error.message, variant: "destructive" }),
  });
  const clearCredentials = useMutation({
    mutationFn: clearZohoCrmCredentials,
    onSuccess: next => {
      queryClient.setQueryData(["admin-zoho-crm-credentials"], next);
      queryClient.setQueryData(["zoho-crm-status"], next);
      toast({ title: "Admin-defined CRM values cleared" });
    },
  });
  const refresh = useMutation({
    mutationFn: refreshZohoAccountMappings,
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ["zoho-account-mappings"] });
      toast({ title: "Zoho mappings refreshed", description: `${result.mapped} mapped, ${result.needsReview} need review, ${result.unmatched} unmatched.` });
    },
    onError: (error: any) => toast({ title: "Refresh failed", description: error.message, variant: "destructive" }),
  });
  const saveMapping = useMutation({
    mutationFn: () => saveZohoAccountMapping({
      customerId: selected!.customer_id,
      zohoAccountId: selectedAccount.id,
      zohoAccountName: selectedAccount.name,
      zohoAccountEmail: selectedAccount.email,
      zohoAccountPhone: selectedAccount.phone,
      relationshipType,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zoho-account-mappings"] });
      setSelected(null);
      setSelectedAccount(null);
      setAccountSearch("");
      toast({ title: "Zoho Account mapped" });
    },
    onError: (error: any) => toast({ title: "Unable to save mapping", description: error.message, variant: "destructive" }),
  });
  const removeMapping = useMutation({
    mutationFn: (id: number) => deleteZohoAccountMapping(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zoho-account-mappings"] });
      toast({ title: "Mapping removed" });
    },
    onError: (error: any) => toast({ title: "Unable to remove mapping", description: error.message, variant: "destructive" }),
  });

  const fields = useMemo(() => adminCredentialQuery.data?.fields ?? [], [adminCredentialQuery.data]);
  const rows: Mapping[] = mappings.data?.rows ?? [];
  const hasCredentialValues = Object.values(credentialValues).some(value => value.trim());

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <div className="flex items-center gap-2"><Link2 className="h-5 w-5 text-purple-600" /><h1 className="text-xl font-bold text-slate-800">Zoho Account Mapping</h1></div>
          <p className="mt-1 text-sm text-slate-500">Link existing SalesCore customers to one or more existing Zoho CRM Accounts. This phase never creates or edits Zoho Accounts.</p>
        </div>
        <Button onClick={() => refresh.mutate()} disabled={refresh.isPending || !statusQuery.data?.configured}>
          {refresh.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Refresh mappings
        </Button>
      </div>

      <Card className={statusQuery.data?.configured ? "border-emerald-200" : "border-amber-200"}>
        <CardContent className="flex flex-col gap-3 p-4 text-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            {statusQuery.data?.configured ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertCircle className="h-5 w-5 text-amber-600" />}
            <div><p className="font-medium text-slate-800">{statusQuery.data?.configured ? "Zoho CRM connection configured" : "Zoho CRM OAuth is not configured"}</p><p className="text-xs text-slate-500">{statusQuery.data?.apiBase}</p></div>
          </div>
          <span className="text-xs text-slate-500">Read-only Accounts access</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">CRM OAuth settings</CardTitle><CardDescription>Values are encrypted at rest and never returned to the browser. Environment variables take precedence.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {fields.map((field: any) => (
            <div key={field.key} className="space-y-1.5">
              <div className="flex justify-between"><Label className="text-xs">{field.label}</Label><span className="text-[11px] text-slate-400">{field.source}</span></div>
              <Input type={field.secret ? "password" : "text"} value={credentialValues[field.key] ?? ""} onChange={e => setCredentialValues(v => ({ ...v, [field.key]: e.target.value }))} placeholder={field.configured ? "Saved; enter to replace" : field.envName} className="font-mono text-xs" />
            </div>
          ))}
          <div className="flex items-center gap-2 md:col-span-2">
            <Button size="sm" onClick={() => saveCredentials.mutate()} disabled={!hasCredentialValues || saveCredentials.isPending}>Save CRM values</Button>
            <Button size="sm" variant="outline" onClick={() => clearCredentials.mutate()} disabled={clearCredentials.isPending}>Clear admin values</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-2 md:flex-row">
            <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search company, customer, email, BC ID, or Zoho ID" className="pl-9" /></div>
            <select value={status} onChange={e => setStatus(e.target.value)} className="h-9 rounded-md border bg-white px-3 text-sm"><option value="all">All statuses</option><option value="mapped">Mapped</option><option value="needs_review">Needs review</option><option value="unmatched">Unmatched</option></select>
          </div>
          {selected && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4">
              <div className="mb-3 flex items-start justify-between"><div><p className="text-sm font-semibold text-slate-800">Map a Zoho Account</p><p className="text-xs text-slate-500">{selected.customer.company || `${selected.customer.first_name} ${selected.customer.last_name}`} · BC #{selected.customer.bigcommerce_customer_id}</p></div><Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Cancel</Button></div>
              <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
                <div className="relative"><Input value={accountSearch} onChange={e => setAccountSearch(e.target.value)} placeholder="Search Zoho Accounts" /><div className="absolute z-10 mt-1 max-h-52 w-full overflow-auto rounded-md border bg-white shadow">{accountSearch.length >= 2 && accounts.isLoading && <p className="p-3 text-xs text-slate-500">Searching…</p>}{(accounts.data ?? []).map((account: any) => <button type="button" key={account.id} onClick={() => { setSelectedAccount(account); setAccountSearch(account.name); }} className="block w-full border-b px-3 py-2 text-left text-xs hover:bg-slate-50"><strong>{account.name || "Unnamed Account"}</strong><span className="ml-2 text-slate-400">#{account.id}</span><br /><span className="text-slate-500">{account.email || account.phone || ""}</span></button>)}</div></div>
                <select value={relationshipType} onChange={e => setRelationshipType(e.target.value)} className="h-9 rounded-md border bg-white px-3 text-sm"><option value="primary">Primary</option><option value="additional">Additional</option><option value="location">Location</option></select>
                <Button onClick={() => saveMapping.mutate()} disabled={!selectedAccount || saveMapping.isPending}>{saveMapping.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save mapping"}</Button>
              </div>
              {selectedAccount && <p className="mt-2 text-xs text-emerald-700">Selected: {selectedAccount.name} (#{selectedAccount.id})</p>}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-2">SalesCore customer</th><th className="px-3 py-2">BC ID</th><th className="px-3 py-2">Zoho Account</th><th className="px-3 py-2">Relationship</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Match</th><th className="px-3 py-2"></th></tr></thead>
              <tbody>{mappings.isLoading ? <tr><td colSpan={7} className="p-8 text-center text-slate-500"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr> : rows.length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-slate-500">No mappings yet. Configure Zoho CRM and refresh to generate reviewable matches.</td></tr> : rows.map(row => <tr key={row.id} className="border-b last:border-0"><td className="px-3 py-3"><div className="font-medium text-slate-800">{row.customer.company || [row.customer.first_name, row.customer.last_name].filter(Boolean).join(" ") || "Unnamed customer"}</div><div className="text-xs text-slate-500">{row.customer.email}</div></td><td className="px-3 py-3 font-mono text-xs">{row.customer.bigcommerce_customer_id}</td><td className="px-3 py-3">{row.zoho_account_id ? <><div className="font-medium">{row.zoho_account_name || "Unnamed Account"}</div><div className="font-mono text-xs text-slate-500">{row.zoho_account_id}</div></> : <span className="text-slate-400">No match found</span>}</td><td className="px-3 py-3 capitalize">{row.relationship_type}</td><td className="px-3 py-3"><Badge className={statusClass[row.status] ?? "bg-slate-100 text-slate-600 border-0"}>{row.status.replace("_", " ")}</Badge></td><td className="px-3 py-3 text-xs text-slate-500">{row.manually_confirmed ? "Manual" : row.match_method}</td><td className="px-3 py-3"><div className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={() => { setSelected(row); setSelectedAccount(null); setAccountSearch(""); setRelationshipType(row.relationship_type); }}>Map</Button>{row.zoho_account_id && <Button size="icon" variant="ghost" className="text-red-600" onClick={() => { if (window.confirm("Remove this local mapping? Nothing will be changed in Zoho CRM.")) removeMapping.mutate(row.id); }}><Trash2 className="h-4 w-4" /></Button>}</div></td></tr>)}</tbody></table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}