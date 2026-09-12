import { useState, useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Truck, ShieldCheck, UserCircle } from "lucide-react";
import { login as apiLogin, getMyPermissions } from "@/lib/api";
import { LANDING_OPTIONS } from "@/pages/admin/AdminUsers";
import { queryClient } from "@/lib/queryClient";

const FALLBACK_ORDER = [
  "crm_customers",
  "orders_my",
  "catalog",
  "inventory_push",
  "dashboard",
];

function resolveRedirectTarget(
  preferred: string,
  permStrings: string[],
  isAdmin: boolean,
): string {
  if (isAdmin) return preferred || "/dashboard";

  const preferred_opt = LANDING_OPTIONS.find((o) => o.route === preferred);
  if (preferred_opt && permStrings.includes(`${preferred_opt.permission}:view`)) {
    return preferred;
  }

  for (const perm of FALLBACK_ORDER) {
    if (permStrings.includes(`${perm}:view`)) {
      const opt = LANDING_OPTIONS.find((o) => o.permission === perm);
      if (opt) return opt.route;
    }
  }

  return "/dashboard";
}

async function fetchBusinessLogo(): Promise<string | null> {
  try {
    const res = await fetch("/api/public/business-logo");
    if (!res.ok) return null;
    const data = await res.json();
    return data.value ?? null;
  } catch {
    return null;
  }
}

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login, logout, currentUser } = useStore();
  const [, setLocation] = useLocation();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [businessLogo, setBusinessLogo] = useState<string | null>(null);
  // Tracks whether a fresh login flow is handling the redirect, so the
  // already-logged-in useEffect doesn't fire concurrently and override it.
  const redirectingRef = useRef(false);

  useEffect(() => {
    fetchBusinessLogo().then(setBusinessLogo);
  }, []);

  // Handles the "already logged in" case (e.g. page refresh with active session).
  // Skipped when a fresh login is in progress — doRedirect owns the redirect then.
  useEffect(() => {
    if (currentUser?.auth_token && !redirectingRef.current) {
      setLocation(currentUser.default_landing_page || "/dashboard");
    }
  }, [currentUser, setLocation]);

  const doRedirect = async (user: NonNullable<ReturnType<typeof useStore>["currentUser"]>) => {
    redirectingRef.current = true;
    login(user);
    const preferred = user.default_landing_page || "/dashboard";
    try {
      if (user.role === "admin") {
        setLocation(preferred);
      } else {
        try {
          const perms = await getMyPermissions();
          setLocation(resolveRedirectTarget(preferred, perms, false));
        } catch {
          setLocation("/dashboard");
        }
      }
    } finally {
      redirectingRef.current = false;
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const user = await apiLogin(username, password);
      await doRedirect(user);
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForceLogout = () => {
    logout();
    queryClient.clear();
    window.location.replace("/");
  };

  const demoLogin = async (demoRole: 'admin' | 'agent') => {
    setIsLoading(true);
    setError("");
    
    try {
      const demoUser = demoRole === 'admin' ? 'admin@vansales.com' : 'agent1@vansales.com';
      const user = await apiLogin(demoUser, 'demo123');
      await doRedirect(user);
    } catch (err: any) {
      setError(err.message || "Demo login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page bg-slate-100 dark:bg-slate-900 p-4">
      <Card className="w-full max-w-md shadow-lg border-t-4 border-t-primary">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 w-fit">
            {businessLogo ? (
              <div className="rounded-full bg-black flex items-center justify-center" style={{width: 160, height: 160}}>
                <img
                  src={businessLogo}
                  alt="Business Logo"
                  className="h-28 w-28 object-contain"
                  data-testid="img-business-logo"
                />
              </div>
            ) : (
              <div className="bg-slate-900 text-white p-3 rounded-full">
                <Truck className="h-8 w-8" />
              </div>
            )}
          </div>
          <CardTitle className="text-2xl font-heading uppercase tracking-wide">Sales | Midatlantic Distribution</CardTitle>
          <CardDescription>Enter your credentials to access the system</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <UserCircle className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                <Input 
                  id="username" 
                  placeholder="email@company.com" 
                  className="pl-10"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoading}
                  data-testid="input-username"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <ShieldCheck className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                <Input 
                  id="password" 
                  type="password" 
                  placeholder="••••••••" 
                  className="pl-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  data-testid="input-password"
                />
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-500 bg-red-50 p-2 rounded border border-red-200" data-testid="text-error">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full text-base py-6" disabled={isLoading} data-testid="button-login">
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center pt-0">
          <button
            type="button"
            onClick={handleForceLogout}
            className="text-xs text-slate-500 underline underline-offset-2 hover:text-red-600"
            data-testid="button-login-force-logout"
          >
            Clear saved session
          </button>
        </CardFooter>
      </Card>
    </div>
  );
}
