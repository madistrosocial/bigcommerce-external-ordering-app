import { MobileShell } from "@/components/layout/MobileShell";
import { db, Product, User } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pin, PinOff, UserX, UserCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AdminDashboard() {
  const products = useLiveQuery(() => db.products.toArray());
  const users = useLiveQuery(() => db.users.where('role').equals('agent').toArray());
  const { toast } = useToast();

  const togglePin = async (product: Product) => {
    await db.products.update(product.id, { is_pinned: !product.is_pinned });
    toast({
      title: product.is_pinned ? "Unpinned" : "Pinned",
      description: `${product.name} is now ${product.is_pinned ? "hidden from" : "visible at top of"} catalog.`,
    });
  };

  const toggleUserStatus = async (user: User) => {
    await db.users.update(user.id, { is_enabled: !user.is_enabled });
    toast({
      title: "User Updated",
      description: `${user.name} has been ${user.is_enabled ? "disabled" : "enabled"}.`,
    });
  };

  return (
    <MobileShell title="Admin Console">
      <Tabs defaultValue="products" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="products">Product Pinning</TabsTrigger>
          <TabsTrigger value="users">Agent Access</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-md text-sm mb-4">
            Pinned products appear first in the agent's catalog. Use this to prioritize monthly specials or high-stock items.
          </div>
          
          <div className="grid gap-4">
            {products?.map((product) => (
              <Card key={product.id} className="overflow-hidden">
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
                        {product.is_pinned ? "Pinned to Top" : "Standard Sort"}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    {product.is_pinned && <Pin className="h-5 w-5 text-primary" />}
                  </div>
                </div>
              </Card>
            ))}
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
