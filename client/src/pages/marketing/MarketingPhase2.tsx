import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, BarChart3, CheckCircle2, Clock3, FileText, Mail, Pause, Pencil, Play, Plus, RotateCcw, Save, Send, Sparkles, Workflow, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useLocation } from "wouter";
import RichTextEditor from "@/components/editor/RichTextEditor";
import {
  PageShell,
} from "@/pages/marketing/Marketing";
import {
  archiveMarketingTemplate, createMarketingAutomation, createMarketingTemplate,
  getMarketingAnalytics, getMarketingAutomation, getMarketingAutomations,
  getMarketingTemplates, updateMarketingAutomation, updateMarketingAutomationStatus,
  updateMarketingTemplate,
} from "@/lib/api";

const unavailable = "Not available";

export function MarketingAnalytics() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const { data, isLoading } = useQuery<any>({
    queryKey: ["marketing-analytics", dateFrom, dateTo],
    queryFn: () => getMarketingAnalytics({ dateFrom, dateTo }),
  });
  const values = [
    ["SMTP accepted", data?.sent ?? 0, "Messages accepted by the configured SMTP server"],
    ["Send failures", data?.failed ?? 0, "Recipient attempts that exhausted or hit an error"],
    ["Suppressed", data?.suppressed ?? 0, "Excluded before sending"],
    ["Unsubscribed", data?.unsubscribed ?? 0, "Recorded unsubscribe events"],
  ];
  return <PageShell title="Analytics" subtitle="Real campaign activity from your configured SMTP connection">
    <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4 shadow-sm">
      <label className="text-xs font-medium text-slate-600">From<input type="date" className="mt-1 block h-9 rounded-md border px-2 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></label>
      <label className="text-xs font-medium text-slate-600">To<input type="date" className="mt-1 block h-9 rounded-md border px-2 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} /></label>
      <Button variant="outline" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }}>Reset range</Button>
    </div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {values.map(([label, value, caption]) => <div key={String(label)} className="rounded-xl border bg-white p-4 shadow-sm"><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{isLoading ? "…" : value}</p><p className="mt-1 text-xs text-slate-400">{caption}</p></div>)}
    </div>
    <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-900"><div className="flex gap-3"><BarChart3 className="h-5 w-5 shrink-0 text-amber-600" /><div><p className="font-semibold">Provider limitation</p><p className="mt-1 text-amber-800/80">Delivery, open, click, and unsubscribe-rate metrics are {unavailable.toLowerCase()} because SMTP responses do not include those events. The dashboard only reports recorded send, failure, suppression, and unsubscribe activity.</p></div></div></div>
  </PageShell>;
}

function TemplateForm({ existing, onDone }: { existing?: any; onDone: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState(existing?.name ?? "");
  const [category, setCategory] = useState(existing?.category ?? "general");
  const [subject, setSubject] = useState(existing?.subject_template ?? "");
  const [body, setBody] = useState(existing?.body ?? "<p></p>");
  const save = useMutation({
    mutationFn: () => existing ? updateMarketingTemplate(existing.id, { name, category, subject_template: subject, body, is_active: true }) : createMarketingTemplate({ name, category, subject_template: subject, body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketing-templates"] }); toast({ title: existing ? "Template updated" : "Template created" }); onDone(); },
    onError: (e: any) => toast({ title: "Unable to save template", description: e.message, variant: "destructive" }),
  });
  return <div className="rounded-xl border bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold text-slate-900">{existing ? "Edit template" : "New marketing template"}</h2><p className="text-xs text-slate-500">Use {"{{first_name}}"}, {"{{company}}"}, {"{{lifetime_revenue}}"}, and {"{{unsubscribe_url}}"} merge fields.</p></div><Button variant="ghost" size="sm" onClick={onDone}><X className="h-4 w-4" /></Button></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700">Name<Input className="mt-1.5" value={name} onChange={e => setName(e.target.value)} /></label><label className="text-sm font-medium text-slate-700">Category<select className="mt-1.5 h-10 w-full rounded-md border bg-white px-3 text-sm" value={category} onChange={e => setCategory(e.target.value)}><option value="general">General</option><option value="promotion">Promotion</option><option value="newsletter">Newsletter</option><option value="reactivation">Reactivation</option><option value="welcome">Welcome</option></select></label></div><label className="mt-4 block text-sm font-medium text-slate-700">Subject template<Input className="mt-1.5" value={subject} onChange={e => setSubject(e.target.value)} /></label><div className="mt-4"><Label>Body</Label><div className="mt-1.5"><RichTextEditor value={body} onChange={setBody} minHeight={240} /></div></div><div className="mt-4 flex justify-end"><Button onClick={() => save.mutate()} disabled={save.isPending || !name.trim() || !subject.trim()}><Save className="mr-2 h-4 w-4" />{save.isPending ? "Saving…" : "Save template"}</Button></div></div>;
}

export function MarketingTemplates() {
  const { hasPermission } = usePermissions();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<any | null | false>(false);
  const { data: templates = [], isLoading } = useQuery<any[]>({ queryKey: ["marketing-templates"], queryFn: getMarketingTemplates });
  const archive = useMutation({ mutationFn: (id: number) => archiveMarketingTemplate(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["marketing-templates"] }), onError: (e: any) => toast({ title: "Unable to archive template", description: e.message, variant: "destructive" }) });
  return <PageShell title="Templates" subtitle="Reusable marketing messages, separate from transactional templates" action={hasPermission("marketing", "create") ? <Button onClick={() => setEditing(null)}><Plus className="mr-2 h-4 w-4" /> New template</Button> : undefined}>
    {editing !== false && <TemplateForm existing={editing || undefined} onDone={() => setEditing(false)} />}
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm"><div className="border-b px-5 py-4"><h2 className="font-semibold text-slate-900">Marketing templates</h2><p className="text-xs text-slate-500">{templates.length} active template{templates.length === 1 ? "" : "s"}</p></div>{isLoading ? <div className="p-10 text-center text-sm text-slate-400">Loading templates…</div> : templates.length ? <div className="divide-y">{templates.map((t: any) => <div key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-4"><span className="rounded-lg bg-blue-50 p-2 text-blue-600"><Mail className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{t.name}</p><p className="text-xs text-slate-400">{t.category} · {t.subject_template}</p></div>{hasPermission("marketing", "edit") && <Button variant="outline" size="sm" onClick={() => setEditing(t)}><Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit</Button>}{hasPermission("marketing", "manage_templates") && <Button variant="ghost" size="sm" className="text-slate-500" onClick={() => archive.mutate(t.id)}><Archive className="mr-1.5 h-3.5 w-3.5" /> Archive</Button>}</div>)}</div> : <div className="p-12 text-center text-sm text-slate-400"><FileText className="mx-auto mb-3 h-8 w-8 text-slate-300" />No marketing templates yet.</div>}</section>
  </PageShell>;
}

const defaultStep = { action_type: "send_email", action_config: { template_id: "" } };

export function MarketingAutomations() {
  const { hasPermission } = usePermissions();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState("customer_signup_completed");
  const [frequency, setFrequency] = useState("0");
  const [steps, setSteps] = useState<any[]>([defaultStep]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: automations = [], isLoading } = useQuery<any[]>({ queryKey: ["marketing-automations"], queryFn: getMarketingAutomations });
  const { data: selected } = useQuery<any>({ queryKey: ["marketing-automation", selectedId], queryFn: () => getMarketingAutomation(selectedId!), enabled: !!selectedId });
  const create = useMutation({ mutationFn: () => createMarketingAutomation({ name, description, trigger_type: trigger, frequency_days: Number(frequency) || 0, steps }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketing-automations"] }); setFormOpen(false); setName(""); setDescription(""); setSteps([defaultStep]); toast({ title: "Automation saved as draft" }); }, onError: (e: any) => toast({ title: "Unable to save automation", description: e.message, variant: "destructive" }) });
  const setStatus = useMutation({ mutationFn: ({ id, status }: { id: number; status: string }) => updateMarketingAutomationStatus(id, status), onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketing-automations"] }); qc.invalidateQueries({ queryKey: ["marketing-automation", selectedId] }); } });
  const addStep = () => setSteps(old => [...old, { action_type: "wait", action_config: { days: 1 } }]);
  return <PageShell title="Automations" subtitle="Rule-based customer journeys using verified CRM/signup events" action={hasPermission("marketing", "manage_automations") ? <Button onClick={() => setFormOpen(v => !v)}><Plus className="mr-2 h-4 w-4" /> New automation</Button> : undefined}>
    {formOpen && <section className="rounded-xl border bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold text-slate-900">New automation</h2><p className="text-xs text-slate-500">Only supported events and actions can be activated.</p></div><Button variant="ghost" size="sm" onClick={() => setFormOpen(false)}><X className="h-4 w-4" /></Button></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700">Name<Input className="mt-1.5" value={name} onChange={e => setName(e.target.value)} placeholder="New customer welcome" /></label><label className="text-sm font-medium text-slate-700">Trigger<select className="mt-1.5 h-10 w-full rounded-md border bg-white px-3 text-sm" value={trigger} onChange={e => setTrigger(e.target.value)}><option value="customer_signup_completed">Customer signup completed</option><option value="customer_created">Customer created</option><option value="audience_membership">Audience membership</option></select></label></div><label className="mt-4 block text-sm font-medium text-slate-700">Description<Textarea className="mt-1.5" value={description} onChange={e => setDescription(e.target.value)} /></label><label className="mt-4 block text-sm font-medium text-slate-700">Minimum days between runs<Input type="number" min="0" className="mt-1.5 max-w-xs" value={frequency} onChange={e => setFrequency(e.target.value)} /></label><div className="mt-4 space-y-2"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-800">Steps</h3><Button type="button" variant="outline" size="sm" onClick={addStep}>Add step</Button></div>{steps.map((step, index) => <div key={index} className="flex items-center gap-2 rounded-lg border bg-slate-50 p-3"><span className="w-6 text-xs font-bold text-slate-400">{index + 1}</span><select className="h-9 flex-1 rounded-md border bg-white px-2 text-sm" value={step.action_type} onChange={e => setSteps(old => old.map((x, i) => i === index ? { ...x, action_type: e.target.value } : x))}><option value="send_email">Send marketing email</option><option value="wait">Wait</option><option value="create_note">Create CRM note</option><option value="notify_rep">Notify assigned rep</option></select>{step.action_type === "wait" && <Input type="number" min="1" className="w-20 bg-white" value={step.action_config.days} onChange={e => setSteps(old => old.map((x, i) => i === index ? { ...x, action_config: { days: Number(e.target.value) } } : x))} />}</div>)}</div><div className="mt-4 flex justify-end"><Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim()}><Save className="mr-2 h-4 w-4" /> Save draft</Button></div></section>}
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]"><section className="overflow-hidden rounded-xl border bg-white shadow-sm"><div className="border-b px-5 py-4"><h2 className="font-semibold text-slate-900">Automation rules</h2></div>{isLoading ? <div className="p-10 text-center text-sm text-slate-400">Loading automations…</div> : automations.length ? <div className="divide-y">{automations.map((a: any) => <button key={a.id} onClick={() => setSelectedId(a.id)} className={`flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 ${selectedId === a.id ? "bg-blue-50/50" : ""}`}><span className="rounded-lg bg-violet-50 p-2 text-violet-600"><Workflow className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{a.name}</span><span className="block text-xs text-slate-400">{a.trigger_type.replaceAll("_", " ")} · {a.step_count} step{a.step_count === 1 ? "" : "s"}</span></span><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${a.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{a.status}</span></button>)}</div> : <div className="p-12 text-center text-sm text-slate-400"><Sparkles className="mx-auto mb-3 h-8 w-8 text-slate-300" />No automations yet.</div>}</section><section className="rounded-xl border bg-white p-5 shadow-sm">{selected ? <><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-900">{selected.name}</h2><p className="mt-1 text-xs text-slate-500">{selected.description || "No description"}</p></div>{hasPermission("marketing", "manage_automations") && <div className="flex gap-2">{selected.status === "active" ? <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: selected.id, status: "paused" })}><Pause className="mr-1 h-3.5 w-3.5" /> Pause</Button> : <Button size="sm" onClick={() => setStatus.mutate({ id: selected.id, status: "active" })}><Play className="mr-1 h-3.5 w-3.5" /> Activate</Button>}</div>}</div><div className="mt-5 space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Execution history</p>{(selected.executions || []).length ? selected.executions.map((e: any) => <div key={e.id} className="flex items-center gap-2 rounded-lg border p-3 text-xs"><Clock3 className="h-4 w-4 text-slate-400" /><span className="flex-1">{e.customer?.company || [e.customer?.first_name, e.customer?.last_name].filter(Boolean).join(" ") || "Customer"}</span><span className="text-slate-400">{e.status}</span></div>) : <p className="text-sm text-slate-400">No executions recorded yet.</p>}</div></> : <div className="flex h-full min-h-64 flex-col items-center justify-center text-center text-sm text-slate-400"><Workflow className="mb-3 h-8 w-8 text-slate-300" />Select an automation to view its execution history.</div>}</section></div>
  </PageShell>;
}