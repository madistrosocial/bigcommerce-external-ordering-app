import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/lib/api";
import { CalendarClock, Plus, RefreshCw, Search, Tag } from "lucide-react";

type Promotion = {
  id: number;
  name: string;
  status?: string;
  redemption_type?: string;
  start_date?: string | null;
  end_date?: string | null;
  rules?: Array<Record<string, any>>;
};

type Draft = {
  name: string;
  discountType: "percentage" | "fixed";
  amount: string;
  minimumSpend: string;
  startDate: string;
  endDate: string;
};

const blankDraft: Draft = {
  name: "",
  discountType: "percentage",
  amount: "",
  minimumSpend: "",
  startDate: "",
  endDate: "",
};

async function apiRequest(path: string, options: RequestInit = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...getAuthHeaders(), ...(options.headers as Record<string, string> ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The request failed.");
  return body;
}

function formatDate(value?: string | null, missing = "Not scheduled") {
  if (!value) return missing;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function PromoAutomation() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("promo_automation", "manage");
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>(blankDraft);

  const loadPromotions = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    try {
      const result = await apiRequest("/api/tools/promo-automation");
      setPromotions(Array.isArray(result.promotions) ? result.promotions : []);
    } catch (error: any) {
      toast({ title: "Could not load promotions", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { void loadPromotions(); }, [loadPromotions]);

  const filteredPromotions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return promotions.filter(promotion =>
      (!query || promotion.name.toLowerCase().includes(query) || String(promotion.id).includes(query))
      && String(promotion.redemption_type ?? "").toUpperCase() === "AUTOMATIC",
    );
  }, [promotions, search]);

  const savePromotion = async () => {
    const amount = Number(draft.amount);
    const minimumSpend = draft.minimumSpend.trim() ? Number(draft.minimumSpend) : undefined;
    if (!draft.name.trim()) return toast({ title: "Add a promotion name", variant: "destructive" });
    if (!Number.isFinite(amount) || amount <= 0 || (draft.discountType === "percentage" && amount > 100)) {
      return toast({ title: "Check the discount amount", description: "Enter a positive amount; percentage discounts cannot exceed 100%.", variant: "destructive" });
    }
    if (minimumSpend !== undefined && (!Number.isFinite(minimumSpend) || minimumSpend <= 0)) {
      return toast({ title: "Check the minimum spend", description: "Minimum spend must be greater than zero.", variant: "destructive" });
    }
    if (draft.startDate && draft.endDate && new Date(draft.endDate) <= new Date(draft.startDate)) {
      return toast({ title: "Check the schedule", description: "The end date must be later than the start date.", variant: "destructive" });
    }
    setSaving(true);
    try {
      await apiRequest("/api/tools/promo-automation", {
        method: "POST",
        body: JSON.stringify({
          name: draft.name.trim(),
          discountType: draft.discountType,
          amount,
          minimumSpend,
          startDate: draft.startDate ? new Date(draft.startDate).toISOString() : undefined,
          endDate: draft.endDate ? new Date(draft.endDate).toISOString() : undefined,
        }),
      });
      toast({ title: "Automatic promotion created in BigCommerce" });
      setDialogOpen(false);
      setDraft(blankDraft);
      await loadPromotions(true);
    } catch (error: any) {
      toast({ title: "Promotion was not created", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><RefreshCw className="h-5 w-5 animate-spin text-slate-400" /></div>;
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><Tag className="h-5 w-5" /></div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Promo Automation</h1>
            <p className="text-sm text-slate-500">View and create automatic BigCommerce promotions.</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => void loadPromotions(true)} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </Button>
        {canManage && <Button onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" /> Create promotion</Button>}
      </header>

      <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search promotion name or ID" />
        </div>
        <Badge variant="outline">{filteredPromotions.length} automatic promotions</Badge>
      </div>

      {filteredPromotions.length === 0 ? (
        <section className="rounded-xl border border-dashed bg-white px-6 py-14 text-center">
          <Tag className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="font-medium text-slate-700">{promotions.length ? "No automatic promotions match your search" : "No automatic promotions found"}</p>
          <p className="mt-1 text-sm text-slate-500">This list is loaded directly from BigCommerce.</p>
        </section>
      ) : (
        <section className="grid gap-3 md:grid-cols-2">
          {filteredPromotions.map(promotion => (
            <article key={promotion.id} className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{promotion.name}</p>
                  <p className="mt-1 text-xs text-slate-500">BigCommerce ID · {promotion.id}</p>
                </div>
                <Badge variant={String(promotion.status).toUpperCase() === "ENABLED" ? "default" : "secondary"}>
                  {promotion.status || "Unknown status"}
                </Badge>
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                <CalendarClock className="h-3.5 w-3.5" />
                Starts {formatDate(promotion.start_date)} · Ends {formatDate(promotion.end_date, "No end date")}
              </div>
            </article>
          ))}
        </section>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>Create automatic promotion</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500">Creates an enabled, automatic cart discount directly in BigCommerce.</p>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="promo-name">Promotion name</Label>
              <Input id="promo-name" maxLength={100} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Weekend cart discount" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="promo-discount-type">Discount type</Label>
                <select id="promo-discount-type" className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={draft.discountType} onChange={e => setDraft({ ...draft, discountType: e.target.value as Draft["discountType"] })}>
                  <option value="percentage">Percentage off cart</option>
                  <option value="fixed">Fixed amount off cart</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="promo-amount">Discount {draft.discountType === "percentage" ? "(%)" : "(store currency)"}</Label>
                <Input id="promo-amount" type="number" min="0.01" max={draft.discountType === "percentage" ? 100 : undefined} step="0.01" value={draft.amount} onChange={e => setDraft({ ...draft, amount: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="promo-min-spend">Minimum cart spend <span className="text-slate-400">(optional)</span></Label>
              <Input id="promo-min-spend" type="number" min="0.01" step="0.01" value={draft.minimumSpend} onChange={e => setDraft({ ...draft, minimumSpend: e.target.value })} placeholder="No minimum" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="promo-start">Start date <span className="text-slate-400">(optional)</span></Label><Input id="promo-start" type="datetime-local" value={draft.startDate} onChange={e => setDraft({ ...draft, startDate: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="promo-end">End date <span className="text-slate-400">(optional)</span></Label><Input id="promo-end" type="datetime-local" value={draft.endDate} onChange={e => setDraft({ ...draft, endDate: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void savePromotion()} disabled={saving}>{saving && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}Create in BigCommerce</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
