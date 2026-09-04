import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle, CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound,
  Loader2, LockKeyhole, RotateCcw, Save, ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  clearAdminZohoCredentials,
  getAdminZohoCredentials,
  saveAdminZohoCredentials,
} from "@/lib/api";

type CredentialKey = "apiKey" | "clientId" | "clientSecret" | "refreshToken" | "apiBase";
type CredentialSource = "environment" | "admin" | "default" | "none";
type CredentialField = {
  key: CredentialKey;
  envName: string;
  label: string;
  secret: boolean;
  required: boolean;
  instructions: string;
  configured: boolean;
  source: CredentialSource;
};
type ZohoStatus = {
  fields: CredentialField[];
  configured: boolean;
  apiBase: string;
  authentication: string;
};

function sourceLabel(source: CredentialSource): string {
  if (source === "environment") return "Environment secret";
  if (source === "admin") return "Admin override";
  if (source === "default") return "Default";
  return "Not configured";
}

function sourceClass(source: CredentialSource): string {
  if (source === "environment") return "bg-emerald-100 text-emerald-700 border-0";
  if (source === "admin") return "bg-blue-100 text-blue-700 border-0";
  if (source === "default") return "bg-slate-100 text-slate-600 border-0";
  return "bg-amber-100 text-amber-700 border-0";
}

export default function AdminZohoPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Partial<Record<CredentialKey, string>>>({});
  const [visible, setVisible] = useState<Partial<Record<CredentialKey, boolean>>>({});

  const { data, isLoading, isError } = useQuery<ZohoStatus>({
    queryKey: ["admin-zoho-credentials"],
    queryFn: getAdminZohoCredentials,
  });

  const fields = useMemo(() => data?.fields ?? [], [data]);

  const save = useMutation({
    mutationFn: () => {
      const credentials = Object.fromEntries(
        Object.entries(values).filter(([, value]) => String(value ?? "").trim()),
      ) as Record<string, string>;
      return saveAdminZohoCredentials({ credentials });
    },
    onSuccess: (next: ZohoStatus) => {
      setValues({});
      queryClient.setQueryData(["admin-zoho-credentials"], next);
      queryClient.setQueryData(["marketing-provider-status"], next);
      toast({ title: "Zoho settings saved", description: "Values were encrypted before being stored." });
    },
    onError: (error: any) => toast({
      title: "Unable to save Zoho settings",
      description: error.message,
      variant: "destructive",
    }),
  });

  const clear = useMutation({
    mutationFn: clearAdminZohoCredentials,
    onSuccess: (next: ZohoStatus) => {
      queryClient.setQueryData(["admin-zoho-credentials"], next);
      queryClient.setQueryData(["marketing-provider-status"], next);
      toast({ title: "Admin Zoho overrides cleared", description: "Environment secrets, if present, remain active." });
    },
    onError: (error: any) => toast({
      title: "Unable to clear admin overrides",
      description: error.message,
      variant: "destructive",
    }),
  });

  const updateValue = (key: CredentialKey, value: string) => {
    setValues(previous => ({ ...previous, [key]: value }));
  };

  const hasValuesToSave = Object.values(values).some(value => String(value ?? "").trim());

  if (isLoading) {
    return <div className="flex min-h-[300px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  if (isError || !data) {
    return <div className="mx-auto max-w-2xl p-6"><Card><CardContent className="flex items-center gap-3 p-6 text-sm text-red-700"><AlertCircle className="h-5 w-5" />Unable to load Zoho configuration.</CardContent></Card></div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 md:px-6">
      <div>
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-purple-600" />
          <h1 className="text-xl font-bold text-slate-800">Zoho Integration</h1>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Configure Zoho Campaigns credentials for testing and production without changing application code.
        </p>
      </div>

      <Card className={data.configured ? "border-emerald-200" : "border-amber-200"}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-700">Campaign delivery status</CardTitle>
              <CardDescription className="mt-1">
                Marketing campaigns use the Zoho Campaigns Email API with API-key authentication.
              </CardDescription>
            </div>
            {data.configured ? (
              <Badge className="shrink-0 border-0 bg-emerald-100 text-emerald-700"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Ready</Badge>
            ) : (
              <Badge className="shrink-0 border-0 bg-amber-100 text-amber-700"><AlertCircle className="mr-1 h-3.5 w-3.5" />Needs API key</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-600">Effective API base</span>
            <span className="font-mono text-xs text-slate-700">{data.apiBase}</span>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <p><strong>Precedence:</strong> Replit environment secrets always win over admin-entered values. Admin values are an encrypted fallback for testing. Nothing secret is returned to the browser.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-700">Credentials and connection settings</CardTitle>
          <CardDescription>
            Enter a value only when you want to add or replace the encrypted admin fallback. Existing values are never prefilled.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {fields.map(field => {
            const key = field.key;
            const isVisible = Boolean(visible[key]);
            return (
              <div key={key} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor={`zoho-${key}`} className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    {field.label}{field.required && <span className="ml-1 text-red-500">*</span>}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Badge className={sourceClass(field.source)}>{sourceLabel(field.source)}</Badge>
                    {field.configured && field.secret && <span className="inline-flex items-center gap-1 text-[11px] text-slate-400"><LockKeyhole className="h-3 w-3" />Stored securely</span>}
                  </div>
                </div>
                <div className="relative">
                  <Input
                    id={`zoho-${key}`}
                    type={field.secret && !isVisible ? "password" : "text"}
                    value={values[key] ?? ""}
                    onChange={event => updateValue(key, event.target.value)}
                    placeholder={field.source === "environment" ? "Environment value is active; enter an admin fallback only if needed" : field.configured ? "Saved securely; enter to replace" : `Enter ${field.label.toLowerCase()}`}
                    className={field.secret ? "pr-10 font-mono text-xs" : "font-mono text-xs"}
                    autoComplete="new-password"
                  />
                  {field.secret && (
                    <button
                      type="button"
                      aria-label={isVisible ? `Hide ${field.label}` : `Show ${field.label}`}
                      onClick={() => setVisible(previous => ({ ...previous, [key]: !isVisible }))}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  )}
                </div>
                <p className="text-xs leading-5 text-slate-500">{field.instructions} Environment name: <code className="rounded bg-slate-100 px-1 py-0.5">{field.envName}</code></p>
              </div>
            );
          })}

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="text-red-600 hover:text-red-700"
              disabled={clear.isPending}
              onClick={() => {
                if (window.confirm("Clear all admin-entered Zoho overrides? Environment secrets will not be changed.")) {
                  clear.mutate();
                }
              }}
            >
              {clear.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
              Clear admin overrides
            </Button>
            <Button type="button" onClick={() => save.mutate()} disabled={!hasValuesToSave || save.isPending}>
              {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save encrypted values
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-700">How to get the Zoho values</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-medium text-slate-800">For campaign sending</p>
            <p className="mt-1 text-xs leading-5">In Zoho Campaigns, open Settings → Developer Space → API Keys and create an Email API key with the <code className="rounded bg-white px-1 py-0.5">ZohoCampaigns.emailapi.ALL</code> scope. Put that key in the first field above. An OAuth access token or Bearer token will not work in that field.</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-medium text-slate-800">For optional OAuth credentials</p>
            <p className="mt-1 text-xs leading-5">Create an OAuth client in the Zoho API Console, then enter its client ID, client secret, and refresh token. These are retained for future Zoho API features; the current Campaigns Email API transmission does not use them.</p>
          </div>
          <a
            href="https://www.zoho.com/campaigns/help/developers/email-api/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            Open Zoho Campaigns Email API documentation <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}