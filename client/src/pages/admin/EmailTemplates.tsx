import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Save, RotateCcw, ChevronDown, ChevronRight } from "lucide-react";

const DEFAULT_STORE_CREDIT_BODY = `Hello {customerName},

Thank you for your most recent order with Mid Atlantic Distribution.  We apologize for any inconvenience, but due to an inventory error, there is an item that we are unable to fulfill in your order.  This item has been removed from your order and store credit has been issued to your account.

Missing Items: {missingItems}

Store Credit Applied: {creditAmount}


You will be able to apply this credit at the point of checkout on future orders.  Please feel free to reach back out with any questions or concerns. Again, we thank you for your patience and understanding while we worked to resolve this matter as quickly and effectively as possible.
We greatly appreciate your order with MA Distro and look forward to future business.



Thank you,

Mid Atlantic Distribution
1000 Parliament Court, Suite #300
Durham, North Carolina 27703
Office 1(866)818-9598 Ext 0
sales@midatlanticdistribution.com`;

const DEFAULT_TEMPLATES = [
  {
    key: "store_credit",
    name: "Store Credit Notification",
    subject_template: "ORDER #{orderNumber} - Missing Item Store Credit",
    body: DEFAULT_STORE_CREDIT_BODY,
    variables: ["{customerName}", "{orderNumber}", "{missingItems}", "{creditAmount}"],
  },
];

interface EmailTemplate {
  id?: number;
  key: string;
  name: string;
  subject_template: string;
  body: string;
}

function TemplateEditor({ templateKey, defaultName, defaultSubject, defaultBody, variables }: {
  templateKey: string; defaultName: string; defaultSubject: string; defaultBody: string; variables: string[];
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [name, setName] = useState(defaultName);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [dirty, setDirty] = useState(false);

  const { data: saved } = useQuery<EmailTemplate>({
    queryKey: ["email-template", templateKey],
    queryFn: async () => {
      const r = await fetch(`/api/admin/email-templates/${templateKey}`, { headers: getAuthHeaders() });
      if (r.status === 404) return null as any;
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (saved) {
      setName(saved.name);
      setSubject(saved.subject_template);
      setBody(saved.body);
      setDirty(false);
    }
  }, [saved]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/admin/email-templates/${templateKey}`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ name, subject_template: subject, body }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Failed"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-template", templateKey] });
      setDirty(false);
    },
  });

  const reset = () => {
    setName(saved?.name ?? defaultName);
    setSubject(saved?.subject_template ?? defaultSubject);
    setBody(saved?.body ?? defaultBody);
    setDirty(false);
  };

  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2.5">
          <Mail className="h-4 w-4 text-blue-500 shrink-0" />
          <div className="text-left">
            <p className="text-[13px] font-semibold text-slate-800">{name}</p>
            <p className="text-[11px] text-slate-400 font-mono">{templateKey}</p>
          </div>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="border-t px-5 py-4 space-y-4">
          {/* Template variables hint */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            <p className="text-[11px] text-blue-700 font-semibold mb-1">Available Variables</p>
            <div className="flex flex-wrap gap-1.5">
              {variables.map(v => (
                <span key={v} className="inline-flex items-center px-1.5 py-0.5 bg-blue-100 text-blue-800 text-[11px] font-mono rounded">{v}</span>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Template Name</label>
            <Input value={name} onChange={e => { setName(e.target.value); setDirty(true); }} className="text-sm max-w-sm" />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Subject Template</label>
            <Input value={subject} onChange={e => { setSubject(e.target.value); setDirty(true); }} className="text-sm" />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Body</label>
            <Textarea
              value={body}
              onChange={e => { setBody(e.target.value); setDirty(true); }}
              rows={18}
              className="text-sm font-mono resize-y"
            />
          </div>

          {saveMutation.isError && (
            <p className="text-sm text-red-600">{(saveMutation.error as Error).message}</p>
          )}

          <div className="flex items-center gap-2 justify-end pt-1">
            <Button size="sm" variant="outline" onClick={reset} disabled={!dirty || saveMutation.isPending} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </Button>
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!dirty || saveMutation.isPending} className="gap-1.5">
              <Save className="h-3.5 w-3.5" />
              {saveMutation.isPending ? "Saving…" : "Save Template"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EmailTemplates() {
  return (
    <div className="flex-1 overflow-auto bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Mail className="h-5 w-5 text-blue-600" />
          <div>
            <h1 className="text-lg font-bold text-slate-900">Email Templates</h1>
            <p className="text-[12px] text-slate-500 leading-tight">
              Configure email templates used by automated workflows
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-6 space-y-4">
        {DEFAULT_TEMPLATES.map(t => (
          <TemplateEditor
            key={t.key}
            templateKey={t.key}
            defaultName={t.name}
            defaultSubject={t.subject_template}
            defaultBody={t.body}
            variables={t.variables}
          />
        ))}
      </div>
    </div>
  );
}
