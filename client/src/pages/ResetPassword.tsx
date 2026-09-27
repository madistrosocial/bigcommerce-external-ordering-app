import { useState } from "react";
import { KeyRound, Loader2, Truck } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { resetPassword } from "@/lib/api";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const token = new URLSearchParams(window.location.search).get("token") || "";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      toast({ title: "Password is too short", description: "Use at least 8 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirmation) {
      toast({ title: "Passwords do not match", description: "Enter the same password in both fields.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      await resetPassword(token, password);
      toast({ title: "Password updated", description: "You can now sign in with your new password." });
      setLocation("/");
    } catch (error: any) {
      toast({ title: "Unable to reset password", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white">
            <Truck className="h-6 w-6" />
          </div>
          <CardTitle className="flex items-center justify-center gap-2 text-xl"><KeyRound className="h-5 w-5 text-blue-600" /> Reset password</CardTitle>
          <CardDescription>Choose a new password for your Sales account.</CardDescription>
        </CardHeader>
        <CardContent>
          {!token ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-red-600">This password reset link is missing or invalid.</p>
              <Button variant="outline" onClick={() => setLocation("/")}>Return to sign in</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input id="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} disabled={isSaving} data-testid="input-new-password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input id="confirm-password" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} disabled={isSaving} data-testid="input-confirm-password" />
              </div>
              <Button type="submit" className="w-full" disabled={isSaving} data-testid="button-reset-password">
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSaving ? "Updating password…" : "Update password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}