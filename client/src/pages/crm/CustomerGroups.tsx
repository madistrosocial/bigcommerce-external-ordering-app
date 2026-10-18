import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import {
  assignCustomerToGroup, createManagedCustomerGroup, getCustomerGroupCategories,
  getManagedCustomerGroups, searchBigCommerceCustomers, updateManagedCustomerGroup,
  type BigCommerceCategory, type BigCommerceCustomer, type ManagedCustomerGroup,
} from "@/lib/api";
import { Loader2, Plus, RefreshCw, Search, Users, Pencil, ShieldCheck } from "lucide-react";

type AccessType = "all" | "specific" | "none";

export default function CustomerGroupsPage() {
  const { hasPermission } = usePermissions();
  const { toast } = useToast();
  const canManage = hasPermission("customer_groups", "manage");
  const [groups, setGroups] = useState<ManagedCustomerGroup[]>([]);
  const [categories, setCategories] = useState<BigCommerceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedCustomerGroup | null>(null);
  const [name, setName] = useState("");
  const [accessType, setAccessType] = useState<AccessType>("all");
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<BigCommerceCustomer[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [assignment, setAssignment] = useState<Record<number, string>>({});
  const [savingCustomer, setSavingCustomer] = useState<number | null>(null);

  const selected = groups.find((group) => group.id === selectedId) || groups[0] || null;

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [groupRows, categoryRows] = await Promise.all([getManagedCustomerGroups(), getCustomerGroupCategories()]);
      setGroups(groupRows);
      setCategories(categoryRows);
      setSelectedId((current) => groupRows.some((group) => group.id === current) ? current : groupRows[0]?.id ?? null);
    } catch (e: any) {
      setError(e.message || "Unable to load customer groups.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const q = customerQuery.trim();
    if (q.length < 2) { setCustomerResults([]); setCustomerLoading(false); return; }
    let active = true;
    const timer = window.setTimeout(async () => {
      setCustomerLoading(true);
      try {
        const results = await searchBigCommerceCustomers(q);
        if (active) setCustomerResults(results);
      } catch (e: any) {
        if (active) toast({ title: "Customer search failed", description: e.message, variant: "destructive" });
      } finally {
        if (active) setCustomerLoading(false);
      }
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [customerQuery, toast]);

  const visibleCategories = useMemo(() => {
    const q = categoryFilter.trim().toLocaleLowerCase();
    if (!q) return categories;
    const included = new Set(categories.filter((category) => category.name.toLocaleLowerCase().includes(q)).map((category) => category.id));
    let changed = true;
    while (changed) {
      changed = false;
      for (const category of categories) {
        if (included.has(category.id) && category.parent_id && !included.has(category.parent_id)) {
          included.add(category.parent_id); changed = true;
        }
      }
    }
    return categories.filter((category) => included.has(category.id));
  }, [categories, categoryFilter]);

  function openEditor(group: ManagedCustomerGroup | null) {
    setEditing(group);
    setName(group?.name || "");
    setAccessType(group?.category_access.type || "all");
    setSelectedCategories(group?.category_access.categories || []);
    setCategoryFilter("");
    setDialogOpen(true);
  }

  async function saveGroup() {
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        category_access: { type: accessType, categories: accessType === "specific" ? selectedCategories : [] },
      };
      if (editing) await updateManagedCustomerGroup(editing.id, body);
      else await createManagedCustomerGroup(body);
      setDialogOpen(false);
      toast({ title: editing ? "Customer group updated" : "Customer group created", description: "Saved directly to BigCommerce." });
      await load();
    } catch (e: any) {
      toast({ title: "Could not save group", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function saveAssignment(customer: BigCommerceCustomer) {
    const groupId = Number(assignment[customer.id] ?? customer.customer_group_id);
    if (!groupId || groupId === Number(customer.customer_group_id)) return;
    setSavingCustomer(customer.id);
    try {
      const updated = await assignCustomerToGroup(customer.id, groupId);
      setCustomerResults((rows) => rows.map((row) => row.id === customer.id
        ? { ...row, customer_group_id: updated.customer_group_id, customer_group_name: updated.customer_group_name }
        : row));
      toast({ title: "Customer group updated", description: `${customer.company || [customer.first_name, customer.last_name].filter(Boolean).join(" ")} is now in ${updated.customer_group_name}.` });
    } catch (e: any) {
      toast({ title: "Could not update customer", description: e.message, variant: "destructive" });
    } finally { setSavingCustomer(null); }
  }

  const parentMap = new Map(categories.map((category) => [category.id, category]));
  function categoryDepth(category: BigCommerceCategory) {
    let depth = 0; let parent = parentMap.get(category.parent_id); const seen = new Set<number>();
    while (parent && !seen.has(parent.id)) { seen.add(parent.id); depth++; parent = parentMap.get(parent.parent_id); }
    return Math.min(depth, 5);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Customer Groups</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">Manage BigCommerce groups, customer assignments, and native category visibility. Changes are saved to BigCommerce.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
          {canManage && <Button size="sm" onClick={() => openEditor(null)}><Plus className="mr-2 h-4 w-4" />Create group</Button>}
        </div>
      </div>
      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Category visibility follows BigCommerce: access is set on a group and inherited by every customer assigned to it. “Specific categories” replaces that group’s category list.</p>
      </div>
      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loading ? <div className="flex items-center justify-center py-20 text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading BigCommerce groups…</div> : (
        <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <section className="overflow-hidden rounded-lg border bg-white">
            <div className="border-b bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">BigCommerce groups ({groups.length})</div>
            {groups.length === 0 ? <p className="p-5 text-sm text-slate-500">No customer groups found.</p> : groups.map((group) => (
              <button key={group.id} onClick={() => setSelectedId(group.id)} className={`w-full border-b px-4 py-3 text-left last:border-0 hover:bg-slate-50 ${selected?.id === group.id ? "bg-blue-50" : ""}`}>
                <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold text-slate-800">{group.name}</span>{selected?.id === group.id && <span className="h-2 w-2 rounded-full bg-blue-600" />}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  <Badge variant="outline" className="text-[10px]">{group.category_access.type === "specific" ? `${group.category_access.categories.length} categories` : group.category_access.type === "all" ? "All categories" : "No categories"}</Badge>
                  {group.is_default && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                  {group.is_group_for_guests && <Badge variant="secondary" className="text-[10px]">Guest</Badge>}
                </span>
              </button>
            ))}
          </section>
          <div className="space-y-5">
            {selected ? <>
              <section className="rounded-lg border bg-white">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4">
                  <div><h2 className="text-base font-semibold text-slate-800">{selected.name}</h2><p className="mt-1 text-xs text-slate-500">BigCommerce group ID: {selected.id}</p></div>
                  {canManage && <Button size="sm" variant="outline" onClick={() => openEditor(selected)}><Pencil className="mr-2 h-3.5 w-3.5" />Edit group</Button>}
                </div>
                <div className="grid gap-3 p-4 sm:grid-cols-3">
                  <div><p className="text-[11px] uppercase text-slate-400">Category access</p><p className="mt-1 text-sm font-medium capitalize">{selected.category_access.type === "specific" ? `${selected.category_access.categories.length} selected categories` : selected.category_access.type}</p></div>
                  <div><p className="text-[11px] uppercase text-slate-400">Category rules</p><p className="mt-1 text-sm font-medium">Saved in BigCommerce</p></div>
                  <div><p className="text-[11px] uppercase text-slate-400">Group type</p><p className="mt-1 text-sm font-medium">{selected.is_group_for_guests ? "Guest group" : selected.is_default ? "Default group" : "Customer group"}</p></div>
                </div>
                {selected.category_access.type === "specific" && <div className="border-t px-4 py-3"><p className="mb-2 text-xs font-semibold text-slate-600">Visible categories</p><div className="flex flex-wrap gap-1.5">{selected.category_access.categories.map((id) => <Badge key={id} variant="outline">{categories.find((category) => category.id === id)?.name || `Category ${id}`}</Badge>)}</div></div>}
              </section>
              <section className="overflow-hidden rounded-lg border bg-white">
                <div className="border-b px-4 py-3"><h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Users className="h-4 w-4" />Assign a customer to a group</h2><p className="mt-1 text-xs text-slate-500">Search BigCommerce customers by name, company, email, or phone.</p></div>
                <div className="relative p-4"><Search className="absolute left-7 top-6 h-4 w-4 text-slate-400" /><Input className="pl-9" placeholder="Search customers…" value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} /></div>
                {customerLoading && <p className="px-4 pb-3 text-xs text-slate-500">Searching BigCommerce…</p>}
                {customerQuery.trim().length >= 2 && !customerLoading && customerResults.length === 0 && <p className="px-4 pb-4 text-sm text-slate-500">No customers found.</p>}
                {customerResults.length > 0 && <div className="divide-y border-t">{customerResults.map((customer) => {
                  const currentGroup = Number(customer.customer_group_id || 0);
                  const value = assignment[customer.id] ?? (currentGroup ? String(currentGroup) : "");
                  const displayName = customer.company || [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.email;
                  return <div key={customer.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{displayName}</p><p className="truncate text-xs text-slate-500">{customer.email} · Current: {groups.find((group) => group.id === currentGroup)?.name || customer.customer_group_name || "No group"}</p></div>
                    <div className="flex w-full gap-2 sm:w-auto">
                      <Select value={value} onValueChange={(next) => setAssignment((old) => ({ ...old, [customer.id]: next }))} disabled={!canManage}>
                        <SelectTrigger className="min-w-40"><SelectValue placeholder="Choose group" /></SelectTrigger>
                        <SelectContent>{groups.map((group) => <SelectItem key={group.id} value={String(group.id)}>{group.name}</SelectItem>)}</SelectContent>
                      </Select>
                      {canManage && <Button size="sm" onClick={() => void saveAssignment(customer)} disabled={!value || Number(value) === currentGroup || savingCustomer === customer.id}>{savingCustomer === customer.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button>}
                    </div>
                  </div>;
                })}</div>}
                {!customerQuery && <p className="px-4 pb-4 text-xs text-slate-400">Enter at least two characters to search.</p>}
              </section>
            </> : <div className="rounded-lg border bg-white p-8 text-center text-sm text-slate-500">No customer groups are available.</div>}
          </div>
        </div>
      )}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Edit customer group" : "Create customer group"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="customer-group-name">Group name</Label><Input id="customer-group-name" value={name} maxLength={250} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Category access</Label>
              <Select value={accessType} onValueChange={(value) => setAccessType(value as AccessType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All categories</SelectItem><SelectItem value="specific">Specific categories</SelectItem><SelectItem value="none">No categories</SelectItem></SelectContent>
              </Select>
            </div>
            {accessType === "specific" && <div className="space-y-2"><Input placeholder="Filter categories…" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} /><div className="max-h-72 divide-y overflow-y-auto rounded-md border">{visibleCategories.map((category) => <label key={category.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50" style={{ paddingLeft: `${12 + categoryDepth(category) * 16}px` }}><input type="checkbox" checked={selectedCategories.includes(category.id)} onChange={(e) => setSelectedCategories((ids) => e.target.checked ? [...new Set([...ids, category.id])] : ids.filter((id) => id !== category.id))} /><span className="flex-1">{category.name}</span>{!category.is_visible && <span className="text-[10px] text-slate-400">Hidden on storefront</span>}</label>)}</div><p className="text-xs text-slate-500">{selectedCategories.length} categories selected. BigCommerce saves this list to the group.</p></div>}
            {editing?.is_default && <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">This is the store’s default customer group. Changes to category access affect new customers assigned to this group.</p>}
            {editing?.is_group_for_guests && <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">This group is used for guest shoppers; category access changes apply to guests.</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button><Button onClick={() => void saveGroup()} disabled={saving || !name.trim() || (accessType === "specific" && !selectedCategories.length)}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? "Save changes" : "Create group"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
