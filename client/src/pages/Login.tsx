import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MOCK_USERS, seedDatabase } from "@/lib/mock-data";
import { Truck, ShieldCheck, UserCircle } from "lucide-react";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login, currentUser } = useStore();
  const [, setLocation] = useLocation();
  const [role, setRole] = useState("agent");
  const [error, setError] = useState("");

  useEffect(() => {
    seedDatabase();
    if (currentUser) {
      if (currentUser.role === 'admin') setLocation('/admin');
      else setLocation('/catalog');
    }
  }, [currentUser, setLocation]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Simulate login logic
    const user = MOCK_USERS.find(u => u.username === username && u.role === role);

    if (user) {
      if (!user.is_enabled) {
        setError("Account is disabled. Contact admin.");
        return;
      }
      login(user);
    } else {
      // For demo purposes, allow easy login if fields match suggestions
      if (username === "") {
        setError("Please enter a username");
        return;
      }
      setError("Invalid credentials");
    }
  };

  const demoLogin = (demoRole: 'admin' | 'agent') => {
    const user = MOCK_USERS.find(u => u.role === demoRole);
    if (user) login(user);
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
          <Tabs defaultValue="agent" onValueChange={setRole} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="agent">Sales Agent</TabsTrigger>
              <TabsTrigger value="admin">Administrator</TabsTrigger>
            </TabsList>
            
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
                  />
                </div>
              </div>

              {error && (
                <div className="text-sm text-red-500 bg-red-50 p-2 rounded border border-red-200">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full text-base py-6">
                Sign In
              </Button>
            </form>
          </Tabs>
        </CardContent>
        <CardFooter className="flex flex-col gap-2 bg-slate-50 p-4 border-t">
          <p className="text-xs text-slate-500 text-center mb-2">Demo Quick Login:</p>
          <div className="grid grid-cols-2 gap-2 w-full">
            <Button variant="outline" size="sm" onClick={() => demoLogin('agent')}>
              Agent Demo
            </Button>
            <Button variant="outline" size="sm" onClick={() => demoLogin('admin')}>
              Admin Demo
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
