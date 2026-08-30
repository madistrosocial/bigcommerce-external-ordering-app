import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import {
  Activity, ArrowLeft, BarChart3, CalendarClock, Check, ChevronRight, Clock3,
  FileText, Filter, Mail, Megaphone, MoreHorizontal, Plus, RefreshCw, Search,
  Send, Target, Trash2, Users, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import RichTextEditor from "@/components/editor/RichTextEditor";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import {
  createMarketingAudience, createMarketingCampaign, deleteMarketingAudience,
  deleteMarketingCampaign, getMarketingAudience, getMarketingAudienceCustomers,
  getMarketingAudiences, getMarketingCampaign, getMarketingCampaigns,
  getMarketingDashboard, updateMarketingAudience, updateMarketingCampaign,
  updateMarketingCampaignStatus, sendMarketingTest, sendMarketingCampaign,
  pauseMarketingCampaign, duplicateMarketingCampaign, getMarketingRecipients, scheduleMarketingCampaign,
} from "@/lib/api";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", ready: "Ready", scheduled: "Scheduled", sending: "Sending",
  sent: "Sent", paused: "Paused", failed: "Failed",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600", ready: "bg-blue-100 text-blue-700",
  scheduled: "bg-violet-100 text-violet-700", sending: "bg-amber-100 text-amber-700",
  sent: "bg-emerald-100 text-emerald-700", paused: "bg-orange-100 text-orange-700",
  failed: "bg-red-100 text-red-700",
};

export function PageShell({ children, title, subtitle, action }: { children: React.ReactNode; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="min-h-full bg-slate-50">
      <div className="border-b bg-white px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-start justify-between gap-4">
          <div><p className="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-600">Marketing</p><h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>{subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}</div>
          {action}
        </div>
      </div>
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6">{children}</main>
    </div>
  );
}

function StatCard({ label, value, caption, icon: Icon, tone = "blue" }: { label: string; value: string | number; caption?: string; icon: React.ElementType; tone?: string }) {
  return <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">{label}</span><span className={`rounded-lg p-2 ${tone === "violet" ? "bg-violet-50 text-violet-600" : tone === "green" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}><Icon className="h-4 w-4" /></span></div><p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>{caption && <p className="mt-1 text-xs text-slate-400">{caption}</p>}</div>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLORS[status] || STATUS_COLORS.draft}`}>{STATUS_LABELS[status] || status}</span>;
}

export function MarketingDashboard() {
  const { data, isLoading, refetch } = useQuery<any>({ queryKey: ["marketing-dashboard"], queryFn: getMarketingDashboard });
  const [, setLocation] = useLocation();
  if (isLoading) return <PageShell title="Marketing Dashboard" subtitle="Plan and measure customer communications"><div className="py-16 text-center text-sm text-slate-400">Loading marketing data…</div></PageShell>;
  const d = data || {};
  return <PageShell title="Marketing Dashboard" subtitle="Plan and measure customer communications" action={<Button onClick={() => setLocation("/marketing/campaigns/new")}><Plus className="mr-2 h-4 w-4" /> New campaign</Button>}>
    <div className="flex items-center justify-between"><div><h2 className="text-base font-semibold text-slate-900">Performance snapshot</h2><p className="text-sm text-slate-500">Only recorded campaign activity is shown here.</p></div><Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh</Button></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Total campaigns" value={d.totalCampaigns ?? 0} caption={`${d.draftCampaigns ?? 0} drafts`} icon={Megaphone} />
      <StatCard label="Scheduled" value={d.scheduledCampaigns ?? 0} caption={`${d.activeCampaigns ?? 0} active`} icon={CalendarClock} tone="violet" />
      <StatCard label="Recipients reached" value={d.sentRecipients ?? 0} caption={`${d.totalRecipients ?? 0} planned`} icon={Send} tone="green" />
      <StatCard label="Open rate" value="Not available" caption="SMTP does not provide open tracking" icon={BarChart3} />
    </div>
    <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
      <section className="rounded-xl border bg-white shadow-sm"><div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-semibold text-slate-900">Recent campaigns</h2><p className="text-xs text-slate-500">Latest changes across your campaigns</p></div><Button variant="ghost" size="sm" onClick={() => setLocation("/marketing/campaigns")}>View all <ChevronRight className="ml-1 h-4 w-4" /></Button></div><div className="divide-y">{(d.recentCampaigns || []).length ? d.recentCampaigns.map((c: any) => <button key={c.id} onClick={() => setLocation(`/marketing/campaigns/${c.id}`)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50"><span className="rounded-lg bg-blue-50 p-2 text-blue-600"><Mail className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{c.name}</span><span className="block text-xs text-slate-400">{c.creator_name || "Unknown creator"} · {c.updated_at ? new Date(c.updated_at).toLocaleDateString() : ""}</span></span><StatusBadge status={c.status} /></button>) : <EmptyState icon={Megaphone} text="No campaigns yet" action="Create your first campaign" onClick={() => setLocation("/marketing/campaigns/new")} />}</div></section>
      <section className="rounded-xl border bg-white shadow-sm"><div className="border-b px-5 py-4"><h2 className="font-semibold text-slate-900">Activity</h2><p className="text-xs text-slate-500">A real audit trail of marketing changes</p></div><div className="divide-y">{(d.recentActivity || []).length ? d.recentActivity.map((a: any) => <div key={a.id} className="flex gap-3 px-5 py-4"><span className="mt-0.5 rounded-full bg-slate-100 p-1.5 text-slate-500"><Activity className="h-3.5 w-3.5" /></span><div className="min-w-0"><p className="text-sm text-slate-700"><strong>{a.user_name || "System"}</strong> {a.action.replaceAll("_", " ")} <strong>{a.campaign_name || "campaign"}</strong></p><p className="mt-1 text-xs text-slate-400">{a.created_at ? new Date(a.created_at).toLocaleString() : ""}</p></div></div>) : <EmptyState icon={Clock3} text="No activity recorded" />}</div></section>
    </div>
     <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900"><div className="flex gap-3"><Target className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" /><div><p className="font-semibold">SMTP measurement boundary</p><p className="mt-1 text-blue-800/80">Sent and failed counts are recorded from SMTP responses. Delivery, opens, and clicks are shown as Not Available because this SMTP connection does not provide those events.</p></div></div></div>
  </PageShell>;
}

function EmptyState({ icon: Icon, text, action, onClick }: { icon: React.ElementType; text: string; action?: string; onClick?: () => void }) {
  return <div className="flex flex-col items-center justify-center px-5 py-12 text-center"><Icon className="mb-3 h-9 w-9 text-slate-300" /><p className="text-sm text-slate-500">{text}</p>{action && <Button variant="link" className="mt-1" onClick={onClick}>{action}</Button>}</div>;
}

export function MarketingCampaigns() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const { data, isLoading } = useQuery<any>({ queryKey: ["marketing-campaigns", search, status], queryFn: () => getMarketingCampaigns({ search, status }) });
  return <PageShell title="Campaigns" subtitle="Create, review, and manage customer campaigns" action={<Button onClick={() => setLocation("/marketing/campaigns/new")}><Plus className="mr-2 h-4 w-4" /> New campaign</Button>}>
    <div className="flex flex-col gap-3 rounded-xl border bg-white p-3 shadow-sm sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder="Search campaigns…" value={search} onChange={e => setSearch(e.target.value)} /></div><select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700" value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option>{Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm"><div className="hidden grid-cols-[1fr_130px_150px_110px_36px] gap-4 border-b bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 md:grid"><span>Campaign</span><span>Audience</span><span>Updated</span><span>Status</span><span /></div>{isLoading ? <div className="py-16 text-center text-sm text-slate-400">Loading campaigns…</div> : data?.campaigns?.length ? data.campaigns.map((c: any) => <button key={c.id} onClick={() => setLocation(`/marketing/campaigns/${c.id}`)} className="grid w-full gap-2 border-b px-4 py-4 text-left last:border-0 hover:bg-slate-50 md:grid-cols-[1fr_130px_150px_110px_36px] md:items-center md:gap-4 md:px-5"><span className="min-w-0"><span className="flex items-center gap-2 truncate text-sm font-semibold text-slate-800"><Mail className="h-4 w-4 shrink-0 text-blue-500" />{c.name}</span><span className="mt-1 block truncate pl-6 text-xs text-slate-400">{c.subject_line || "No subject line"}</span></span><span className="text-xs text-slate-500 md:truncate">{c.audience_name || (c.audience_type === "all_eligible" ? "All eligible customers" : c.audience_type.replaceAll("_", " "))}</span><span className="text-xs text-slate-500">{c.updated_at ? new Date(c.updated_at).toLocaleDateString() : "—"}</span><span><StatusBadge status={c.status} /></span><ChevronRight className="hidden h-4 w-4 text-slate-300 md:block" /></button>) : <EmptyState icon={Megaphone} text={search ? "No campaigns match your search" : "No campaigns yet"} action={!search ? "Create your first campaign" : undefined} onClick={() => setLocation("/marketing/campaigns/new")} />}</div>
  </PageShell>;
}

function CampaignDetail({ id }: { id: number }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const qc = useQueryClient();
  const { data: campaign, isLoading } = useQuery<any>({ queryKey: ["marketing-campaign", id], queryFn: () => getMarketingCampaign(id) });
  const { data: recipientData } = useQuery<any>({ queryKey: ["marketing-recipients", id], queryFn: () => getMarketingRecipients(id), enabled: !!id, refetchInterval: campaign?.status === "sending" || campaign?.status === "queued" ? 5000 : false });
  const statusMutation = useMutation({ mutationFn: (status: string) => updateMarketingCampaignStatus(id, status), onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketing-campaign", id] }); qc.invalidateQueries({ queryKey: ["marketing-dashboard"] }); }, onError: (e: any) => toast({ title: "Unable to update status", description: e.message, variant: "destructive" }) });
  const deleteMutation = useMutation({ mutationFn: () => deleteMarketingCampaign(id), onSuccess: () => { setLocation("/marketing/campaigns"); qc.invalidateQueries({ queryKey: ["marketing-campaigns"] }); } });
  const testSend = async () => {
    const email = window.prompt("Send a test email to:");
    if (!email) return;
    try { await sendMarketingTest(id, email); toast({ title: "Test email accepted by SMTP" }); qc.invalidateQueries({ queryKey: ["marketing-campaign", id] }); }
    catch (e: any) { toast({ title: "Test send failed", description: e.message, variant: "destructive" }); }
  };
  const sendNow = async () => {
    if (!window.confirm("Send this campaign to all currently eligible recipients? This cannot be undone.")) return;
    try { await sendMarketingCampaign(id); toast({ title: "Campaign queued", description: "The server will send it in the background." }); qc.invalidateQueries({ queryKey: ["marketing-campaign", id] }); qc.invalidateQueries({ queryKey: ["marketing-dashboard"] }); }
    catch (e: any) { toast({ title: "Unable to queue campaign", description: e.message, variant: "destructive" }); }
  };
  if (isLoading) return <PageShell title="Campaign"><div className="py-16 text-center text-sm text-slate-400">Loading campaign…</div></PageShell>;
  if (!campaign) return <PageShell title="Campaign"><EmptyState icon={X} text="Campaign not found" /></PageShell>;
  const next = campaign.status === "draft" ? "ready" : campaign.status === "ready" ? "scheduled" : campaign.status === "scheduled" ? "paused" : null;
  return <PageShell title={campaign.name} subtitle={campaign.internal_description || "Campaign details"} action={<div className="flex gap-2"><Button variant="outline" onClick={() => setLocation("/marketing/campaigns")}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>{hasPermission("marketing", "edit") && campaign.status !== "sent" && <Button onClick={() => setLocation(`/marketing/campaigns/${id}/edit`)}>Edit campaign</Button>}</div>}>
    <div className="flex flex-wrap items-center gap-3"><StatusBadge status={campaign.status} /><span className="text-sm text-slate-500">{campaign.subject_line || "No subject line"}</span><span className="ml-auto text-xs text-slate-400">Created by {campaign.creator_name || "Unknown"}</span></div>
     <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]"><div className="space-y-5">
       <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-4 font-semibold text-slate-900">Audience</h2><div className="flex items-center gap-3 rounded-lg bg-slate-50 p-4"><Users className="h-5 w-5 text-blue-500" /><div><p className="text-sm font-medium text-slate-800">{campaign.audience_name || (campaign.audience_type === "all_eligible" ? "All eligible customers" : campaign.audience_type.replaceAll("_", " "))}</p><p className="text-xs text-slate-500">{campaign.recipient_count ?? campaign.audience_count ?? 0} planned recipients · {campaign.suppressed_count ?? 0} suppressed</p></div></div></section>
      <section className="rounded-xl border bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold text-slate-900">Message preview</h2><span className="text-xs text-slate-400">{campaign.campaign_type}</span></div><div className="rounded-lg border bg-slate-50 p-4"><p className="mb-3 text-sm font-semibold text-slate-800">{campaign.subject_line || "No subject line"}</p><div className="prose prose-sm max-w-none text-slate-600" dangerouslySetInnerHTML={{ __html: campaign.message_content || "<p>No message content yet.</p>" }} /></div></section>
    </div><div className="space-y-5">
       <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-4 font-semibold text-slate-900">Analytics</h2><div className="grid grid-cols-2 gap-3">{[["Planned", campaign.recipient_count ?? 0], ["Sent", campaign.sent_count ?? 0], ["Failed", campaign.failed_count ?? 0], ["Suppressed", campaign.suppressed_count ?? 0], ["Delivered", "Not available"], ["Opened", "Not available"], ["Clicked", "Not available"]].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-slate-800">{value}</p></div>)}</div><p className="mt-4 text-xs text-slate-400">SMTP confirms acceptance or failure only; delivery, open, and click events are not available.</p></section>
       <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-3 font-semibold text-slate-900">Recipients</h2><div className="space-y-2">{(recipientData?.rows || []).slice(0, 20).map((r: any) => <div key={r.id} className="flex items-center gap-2 rounded-lg border p-2.5 text-xs"><span className="min-w-0 flex-1 truncate">{r.customer?.company || [r.customer?.first_name, r.customer?.last_name].filter(Boolean).join(" ") || r.email}</span><span className="text-slate-400 truncate max-w-[160px]">{r.email}</span><StatusBadge status={r.status} /></div>)}{!recipientData?.rows?.length && <p className="text-sm text-slate-400">Recipients are prepared when the campaign starts.</p>}</div></section>
      <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-3 font-semibold text-slate-900">Activity</h2><div className="space-y-3">{(campaign.activity || []).length ? campaign.activity.map((a: any) => <div key={a.id} className="flex gap-2 text-sm"><Activity className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><span className="text-slate-600">{a.action.replaceAll("_", " ")} <span className="text-xs text-slate-400">· {a.user_name || "System"} · {new Date(a.created_at).toLocaleString()}</span></span></div>) : <p className="text-sm text-slate-400">No activity yet.</p>}</div></section>
       {hasPermission("marketing", "send") && <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-3 text-sm font-semibold text-slate-900">Workflow</h2><div className="flex flex-wrap gap-2">{next && <Button size="sm" onClick={() => statusMutation.mutate(next)} disabled={statusMutation.isPending}>{next === "ready" ? "Mark ready" : next === "scheduled" ? "Schedule campaign" : "Pause campaign"}</Button>}{["ready", "failed", "paused"].includes(campaign.status) && <Button size="sm" onClick={sendNow}><Send className="mr-1.5 h-4 w-4" /> Send now</Button>}{["scheduled", "queued", "sending"].includes(campaign.status) && <Button size="sm" variant="outline" onClick={async () => { try { await pauseMarketingCampaign(id); qc.invalidateQueries({ queryKey: ["marketing-campaign", id] }); } catch (e: any) { toast({ title: "Unable to pause", description: e.message, variant: "destructive" }); } }}>Pause</Button>}<Button size="sm" variant="outline" onClick={testSend}>Test email</Button><Button size="sm" variant="outline" onClick={async () => { const copy = await duplicateMarketingCampaign(id); toast({ title: "Campaign duplicated" }); setLocation(`/marketing/campaigns/${copy.id}/edit`); }}>Duplicate</Button>{hasPermission("marketing", "delete") && campaign.status !== "sent" && <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => { if (window.confirm("Delete this campaign?")) deleteMutation.mutate(); }}><Trash2 className="mr-1 h-4 w-4" /> Delete</Button>}</div><p className="mt-3 text-xs text-slate-400">Sending runs on the server and respects current CRM preferences and suppressions.</p></section>}
    </div></div>
  </PageShell>;
}

function CampaignEditor({ id }: { id?: number }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const editing = Boolean(id);
  const [form, setForm] = useState<any>({ name: "", internal_description: "", subject_line: "", preview_text: "", message_content: "<p></p>", audience_type: "all_eligible", audience_config: {}, audience_id: null, scheduled_at: "" });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const { data: existing } = useQuery<any>({ queryKey: ["marketing-campaign", id], queryFn: () => getMarketingCampaign(id!), enabled: editing });
  const { data: audiences = [] } = useQuery<any[]>({ queryKey: ["marketing-audiences"], queryFn: getMarketingAudiences });
  const { data: customers = [] } = useQuery<any[]>({ queryKey: ["marketing-audience-customers"], queryFn: () => getMarketingAudienceCustomers() });
  useEffect(() => { if (existing) { setForm({ ...existing, scheduled_at: existing.scheduled_at ? new Date(existing.scheduled_at).toISOString().slice(0, 16) : "" }); setSelectedIds((existing.recipients || []).map((r: any) => r.id)); } }, [existing]);
  const saveMutation = useMutation({
    mutationFn: (status: string) => {
      const payload = { ...form, status, scheduled_at: form.scheduled_at || null, customer_ids: form.audience_type === "selected_customers" ? selectedIds : undefined };
      return editing ? updateMarketingCampaign(id!, payload) : createMarketingCampaign(payload);
    },
    onSuccess: (campaign: any) => { qc.invalidateQueries({ queryKey: ["marketing-campaigns"] }); qc.invalidateQueries({ queryKey: ["marketing-dashboard"] }); toast({ title: editing ? "Campaign updated" : "Campaign created" }); setLocation(`/marketing/campaigns/${campaign.id}`); },
    onError: (e: any) => toast({ title: "Unable to save campaign", description: e.message, variant: "destructive" }),
  });
  const scheduleMutation = useMutation({
    mutationFn: async () => {
      if (!form.scheduled_at) throw new Error("Choose a scheduled date first.");
      if (editing) {
        await updateMarketingCampaign(id!, { ...form, scheduled_at: form.scheduled_at, status: existing?.status === "draft" ? "ready" : existing?.status });
        return scheduleMarketingCampaign(id!, form.scheduled_at);
      }
      const created: any = await createMarketingCampaign({ ...form, status: "ready", scheduled_at: null, customer_ids: form.audience_type === "selected_customers" ? selectedIds : undefined });
      return scheduleMarketingCampaign(created.id, form.scheduled_at);
    },
    onSuccess: (campaign: any) => { qc.invalidateQueries({ queryKey: ["marketing-campaigns"] }); qc.invalidateQueries({ queryKey: ["marketing-dashboard"] }); toast({ title: "Campaign scheduled" }); setLocation(`/marketing/campaigns/${campaign.id}`); },
    onError: (e: any) => toast({ title: "Unable to schedule campaign", description: e.message, variant: "destructive" }),
  });
  const set = (key: string, value: any) => setForm((old: any) => ({ ...old, [key]: value }));
  return <PageShell title={editing ? "Edit campaign" : "New campaign"} subtitle="Build, test, schedule, or send this campaign through the configured SMTP connection." action={<Button variant="outline" onClick={() => setLocation(editing ? `/marketing/campaigns/${id}` : "/marketing/campaigns")}><ArrowLeft className="mr-2 h-4 w-4" /> Cancel</Button>}>
    <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]"><div className="space-y-5">
      <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900"><FileText className="h-4 w-4 text-blue-500" /> Campaign details</h2><div className="space-y-4"><label className="block text-sm font-medium text-slate-700">Campaign name<Input className="mt-1.5" value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. September new arrivals" /></label><label className="block text-sm font-medium text-slate-700">Internal description<textarea className="mt-1.5 min-h-20 w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-blue-400" value={form.internal_description} onChange={e => set("internal_description", e.target.value)} placeholder="What is this campaign for?" /></label><label className="block text-sm font-medium text-slate-700">Subject line<Input className="mt-1.5" value={form.subject_line} onChange={e => set("subject_line", e.target.value)} placeholder="Your subject line" /></label><label className="block text-sm font-medium text-slate-700">Preview text<Input className="mt-1.5" value={form.preview_text} onChange={e => set("preview_text", e.target.value)} placeholder="Optional inbox preview" /></label></div></section>
      <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900"><Mail className="h-4 w-4 text-blue-500" /> Message</h2><RichTextEditor value={form.message_content} onChange={value => set("message_content", value)} minHeight={240} /></section>
    </div><div className="space-y-5">
      <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900"><Users className="h-4 w-4 text-blue-500" /> Audience</h2><div className="space-y-3"><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={form.audience_type} onChange={e => set("audience_type", e.target.value)}><option value="all_eligible">All eligible customers</option><option value="customer_group">Customer group</option><option value="selected_customers">Selected customers</option><option value="saved_audience">Saved audience</option></select>{form.audience_type === "customer_group" && <Input placeholder="Customer group name" value={form.audience_config?.customerGroup || ""} onChange={e => set("audience_config", { customerGroup: e.target.value })} />}{form.audience_type === "saved_audience" && <select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={form.audience_id || ""} onChange={e => set("audience_id", Number(e.target.value) || null)}><option value="">Choose a saved audience…</option>{audiences.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.member_count})</option>)}</select>}{form.audience_type === "selected_customers" && <div className="max-h-60 space-y-1 overflow-auto rounded-md border p-2">{customers.map((c: any) => <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-slate-50"><input type="checkbox" checked={selectedIds.includes(c.id)} onChange={e => setSelectedIds(old => e.target.checked ? [...old, c.id] : old.filter(x => x !== c.id))} /><span className="min-w-0 truncate">{c.company || `${c.first_name} ${c.last_name}`}</span><span className="ml-auto text-xs text-slate-400">{c.email}</span></label>)}{!customers.length && <p className="p-3 text-xs text-slate-400">No eligible CRM customers found.</p>}</div>}<p className="text-xs text-slate-400">Customers come from the CRM mirror and must be active customer accounts.</p></div></section>
      <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900"><CalendarClock className="h-4 w-4 text-blue-500" /> Schedule</h2><label className="block text-sm font-medium text-slate-700">Optional scheduled date<input type="datetime-local" className="mt-1.5 h-10 w-full rounded-md border border-slate-200 px-3 text-sm" value={form.scheduled_at || ""} onChange={e => set("scheduled_at", e.target.value)} /></label></section>
       <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => saveMutation.mutate("draft")} disabled={saveMutation.isPending || scheduleMutation.isPending}>Save draft</Button>{hasPermission("marketing", "send") && <>{form.scheduled_at && <Button variant="outline" onClick={() => scheduleMutation.mutate()} disabled={saveMutation.isPending || scheduleMutation.isPending}><CalendarClock className="mr-1.5 h-4 w-4" /> Schedule</Button>}<Button onClick={() => saveMutation.mutate("ready")} disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving…" : "Save & review"}</Button></>}</div>
    </div></div>
  </PageShell>;
}

export function MarketingCampaignRoute() {
  const [match, params] = useRoute("/marketing/campaigns/:id");
  const [editMatch, editParams] = useRoute("/marketing/campaigns/:id/edit");
  if (editMatch && editParams?.id && editParams.id !== "new") return <CampaignEditor id={Number(editParams.id)} />;
  if (match && params?.id) return <CampaignDetail id={Number(params.id)} />;
  return <CampaignEditor />;
}

export function MarketingAudiences() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const { data: audiences = [], isLoading } = useQuery<any[]>({ queryKey: ["marketing-audiences"], queryFn: getMarketingAudiences });
  const { data: customers = [] } = useQuery<any[]>({ queryKey: ["marketing-audience-customers"], queryFn: () => getMarketingAudienceCustomers() });
  const [selected, setSelected] = useState<any | null>(null);
  const [form, setForm] = useState<any>({ name: "", description: "", audience_type: "manual", dynamic_filters: {} });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const save = useMutation({ mutationFn: () => selected?.id ? updateMarketingAudience(selected.id, { ...form, customer_ids: form.audience_type === "manual" ? selectedIds : undefined }) : createMarketingAudience({ ...form, customer_ids: form.audience_type === "manual" ? selectedIds : undefined }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketing-audiences"] }); setSelected(null); setForm({ name: "", description: "", audience_type: "manual", dynamic_filters: {} }); setSelectedIds([]); toast({ title: "Audience saved" }); }, onError: (e: any) => toast({ title: "Unable to save audience", description: e.message, variant: "destructive" }) });
  const remove = useMutation({ mutationFn: (id: number) => deleteMarketingAudience(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["marketing-audiences"] }), onError: (e: any) => toast({ title: "Unable to delete audience", description: e.message, variant: "destructive" }) });
  const startNew = () => { setSelected(null); setForm({ name: "", description: "", audience_type: "manual", dynamic_filters: {} }); setSelectedIds([]); };
  const edit = async (a: any) => { const detail = await getMarketingAudience(a.id); setSelected(detail); setForm({ name: detail.name, description: detail.description, audience_type: detail.audience_type, dynamic_filters: detail.dynamic_filters || {} }); setSelectedIds((detail.members || []).map((m: any) => m.id)); };
  return <PageShell title="Audiences" subtitle="Reusable customer groups built on your existing CRM data" action={hasPermission("marketing", "create") ? <Button onClick={startNew}><Plus className="mr-2 h-4 w-4" /> New audience</Button> : undefined}>
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]"><section className="overflow-hidden rounded-xl border bg-white shadow-sm"><div className="border-b px-5 py-4"><h2 className="font-semibold text-slate-900">Saved audiences</h2><p className="text-xs text-slate-500">{audiences.length} audience{audiences.length === 1 ? "" : "s"}</p></div>{isLoading ? <div className="py-16 text-center text-sm text-slate-400">Loading audiences…</div> : audiences.length ? <div className="divide-y">{audiences.map((a: any) => <div key={a.id} className="flex items-center gap-3 px-5 py-4"><span className="rounded-lg bg-violet-50 p-2 text-violet-600"><Users className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{a.name}</p><p className="text-xs text-slate-400">{a.audience_type === "dynamic" ? "Dynamic" : "Manual"} · {a.member_count} customers</p></div><Button variant="ghost" size="sm" onClick={() => edit(a)}>Edit</Button>{hasPermission("marketing", "delete") && <Button variant="ghost" size="sm" className="text-red-600" onClick={() => { if (window.confirm("Delete this audience?")) remove.mutate(a.id); }}><Trash2 className="h-4 w-4" /></Button>}</div>)}</div> : <EmptyState icon={Users} text="No saved audiences yet" action="Create an audience" onClick={startNew} />}</section>
       <section className="rounded-xl border bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold text-slate-900">{selected ? "Edit audience" : "New audience"}</h2><p className="text-xs text-slate-500">Save a segment for future campaigns.</p></div>{selected && <Button variant="ghost" size="sm" onClick={startNew}><X className="h-4 w-4" /></Button>}</div><div className="space-y-4"><label className="block text-sm font-medium text-slate-700">Name<Input className="mt-1.5" value={form.name} onChange={e => setForm((x: any) => ({ ...x, name: e.target.value }))} placeholder="VIP customers" /></label><label className="block text-sm font-medium text-slate-700">Description<textarea className="mt-1.5 min-h-16 w-full rounded-md border border-slate-200 p-3 text-sm" value={form.description} onChange={e => setForm((x: any) => ({ ...x, description: e.target.value }))} /></label><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={form.audience_type} onChange={e => setForm((x: any) => ({ ...x, audience_type: e.target.value }))}><option value="manual">Manual selection</option><option value="dynamic">Dynamic filters</option></select>{form.audience_type === "dynamic" ? <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2"><label className="text-xs font-medium text-slate-600">Customer group<Input className="mt-1 h-9 bg-white text-sm" value={form.dynamic_filters?.customerGroup || ""} onChange={e => setForm((x: any) => ({ ...x, dynamic_filters: { ...x.dynamic_filters, customerGroup: e.target.value } }))} placeholder="Optional group name" /></label><label className="text-xs font-medium text-slate-600">Customer type<select className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm" value={form.dynamic_filters?.customerType || ""} onChange={e => setForm((x: any) => ({ ...x, dynamic_filters: { ...x.dynamic_filters, customerType: e.target.value } }))}><option value="">Any type</option><option value="Store">Store</option><option value="Distributor">Distributor</option></select></label><label className="text-xs font-medium text-slate-600">Account health<select className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm" value={form.dynamic_filters?.accountHealth || ""} onChange={e => setForm((x: any) => ({ ...x, dynamic_filters: { ...x.dynamic_filters, accountHealth: e.target.value } }))}><option value="">Any health</option><option value="Healthy">Healthy</option><option value="Watch">Watch</option><option value="At Risk">At Risk</option><option value="Lost">Lost</option></select></label><label className="text-xs font-medium text-slate-600">Account status<select className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm" value={form.dynamic_filters?.isActive === false ? "inactive" : form.dynamic_filters?.isActive === true ? "active" : ""} onChange={e => setForm((x: any) => ({ ...x, dynamic_filters: { ...x.dynamic_filters, ...(e.target.value ? { isActive: e.target.value === "active" } : { isActive: undefined }) } }))}><option value="">Any status</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label><label className="text-xs font-medium text-slate-600">State<Input className="mt-1 h-9 bg-white text-sm" value={form.dynamic_filters?.state || ""} onChange={e => setForm((x: any) => ({ ...x, dynamic_filters: { ...x.dynamic_filters, state: e.target.value } }))} placeholder="PA, MD…" /></label><label className="text-xs font-medium text-slate-600">Minimum lifetime revenue<Input type="number" min="0" className="mt-1 h-9 bg-white text-sm" value={form.dynamic_filters?.minRevenue || ""} onChange={e => setForm((x: any) => ({ ...x, dynamic_filters: { ...x.dynamic_filters, minRevenue: e.target.value ? Number(e.target.value) : undefined } }))} /></label><label className="text-xs font-medium text-slate-600">Minimum orders<Input type="number" min="0" className="mt-1 h-9 bg-white text-sm" value={form.dynamic_filters?.minOrders || ""} onChange={e => setForm((x: any) => ({ ...x, dynamic_filters: { ...x.dynamic_filters, minOrders: e.target.value ? Number(e.target.value) : undefined } }))} /></label><label className="text-xs font-medium text-slate-600">Last order before<Input type="date" className="mt-1 h-9 w-full bg-white text-sm" value={form.dynamic_filters?.lastOrderBefore || ""} onChange={e => setForm((x: any) => ({ ...x, dynamic_filters: { ...x.dynamic_filters, lastOrderBefore: e.target.value } }))} /></label><p className="col-span-full text-xs text-slate-400">Dynamic filters recalculate from CRM data and exclude marketing-suppressed customers when used in a campaign.</p></div> : <div className="max-h-56 space-y-1 overflow-auto rounded-md border p-2">{customers.map((c: any) => <label key={c.id} className="flex items-center gap-2 rounded p-2 text-xs hover:bg-slate-50"><input type="checkbox" checked={selectedIds.includes(c.id)} onChange={e => setSelectedIds(old => e.target.checked ? [...old, c.id] : old.filter(x => x !== c.id))} /><span className="min-w-0 flex-1 truncate">{c.company || `${c.first_name} ${c.last_name}`}</span></label>)}</div>}<Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim() || !hasPermission("marketing", selected ? "edit" : "create")}>{save.isPending ? "Saving…" : "Save audience"}</Button></div></section>
    </div>
  </PageShell>;
}
