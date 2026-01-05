import { MobileShell } from "@/components/layout/MobileShell";
import { useStore } from "@/lib/store";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Minus, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";
import { Card } from "@/components/ui/card";

export default function Catalog() {
  const [search, setSearch] = useState("");
  const [expandedProduct, setExpandedProduct] = useState<number | null>(null);
  const { data: allProducts = [] } = useQuery({ 
    queryKey: ['products', 'pinned'], 
    queryFn: api.getPinnedProducts 
  });
  
  const products = allProducts.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.sku.toLowerCase().includes(search.toLowerCase())
  );
  
  const { addToCart, cart } = useStore();
  const { toast } = useToast();

  const handleAdd = (product: api.Product, variant?: any) => {
    addToCart(product, 1, variant);
    toast({
      title: "Added to cart",
      description: `${product.name} ${variant ? `(${variant.sku})` : ''} added.`,
      duration: 1000,
    });
  };

  return (
    <MobileShell title="Catalog">
      <div className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 pb-4 pt-1">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
          <Input 
            placeholder="Search products..." 
            className="pl-10 bg-white dark:bg-slate-800"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-4 pb-20">
        {products.map((product) => (
          <Card key={product.id} className="overflow-hidden">
            <div className="flex p-4 gap-4">
              <img src={product.image} className="h-20 w-20 object-cover rounded" alt={product.name} />
              <div className="flex-1">
                <h3 className="font-bold">{product.name}</h3>
                <p className="text-xs text-slate-500">SKU: {product.sku}</p>
                <p className="font-bold mt-1 text-primary">${parseFloat(product.price).toFixed(2)}</p>
                
                {product.variants && product.variants.length > 0 ? (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="mt-2 h-8 text-xs"
                    onClick={() => setExpandedProduct(expandedProduct === product.id ? null : product.id)}
                  >
                    {product.variants.length} Variants {expandedProduct === product.id ? <ChevronUp className="ml-1 h-3 w-3"/> : <ChevronDown className="ml-1 h-3 w-3"/>}
                  </Button>
                ) : (
                  <Button size="sm" className="mt-2 h-8 text-xs" onClick={() => handleAdd(product)}>
                    <Plus className="mr-1 h-3 w-3" /> Add to Cart
                  </Button>
                )}
              </div>
            </div>

            {expandedProduct === product.id && product.variants && (
              <div className="bg-slate-50 p-4 border-t space-y-3">
                {product.variants.map((v: any) => (
                  <div key={v.id} className="flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">{v.option_values.map((ov: any) => ov.label).join(' / ')}</div>
                      <div className="text-xs text-slate-500">{v.sku} • Stock: {v.stock_level}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold">${parseFloat(v.price).toFixed(2)}</span>
                      <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => handleAdd(product, v)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </MobileShell>
  );
}
