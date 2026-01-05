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
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const handleQtyChange = (key: string, val: string) => {
    const n = parseInt(val);
    setQuantities(prev => ({ ...prev, [key]: isNaN(n) ? 0 : n }));
  };

  const handleAdd = (product: api.Product, variant?: any) => {
    const qtyKey = variant ? `${product.id}-${variant.id}` : `${product.id}`;
    const qty = quantities[qtyKey] || 1;
    
    addToCart(product, qty, variant);
    setQuantities(prev => ({ ...prev, [qtyKey]: 0 }));
    
    toast({
      title: "Added to cart",
      description: `${qty}x ${product.name} ${variant ? `(${variant.sku})` : ''} added.`,
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
            <div 
              className="flex p-4 gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() => setExpandedProduct(expandedProduct === product.id ? null : product.id)}
            >
              <img src={product.image} className="h-20 w-20 object-cover rounded" alt={product.name} />
              <div className="flex-1">
                <h3 className="font-bold text-lg">{product.name}</h3>
                <p className="text-sm text-slate-500">Base Price: ${parseFloat(product.price).toFixed(2)}</p>
                <div className="mt-2 flex items-center text-xs font-medium text-primary">
                  {product.variants && product.variants.length > 0 ? (
                    <>
                      {product.variants.length} Variants Available 
                      {expandedProduct === product.id ? <ChevronUp className="ml-1 h-3 w-3"/> : <ChevronDown className="ml-1 h-3 w-3"/>}
                    </>
                  ) : (
                    <span>No variants - Click to add</span>
                  )}
                </div>
              </div>
            </div>

            {expandedProduct === product.id && (
              <div className="bg-slate-50 p-4 border-t space-y-4">
                {product.variants && product.variants.length > 0 ? (
                  product.variants.map((v: any) => {
                    const qtyKey = `${product.id}-${v.id}`;
                    return (
                      <div key={v.id} className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3 last:border-0 last:pb-0">
                        <div className="flex-1">
                          <div className="font-bold text-sm">
                            {v.option_values.map((ov: any) => ov.label).join(' / ')}
                          </div>
                          <div className="text-xs text-slate-500">SKU: {v.sku} • Stock: {v.stock_level}</div>
                          <div className="font-bold text-primary mt-1">${parseFloat(v.price).toFixed(2)}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input 
                            type="number" 
                            min="0"
                            placeholder="Qty"
                            className="w-20 h-9 bg-white"
                            value={quantities[qtyKey] || ""}
                            onChange={(e) => handleQtyChange(qtyKey, e.target.value)}
                          />
                          <Button size="sm" onClick={() => handleAdd(product, v)} disabled={!(quantities[qtyKey] > 0)}>
                            Add
                          </Button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="text-xs text-slate-500">SKU: {product.sku} • Stock: {product.stock_level}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input 
                        type="number" 
                        min="0"
                        placeholder="Qty"
                        className="w-20 h-9 bg-white"
                        value={quantities[`${product.id}`] || ""}
                        onChange={(e) => handleQtyChange(`${product.id}`, e.target.value)}
                      />
                      <Button size="sm" onClick={() => handleAdd(product)} disabled={!(quantities[`${product.id}`] > 0)}>
                        Add
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </MobileShell>
  );
}
