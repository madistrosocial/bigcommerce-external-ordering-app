import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, KeyRound, Loader2, Mail, Save, Trash2, UserRound } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getAccountProfile, updateAccountPassword, updateAccountProfile } from "@/lib/api";
import { useStore } from "@/lib/store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

async function prepareAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("That image could not be read."));
      element.src = sourceUrl;
    });
    const maxDimension = 512;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare that image.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export default function AccountSettings() {
  const [, setLocation] = useLocation();
  const { currentUser, login } = useStore();
  const { toast } = useToast();
  const [name, setName] = useState(currentUser?.name || "");
  const [username, setUsername] = useState(currentUser?.username || "");
  const [avatarData, setAvatarData] = useState(currentUser?.avatar_data || "");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isPreparingAvatar, setIsPreparingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    getAccountProfile()
      .then((profile) => {
        if (!active) return;
        setName(profile.name);
        setUsername(profile.username);
        setAvatarData(profile.avatar_data || "");
        if (currentUser) login({ ...currentUser, ...profile, auth_token: currentUser.auth_token });
      })
      .catch((error: any) => {
        if (active) toast({ title: "Unable to load settings", description: error.message, variant: "destructive" });
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const profile = await updateAccountProfile({ name, username, avatar_data: avatarData || null });
      if (currentUser) login({ ...currentUser, ...profile, auth_token: currentUser.auth_token });
      setName(profile.name);
      setUsername(profile.username);
      setAvatarData(profile.avatar_data || "");
      toast({ title: "Account updated", description: "Your account information has been saved." });
    } catch (error: any) {
      toast({ title: "Unable to save changes", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsPreparingAvatar(true);
    try {
      setAvatarData(await prepareAvatar(file));
    } catch (error: any) {
      toast({ title: "Unable to use that photo", description: error.message, variant: "destructive" });
    } finally {
      setIsPreparingAvatar(false);
    }
  };

  const handlePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 8) {
      toast({ title: "Password is too short", description: "Use at least 8 characters.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", description: "Enter the same password in both fields.", variant: "destructive" });
      return;
    }
    setIsChangingPassword(true);
    try {
      await updateAccountPassword(newPassword);
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "Password updated", description: "Your new password is active now." });
    } catch (error: any) {
      toast({ title: "Unable to update password", description: error.message, variant: "destructive" });
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/dashboard")} aria-label="Back to dashboard" data-testid="button-account-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Account</p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">User settings</h1>
            <p className="mt-1 text-sm text-slate-500">Manage your name, login email, and password access.</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><UserRound className="h-5 w-5 text-blue-600" /> Basic information</CardTitle>
            <CardDescription>These details are used to identify you in the Sales app.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-5 flex flex-col gap-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
              <Avatar className="h-20 w-20 border-2 border-white shadow-sm">
                <AvatarImage src={avatarData || undefined} alt={`${name || "User"} profile photo`} />
                <AvatarFallback className="bg-blue-100 text-xl font-semibold text-blue-700">
                  {(name || username || "U").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">Profile photo</p>
                <p className="mt-1 text-xs text-slate-500">Choose a small photo or icon. It will appear beside your name in the app.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleAvatarChange} />
                  <Button type="button" variant="outline" size="sm" onClick={() => avatarInputRef.current?.click()} disabled={isLoading || isSaving || isPreparingAvatar} data-testid="button-upload-avatar">
                    {isPreparingAvatar ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                    {isPreparingAvatar ? "Preparing…" : "Choose photo"}
                  </Button>
                  {avatarData && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setAvatarData("")} disabled={isLoading || isSaving || isPreparingAvatar} data-testid="button-remove-avatar">
                      <Trash2 className="mr-2 h-4 w-4" /> Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <form onSubmit={handleSave} className="space-y-5">
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="account-name">Full name</Label>
                  <Input id="account-name" value={name} onChange={(event) => setName(event.target.value)} disabled={isLoading || isSaving} maxLength={120} data-testid="input-account-name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="account-email">Email address</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input id="account-email" type="email" value={username} onChange={(event) => setUsername(event.target.value)} disabled={isLoading || isSaving} maxLength={254} className="pl-9" data-testid="input-account-email" />
                  </div>
                  <p className="text-xs text-slate-500">This is also your login username and password-reset email.</p>
                </div>
              </div>
              <Button type="submit" disabled={isLoading || isSaving} data-testid="button-save-account">
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isSaving ? "Saving…" : "Save changes"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><KeyRound className="h-5 w-5 text-blue-600" /> Password</CardTitle>
            <CardDescription>Choose a new password for your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordChange} className="max-w-xl space-y-4">
              <div className="space-y-2">
                <Label htmlFor="account-new-password">New password</Label>
                <Input id="account-new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} disabled={isLoading || isChangingPassword} data-testid="input-account-new-password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-confirm-password">Confirm new password</Label>
                <Input id="account-confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} disabled={isLoading || isChangingPassword} data-testid="input-account-confirm-password" />
              </div>
              <p className="text-xs text-slate-500">Use at least 8 characters. Saving a new password invalidates any previously issued password-reset links.</p>
              <Button type="submit" disabled={isLoading || isChangingPassword} data-testid="button-update-password">
                {isChangingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isChangingPassword ? "Updating…" : "Update password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}