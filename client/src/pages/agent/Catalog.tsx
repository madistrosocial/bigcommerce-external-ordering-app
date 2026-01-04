import { MobileShell } from "@/components/layout/MobileShell";
import { db, Product } from "@/lib/db";
import { useStore } from "@/lib/store";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Minus, ShoppingCart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Catalog() {
  const [search, setSearch] = useState("");
  const products = useLiveQuery(
    () => db.products
      .orderBy('is_pinned')
      .reverse() // Pinned first
      .filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()))
      .toArray(),
    [search]
  );
  
  const { addToCart, cart } = useStore();
  const { toast } = useToast();

  const getQtyInCart = (productId: number) => {
    return cart.find(item => item.product.id === productId)?.quantity || 0;
  };

  const handleAdd = (product: Product) => {
    addToCart(product, 1);
    toast({
      title: "Added to cart",
      description: `${product.name} added.`,
      duration: 1000,
    });
  };

  return (
    <MobileShell title="Catalog">
      <div className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 pb-4 pt-1">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
          <Input 
            placeholder="Search BigCommerce inventory..." 
            className="pl-10 bg-white dark:bg-slate-800"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
        {products?.map((product) => (
          <div key={product.id} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border overflow-hidden flex flex-col h-full">
            <div className="relative aspect-video sm:aspect-square bg-slate-100">
              <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
              {product.is_pinned && (
                <Badge className="absolute top-2 left-2 bg-primary text-white hover:bg-primary">
                  Featured
                </Badge>
              )}
              <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                {product.stock_level} in stock
              </div>
            </div>
            
            <div className="p-4 flex-1 flex flex-col">
              <div className="mb-2">
                <h3 className="font-bold text-lg leading-tight line-clamp-2">{product.name}</h3>
                <p className="text-xs text-slate-500 mt-1">SKU: {product.sku}</p>
              </div>
              
              <p className="text-sm text-slate-600 line-clamp-2 mb-4 flex-1">
                {product.description}
              </p>

              <div className="flex items-center justify-between mt-auto pt-4 border-t">
                <span className="text-xl font-bold text-slate-900 dark:text-white">
                  ${product.price.toFixed(2)}
                </span>
                
                <Button 
                  size="sm" 
                  onClick={() => handleAdd(product)}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add
                  {getQtyInCart(product.id) > 0 && (
                    <Badge variant="secondary" className="ml-1 px-1.5 h-5 min-w-[1.25rem]">
                      {getQtyInCart(product.id)}
                    </Badge>
                  )}
                </Button>
              </div>
            </div>
          </div>
        ))}
        {products?.length === 0 && (
          <div className="col-span-full text-center py-10 text-slate-500">
            No products found matching "{search}"
          </div>
        )}
      </div>
    </MobileShell>
  );
}
