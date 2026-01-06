import { MobileShell } from "@/components/layout/MobileShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pin, PinOff, UserX, UserCheck, Search, Cloud, Settings, Plus, Trash2, Shield, UserCog } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Product, User } from "@/lib/api";
import * as api from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

export default function AdminDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: products = [] } = useQuery({ 
    queryKey: ['products'], 
    queryFn: api.getAllProducts 
  });
  
  const { data: agents = [] } = useQuery({ 
    queryKey: ['agents'], 
    queryFn: api.getAllAgents 
  });

  const { data: admins = [] } = useQuery({ 
    queryKey: ['admins'], 
    queryFn: api.getAllAdmins 
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [bcConfig, setBcConfig] = useState({
    storeHash: localStorage.getItem('bc_store_hash') || '',
    token: localStorage.getItem('bc_token') || ''
  });
  const [showConfig, setShowConfig] = useState(false);

  const togglePinMutation = useMutation({
    mutationFn: ({ id, is_pinned }: { id: number; is_pinned: boolean }) => 
      api.toggleProductPin(id, is_pinned),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    }
  });

  const createProductMutation = useMutation({
    mutationFn: api.createProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: "Product Imported & Pinned", description: "Added from BigCommerce catalog." });
    }
  });

  const updateUserStatusMutation = useMutation({
    mutationFn: ({ id, is_enabled }: { id: number; is_enabled: boolean }) => 
      api.updateUserStatus(id, is_enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['admins'] });
      toast({ title: "User Updated", description: "User status has been updated." });
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: number) => api.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['admins'] });
      toast({ title: "User Deleted", description: "User has been removed." });
    },
    onError: (error: any) => {
      toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
    }
  });

  const resyncProductsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/products/resync', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to re-sync products');
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      
      if (data.errors > 0) {
        toast({ 
          title: "Partial Re-sync", 
          description: `Updated ${data.updated} products, but ${data.errors} failed. Check server logs for details.`,
          variant: "default"
        });
      } else {
        toast({ 
          title: "Products Re-synced", 
          description: `Successfully updated ${data.updated} products with latest variant data from BigCommerce.` 
        });
      }
    },
    onError: (error: any) => {
      toast({ 
        title: "Re-sync Failed", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  });

  const togglePin = async (product: Product) => {
    await togglePinMutation.mutateAsync({ id: product.id, is_pinned: !product.is_pinned });
    toast({
      title: product.is_pinned ? "Unpinned" : "Pinned",
      description: `${product.name} is now ${product.is_pinned ? "hidden from" : "visible in"} the agent catalog.`,
    });
  };

  const importAndPinProduct = async (product: any) => {
    try {
      await createProductMutation.mutateAsync({
        bigcommerce_id: product.bigcommerce_id,
        name: product.name,
        sku: product.sku,
        price: product.price,
        image: product.image,
        description: product.description,
        stock_level: product.stock_level,
        is_pinned: true,
        variants: product.variants || []
      });
      setSearchResults(prev => prev.filter((p: any) => p.bigcommerce_id !== product.bigcommerce_id));
    } catch (e) {
      toast({ title: "Product Pinned", description: "Product was already in database, now pinned." });
    }
  };

  const toggleUserStatus = async (user: User) => {
    await updateUserStatusMutation.mutateAsync({ id: user.id, is_enabled: !user.is_enabled });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      // Use the config from state if available, but the proxy will now use server-side settings
      const results = await api.searchBigCommerceProducts(searchQuery, bcConfig.token, bcConfig.storeHash);
      setSearchResults(results as any);
      if (results.length === 0) {
        toast({ title: "No results", description: "Try a different search term." });
      }
    } catch (e) {
      toast({ title: "Search Failed", description: "Could not fetch products. Using mock data.", variant: "default" });
      // Fallback to mock search using frontend lib
      const { searchBigCommerceProducts } = await import('@/lib/bigcommerce');
      const mockResults = await searchBigCommerceProducts(searchQuery);
      setSearchResults(mockResults as any);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    // Fetch settings from server instead of localStorage
    api.getSetting("bigcommerce_config").then(setting => {
      if (setting && setting.value) {
        setBcConfig(setting.value);
      }
    });
  }, []);

  const saveConfig = async () => {
    try {
      await api.saveSetting("bigcommerce_config", bcConfig);
      setShowConfig(false);
      toast({ title: "Settings Saved", description: "API credentials updated on server." });
    } catch (e) {
      toast({ title: "Error", description: "Failed to save configuration.", variant: "destructive" });
    }
  };

  const pinnedProducts = products.filter(p => p.is_pinned);
  const unpinnedProducts = products.filter(p => !p.is_pinned);

  return (
    <MobileShell title="Admin Console">
      <div className="flex justify-end mb-4">
        <Dialog open={showConfig} onOpenChange={setShowConfig}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2" data-testid="button-config">
              <Settings className="h-4 w-4" />
              BC Configuration
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>BigCommerce API Settings</DialogTitle>
              <DialogDescription>
                Enter your Store Hash and Access Token to fetch real data.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Store Hash</Label>
                <Input 
                  value={bcConfig.storeHash} 
                  onChange={e => setBcConfig({...bcConfig, storeHash: e.target.value})}
                  placeholder="e.g. ab12cd34" 
                  data-testid="input-storehash"
                />
              </div>
              <div className="space-y-2">
                <Label>Access Token</Label>
                <Input 
                  value={bcConfig.token} 
                  onChange={e => setBcConfig({...bcConfig, token: e.target.value})}
                  type="password"
                  placeholder="X-Auth-Token" 
                  data-testid="input-token"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={saveConfig} data-testid="button-save-config">Save Configuration</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="products" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="products" data-testid="tab-products">Catalog Management</TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">Agent Access</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-6">
          
          <Card className="bg-slate-50 dark:bg-slate-900/50 border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Cloud className="h-5 w-5 text-blue-500" />
                Search BigCommerce Catalog
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSearch} className="flex gap-2">
                <Input 
                  placeholder="Search by name or SKU..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="bg-white dark:bg-slate-950"
                  data-testid="input-search"
                />
                <Button type="submit" disabled={isSearching} data-testid="button-search">
                  {isSearching ? "..." : <Search className="h-4 w-4" />}
                </Button>
              </form>

              {searchResults.length > 0 && (
                <div className="mt-4 space-y-3">
                  <h4 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Search Results</h4>
                  <div className="grid gap-2">
                    {searchResults.map(p => (
                      <div key={p.bigcommerce_id} className="bg-white dark:bg-slate-800 p-3 rounded border flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-1" data-testid={`search-result-${p.bigcommerce_id}`}>
                        <div className="flex items-center gap-3">
                          <img src={p.image} className="h-10 w-10 rounded object-cover bg-slate-100" alt={p.name} />
                          <div>
                            <div className="font-bold text-sm">{p.name}</div>
                            <div className="text-xs text-slate-500">{p.sku} • Stock: {p.stock_level}</div>
                          </div>
                        </div>
                        <Button size="sm" variant="secondary" onClick={() => importAndPinProduct(p)} className="gap-1" data-testid={`button-pin-${p.bigcommerce_id}`}>
                          <Plus className="h-3 w-3" /> Pin
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold font-heading">Active Pinned Products</h3>
              <div className="flex items-center gap-2">
                <Badge variant="outline" data-testid="text-pinned-count">{pinnedProducts.length} visible to agents</Badge>
                {pinnedProducts.length > 0 && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => resyncProductsMutation.mutate()}
                    disabled={resyncProductsMutation.isPending}
                    data-testid="button-resync-products"
                  >
                    {resyncProductsMutation.isPending ? "Re-syncing..." : "Re-sync Variants"}
                  </Button>
                )}
              </div>
            </div>
            
            <div className="grid gap-4">
              {pinnedProducts.map((product) => (
                <Card key={product.id} className="overflow-hidden border-l-4 border-l-primary" data-testid={`product-pinned-${product.id}`}>
                  <div className="flex items-center p-4 gap-4">
                    <img src={product.image} alt={product.name} className="h-16 w-16 object-cover rounded-md bg-slate-100" />
                    <div className="flex-1">
                      <h3 className="font-bold text-sm leading-tight mb-1">{product.name}</h3>
                      <p className="text-xs text-slate-500 mb-2">SKU: {product.sku} • Stock: {product.stock_level}</p>
                      <div className="flex items-center gap-2">
                        <Switch 
                          checked={product.is_pinned}
                          onCheckedChange={() => togglePin(product)}
                          data-testid={`switch-pin-${product.id}`}
                        />
                        <span className="text-xs font-medium text-slate-600">
                          Pinned
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
              
              {pinnedProducts.length === 0 && (
                <div className="text-center py-8 text-slate-500 border-2 border-dashed rounded-lg" data-testid="text-no-pinned">
                  <PinOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No products pinned. Agents will see an empty catalog.
                  <p className="text-xs mt-1">Search above to find and pin products.</p>
                </div>
              )}
            </div>
            
            {unpinnedProducts.length > 0 && (
              <div className="pt-8">
                <h3 className="text-sm font-bold font-heading text-slate-400 mb-2 uppercase">Hidden Products (Unpinned)</h3>
                <div className="grid gap-2 opacity-60 hover:opacity-100 transition-opacity">
                  {unpinnedProducts.map((product) => (
                    <div key={product.id} className="bg-slate-100 dark:bg-slate-800 p-2 rounded flex justify-between items-center" data-testid={`product-unpinned-${product.id}`}>
                      <span className="text-sm font-medium pl-2">{product.name}</span>
                      <Button variant="ghost" size="sm" onClick={() => togglePin(product)} data-testid={`button-unpin-${product.id}`}>Pin</Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="users">
          <div className="mb-6">
            <Dialog>
              <DialogTrigger asChild>
                <Button className="w-full gap-2" data-testid="button-add-user">
                  <Plus className="h-4 w-4" /> Add New User
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create User Account</DialogTitle>
                  <DialogDescription>
                    Fill in the details to create a new user account.
                  </DialogDescription>
                </DialogHeader>
                <form 
                  className="space-y-4 py-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const data = Object.fromEntries(formData);
                    try {
                      await api.createUser(data);
                      queryClient.invalidateQueries({ queryKey: ['agents'] });
                      queryClient.invalidateQueries({ queryKey: ['admins'] });
                      toast({ title: "User Created", description: `New ${data.role} account is ready.` });
                      (e.target as HTMLFormElement).reset();
                    } catch (err: any) {
                      toast({ title: "Error", description: err.message, variant: "destructive" });
                    }
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input id="name" name="name" placeholder="John Doe" required data-testid="input-user-name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="username">Username (Email)</Label>
                    <Input id="username" name="username" type="email" placeholder="john@example.com" required data-testid="input-user-email" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" name="password" type="password" placeholder="••••••••" required data-testid="input-user-password" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select name="role" defaultValue="agent">
                      <SelectTrigger data-testid="select-role">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="agent">Agent (Sales)</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter>
                    <Button type="submit" data-testid="button-create-user">Create Account</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Tabs defaultValue="agents" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="agents" className="gap-2" data-testid="tab-agents">
                <UserCog className="h-4 w-4" /> Agents ({agents.length})
              </TabsTrigger>
              <TabsTrigger value="admins" className="gap-2" data-testid="tab-admins">
                <Shield className="h-4 w-4" /> Admins ({admins.length})
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="agents">
              <div className="grid gap-4">
                {agents.map((user) => (
                  <Card key={user.id} data-testid={`user-agent-${user.id}`}>
                    <div className="flex items-center justify-between p-4">
                      <div>
                        <h3 className="font-bold">{user.name}</h3>
                        <p className="text-sm text-slate-500">{user.username}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={user.is_enabled ? "outline" : "destructive"} data-testid={`badge-status-${user.id}`}>
                          {user.is_enabled ? "Active" : "Disabled"}
                        </Badge>
                        <Button 
                          size="icon" 
                          variant="ghost"
                          onClick={() => toggleUserStatus(user)}
                          data-testid={`button-toggle-user-${user.id}`}
                        >
                          {user.is_enabled ? <UserCheck className="h-5 w-5 text-green-600" /> : <UserX className="h-5 w-5 text-red-500" />}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" data-testid={`button-delete-user-${user.id}`}>
                              <Trash2 className="h-5 w-5 text-red-500" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete User?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete {user.name}'s account. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteUserMutation.mutate(user.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </Card>
                ))}
                {agents.length === 0 && (
                  <div className="text-center py-8 text-slate-500 border-2 border-dashed rounded-lg">
                    No agents yet. Create one using the button above.
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="admins">
              <div className="grid gap-4">
                {admins.map((user) => (
                  <Card key={user.id} data-testid={`user-admin-${user.id}`}>
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-blue-600" />
                        <div>
                          <h3 className="font-bold">{user.name}</h3>
                          <p className="text-sm text-slate-500">{user.username}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={user.is_enabled ? "outline" : "destructive"} data-testid={`badge-status-${user.id}`}>
                          {user.is_enabled ? "Active" : "Disabled"}
                        </Badge>
                        <Button 
                          size="icon" 
                          variant="ghost"
                          onClick={() => toggleUserStatus(user)}
                          data-testid={`button-toggle-admin-${user.id}`}
                        >
                          {user.is_enabled ? <UserCheck className="h-5 w-5 text-green-600" /> : <UserX className="h-5 w-5 text-red-500" />}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" data-testid={`button-delete-admin-${user.id}`}>
                              <Trash2 className="h-5 w-5 text-red-500" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Admin?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete {user.name}'s admin account. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteUserMutation.mutate(user.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </Card>
                ))}
                {admins.length === 0 && (
                  <div className="text-center py-8 text-slate-500 border-2 border-dashed rounded-lg">
                    No additional admins. Create one using the button above.
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </MobileShell>
  );
}
