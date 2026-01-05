import { MobileShell } from "@/components/layout/MobileShell";
import { db, Product, User } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pin, PinOff, UserX, UserCheck, Search, Cloud, Settings, AlertCircle, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { searchBigCommerceProducts } from "@/lib/bigcommerce";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  const products = useLiveQuery(() => db.products.orderBy('is_pinned').reverse().toArray());
  const users = useLiveQuery(() => db.users.where('role').equals('agent').toArray());
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [bcConfig, setBcConfig] = useState({
    storeHash: localStorage.getItem('bc_store_hash') || '',
    token: localStorage.getItem('bc_token') || ''
  });
  const [showConfig, setShowConfig] = useState(false);

  const togglePin = async (product: Product) => {
    await db.products.update(product.id, { is_pinned: !product.is_pinned });
    toast({
      title: product.is_pinned ? "Unpinned" : "Pinned",
      description: `${product.name} is now ${product.is_pinned ? "hidden from" : "visible in"} the agent catalog.`,
    });
  };

  const importAndPinProduct = async (product: Product) => {
    try {
      // Check if already exists
      const existing = await db.products.where('bigcommerce_id').equals(product.bigcommerce_id).first();
      
      if (existing) {
        await db.products.update(existing.id, { is_pinned: true });
        toast({ title: "Product Pinned", description: "Product was already in database, now pinned." });
      } else {
        await db.products.add({ ...product, is_pinned: true });
        toast({ title: "Product Imported & Pinned", description: "Added from BigCommerce catalog." });
      }
      // Clear search results to encourage looking at the list
      setSearchResults(prev => prev.filter(p => p.bigcommerce_id !== product.bigcommerce_id));
    } catch (e) {
      toast({ title: "Error", description: "Failed to import product", variant: "destructive" });
    }
  };

  const toggleUserStatus = async (user: User) => {
    await db.users.update(user.id, { is_enabled: !user.is_enabled });
    toast({
      title: "User Updated",
      description: `${user.name} has been ${user.is_enabled ? "disabled" : "enabled"}.`,
    });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const results = await searchBigCommerceProducts(searchQuery, bcConfig.token, bcConfig.storeHash);
      setSearchResults(results);
      if (results.length === 0) {
        toast({ title: "No results", description: "Try a different search term." });
      }
    } catch (e) {
      toast({ title: "Search Failed", description: "Could not fetch products.", variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  };

  const saveConfig = () => {
    localStorage.setItem('bc_store_hash', bcConfig.storeHash);
    localStorage.setItem('bc_token', bcConfig.token);
    setShowConfig(false);
    toast({ title: "Settings Saved", description: "API credentials updated." });
  };

  return (
    <MobileShell title="Admin Console">
      <div className="flex justify-end mb-4">
        <Dialog open={showConfig} onOpenChange={setShowConfig}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
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
                />
              </div>
              <div className="space-y-2">
                <Label>Access Token</Label>
                <Input 
                  value={bcConfig.token} 
                  onChange={e => setBcConfig({...bcConfig, token: e.target.value})}
                  type="password"
                  placeholder="X-Auth-Token" 
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={saveConfig}>Save Configuration</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="products" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="products">Catalog Management</TabsTrigger>
          <TabsTrigger value="users">Agent Access</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-6">
          
          {/* Search Section */}
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
                />
                <Button type="submit" disabled={isSearching}>
                  {isSearching ? "..." : <Search className="h-4 w-4" />}
                </Button>
              </form>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="mt-4 space-y-3">
                  <h4 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Search Results</h4>
                  <div className="grid gap-2">
                    {searchResults.map(p => (
                      <div key={p.bigcommerce_id} className="bg-white dark:bg-slate-800 p-3 rounded border flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-1">
                        <div className="flex items-center gap-3">
                          <img src={p.image} className="h-10 w-10 rounded object-cover bg-slate-100" />
                          <div>
                            <div className="font-bold text-sm">{p.name}</div>
                            <div className="text-xs text-slate-500">{p.sku} • Stock: {p.stock_level}</div>
                          </div>
                        </div>
                        <Button size="sm" variant="secondary" onClick={() => importAndPinProduct(p)} className="gap-1">
                          <Plus className="h-3 w-3" /> Pin
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pinned Products List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold font-heading">Active Pinned Products</h3>
              <Badge variant="outline">{products?.filter(p => p.is_pinned).length || 0} visible to agents</Badge>
            </div>
            
            <div className="grid gap-4">
              {products?.filter(p => p.is_pinned).map((product) => (
                <Card key={product.id} className="overflow-hidden border-l-4 border-l-primary">
                  <div className="flex items-center p-4 gap-4">
                    <img src={product.image} alt={product.name} className="h-16 w-16 object-cover rounded-md bg-slate-100" />
                    <div className="flex-1">
                      <h3 className="font-bold text-sm leading-tight mb-1">{product.name}</h3>
                      <p className="text-xs text-slate-500 mb-2">SKU: {product.sku} • Stock: {product.stock_level}</p>
                      <div className="flex items-center gap-2">
                        <Switch 
                          checked={product.is_pinned}
                          onCheckedChange={() => togglePin(product)}
                        />
                        <span className="text-xs font-medium text-slate-600">
                          Pinned
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
              
              {products?.filter(p => p.is_pinned).length === 0 && (
                <div className="text-center py-8 text-slate-500 border-2 border-dashed rounded-lg">
                  <PinOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No products pinned. Agents will see an empty catalog.
                  <p className="text-xs mt-1">Search above to find and pin products.</p>
                </div>
              )}
            </div>
            
            {/* Unpinned Products (Hidden) */}
             <div className="pt-8">
              <h3 className="text-sm font-bold font-heading text-slate-400 mb-2 uppercase">Hidden Products (Unpinned)</h3>
              <div className="grid gap-2 opacity-60 hover:opacity-100 transition-opacity">
                {products?.filter(p => !p.is_pinned).map((product) => (
                  <div key={product.id} className="bg-slate-100 dark:bg-slate-800 p-2 rounded flex justify-between items-center">
                    <span className="text-sm font-medium pl-2">{product.name}</span>
                    <Button variant="ghost" size="sm" onClick={() => togglePin(product)}>Pin</Button>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </TabsContent>

        <TabsContent value="users">
           <div className="grid gap-4">
            {users?.map((user) => (
              <Card key={user.id}>
                <div className="flex items-center justify-between p-4">
                  <div>
                    <h3 className="font-bold">{user.name}</h3>
                    <p className="text-sm text-slate-500">{user.username}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={user.is_enabled ? "outline" : "destructive"}>
                      {user.is_enabled ? "Active" : "Disabled"}
                    </Badge>
                    <Button 
                      size="icon" 
                      variant="ghost"
                      onClick={() => toggleUserStatus(user)}
                    >
                      {user.is_enabled ? <UserCheck className="h-5 w-5 text-green-600" /> : <UserX className="h-5 w-5 text-red-500" />}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
           </div>
        </TabsContent>
      </Tabs>
    </MobileShell>
  );
}
