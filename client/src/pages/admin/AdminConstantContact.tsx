import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Copy, ExternalLink, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  getAdminConstantContactStatus,
  startAdminConstantContactAuthorization,
  verifyAdminConstantContact,
} from "@/lib/api";

interface ConstantContactStatus {
  clientCredentialsConfigured: boolean;
  authorized: boolean;
  scopes: string[];
  expiresAt: number | null;
  connectedAt: number | null;
  redirectUri: string;
}

interface ConstantContactPermissionCheck {
  privileges: string[];
  canCreateCampaigns: boolean;
  canReadCampaigns: boolean;
  canManageContacts: boolean;
}

function PermissionLine({ label, allowed }: { label: string; allowed: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Badge variant={allowed ? "default" : "destructive"}>
        {allowed ? "Available" : "Not available"}
      </Badge>
    </div>
  );
}

export default function AdminConstantContactPage() {
  const { toast } = useToast();
  const [permissionCheck, setPermissionCheck] = useState<ConstantContactPermissionCheck | null>(null);
  const statusQuery = useQuery<ConstantContactStatus>({
    queryKey: ["admin-constant-contact-status"],
    queryFn: getAdminConstantContactStatus,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const connectMutation = useMutation({
    mutationFn: startAdminConstantContactAuthorization,
    onSuccess: (authorizationUrl) => window.location.assign(authorizationUrl),
    onError: (error: Error) => toast({
      title: "Could not start authorization",
      description: error.message,
      variant: "destructive",
    }),
  });

  const verifyMutation = useMutation({
    mutationFn: verifyAdminConstantContact,
    onSuccess: (result: ConstantContactPermissionCheck) => {
      setPermissionCheck(result);
      toast({
        title: "Permissions checked",
        description: "This read-only check did not create or send a campaign or modify contacts.",
      });
    },
    onError: (error: Error) => toast({
      title: "Permission check failed",
      description: error.message,
      variant: "destructive",
    }),
  });

  const status = statusQuery.data;
  const oauthResult = new URLSearchParams(window.location.search).get("oauth");

  const copyRedirectUri = async () => {
    if (!status?.redirectUri) return;
    try {
      await navigator.clipboard.writeText(status.redirectUri);
      toast({ title: "Redirect URI copied" });
    } catch {
      toast({
        title: "Could not copy",
        description: "Select and copy the redirect URI manually.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Constant Contact</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Authorize the API app and check its read-only account permissions.
        </p>
      </div>

      {oauthResult && (
        <div className="rounded-md border p-4 text-sm">
          {oauthResult === "connected" && "Constant Contact authorization completed."}
          {oauthResult === "denied" && "Authorization was declined. You can try again when ready."}
          {oauthResult === "invalid_state" && "The authorization session expired or did not match. Start a new authorization attempt."}
          {oauthResult === "failed" && "Authorization could not be completed. Check the callback URI and app permissions, then try again."}
        </div>
      )}

      {statusQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading connection status…
        </div>
      ) : statusQuery.error ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            Could not load Constant Contact status: {(statusQuery.error as Error).message}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                API app and authorization
                <Badge variant={status?.authorized ? "default" : "secondary"}>
                  {status?.authorized ? "Authorized" : "Not authorized"}
                </Badge>
              </CardTitle>
              <CardDescription>
                Credentials stay on the server. Authorization requests account_read, contact_data, campaign_data, and offline_access; this page only checks permissions and does not sync contacts or send campaigns.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <p className="font-medium">Developer app credentials</p>
                  <p className="text-sm text-muted-foreground">
                    {status?.clientCredentialsConfigured ? "Client ID and secret are configured." : "Client ID or secret is missing from this server environment."}
                  </p>
                </div>
                <Badge variant={status?.clientCredentialsConfigured ? "default" : "destructive"}>
                  {status?.clientCredentialsConfigured ? "Configured" : "Missing"}
                </Badge>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">Redirect URI for this environment</p>
                    <p className="text-sm text-muted-foreground">
                      Add this exact URI to the Redirect URIs in your Constant Contact developer app before connecting.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={copyRedirectUri} disabled={!status?.redirectUri}>
                    <Copy className="mr-2 h-4 w-4" /> Copy
                  </Button>
                </div>
                <code className="block break-all rounded-md bg-muted p-3 text-xs">
                  {status?.redirectUri}
                </code>
                <p className="text-xs text-muted-foreground">
                  Development and production use different callback URLs; register each environment separately.
                </p>
              </div>

              {status?.authorized && status.scopes.length > 0 && (
                <div>
                  <p className="mb-2 font-medium">Granted scopes</p>
                  <div className="flex flex-wrap gap-2">
                    {status.scopes.map((scope) => <Badge key={scope} variant="outline">{scope}</Badge>)}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => connectMutation.mutate()}
                  disabled={!status?.clientCredentialsConfigured || connectMutation.isPending}
                >
                  {connectMutation.isPending
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <ExternalLink className="mr-2 h-4 w-4" />}
                  {status?.authorized ? "Reconnect account" : "Authorize Constant Contact"}
                </Button>
                {status?.authorized && (
                  <Button onClick={() => verifyMutation.mutate()} disabled={verifyMutation.isPending}>
                    {verifyMutation.isPending
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : <ShieldAlert className="mr-2 h-4 w-4" />}
                    Check API permissions
                  </Button>
                )}
                <Button variant="outline" onClick={() => statusQuery.refetch()} disabled={statusQuery.isFetching}>
                  {statusQuery.isFetching
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <RefreshCw className="mr-2 h-4 w-4" />}
                  Refresh status
                </Button>
              </div>
            </CardContent>
          </Card>

          {permissionCheck && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" /> Account permissions
                </CardTitle>
                <CardDescription>
                  Read from Constant Contact’s user-privileges endpoint; no contacts or campaigns were changed.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  <PermissionLine label="Read campaigns" allowed={permissionCheck.canReadCampaigns} />
                  <PermissionLine label="Create campaigns" allowed={permissionCheck.canCreateCampaigns} />
                  <PermissionLine label="Manage contacts or lists" allowed={permissionCheck.canManageContacts} />
                </div>
                <div className="mt-4">
                  <p className="mb-2 text-sm font-medium">Returned privileges</p>
                  {permissionCheck.privileges.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {permissionCheck.privileges.map((privilege) => (
                        <Badge key={privilege} variant="outline">{privilege}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No privilege entries were returned.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <p className="text-sm text-muted-foreground">
            This setup only authorizes the account and checks permissions. Marketing campaigns will continue using the current sender until a separate cutover is implemented.
          </p>
        </>
      )}
    </div>
  );
}