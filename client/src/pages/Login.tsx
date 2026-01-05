import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Truck, ShieldCheck, UserCircle } from "lucide-react";
import { login as apiLogin } from "@/lib/api";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login, currentUser } = useStore();
  const [, setLocation] = useLocation();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (currentUser) {
      if (currentUser.role === 'admin') setLocation('/admin');
      else setLocation('/catalog');
    }
  }, [currentUser, setLocation]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const user = await apiLogin(username, password);
      login(user);
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const demoLogin = async (demoRole: 'admin' | 'agent') => {
    setIsLoading(true);
    setError("");
    
    try {
      const demoUser = demoRole === 'admin' ? 'admin@vansales.com' : 'agent1@vansales.com';
      const user = await apiLogin(demoUser, 'demo123');
      login(user);
    } catch (err: any) {
      setError(err.message || "Demo login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 p-4">
      <Card className="w-full max-w-md shadow-lg border-t-4 border-t-primary">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto bg-slate-900 text-white p-3 rounded-full w-fit mb-4">
            <Truck className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl font-heading uppercase tracking-wide">VanSales Pro</CardTitle>
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
        <CardFooter className="flex flex-col gap-2 bg-slate-50 p-4 border-t">
          <p className="text-xs text-slate-500 text-center mb-2">Demo Quick Login (password: demo123):</p>
          <div className="grid grid-cols-2 gap-2 w-full">
            <Button variant="outline" size="sm" onClick={() => demoLogin('agent')} disabled={isLoading} data-testid="button-demo-agent">
              Agent Demo
            </Button>
            <Button variant="outline" size="sm" onClick={() => demoLogin('admin')} disabled={isLoading} data-testid="button-demo-admin">
              Admin Demo
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
