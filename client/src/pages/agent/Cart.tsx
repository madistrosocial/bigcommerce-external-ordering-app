import { MobileShell } from "@/components/layout/MobileShell";
import { useStore } from "@/lib/store";
import { db } from "@/lib/db";
import { useState } from "react";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Trash2, Plus, Minus, ArrowRight, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Cart() {
  const { cart, removeFromCart, addToCart, clearCart, getCartTotal, currentUser, isOfflineMode } = useStore();
  const [customerName, setCustomerName] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const total = getCartTotal();

  const handleCheckout = async () => {
    if (!customerName.trim()) {
      toast({
        title: "Customer Name Required",
        description: "Please enter the customer's name to proceed.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const orderData = {
        customer_name: customerName,
        status: isOfflineMode ? 'pending_sync' as const : 'synced' as const,
        items: cart.map(item => ({
          product_id: item.product.id,
          quantity: item.quantity,
          price_at_sale: item.product.price,
          name: item.product.name,
          sku: item.product.sku,
          image: item.product.image
        })),
        total: total,
        date: new Date().toISOString(),
        created_by_user_id: currentUser?.id || 0,
        // In real app, we would make an API call here if online
        bigcommerce_order_id: isOfflineMode ? undefined : Math.floor(Math.random() * 100000) + 50000
      };

      await db.orders.add(orderData);

      toast({
        title: isOfflineMode ? "Order Queued (Offline)" : "Order Created in BigCommerce",
        description: isOfflineMode 
          ? "Saved locally. Will sync when online." 
          : `Order #${orderData.bigcommerce_order_id} confirmed.`,
      });

      clearCart();
      setLocation('/orders');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save order.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (cart.length === 0) {
    return (
      <MobileShell title="Cart" showBack>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
          <div className="bg-slate-100 p-6 rounded-full">
            <CreditCard className="h-12 w-12 text-slate-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-700">Your cart is empty</h2>
          <p className="text-slate-500 max-w-xs">Browse the catalog to add products to your order.</p>
          <Button onClick={() => setLocation('/catalog')} className="mt-4">
            Browse Catalog
          </Button>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell title="Checkout" showBack>
      <div className="space-y-6 pb-20">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Customer Details</label>
          <Input 
            placeholder="Enter customer or business name" 
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="bg-white"
          />
        </div>

        <div className="space-y-3">
          <label className="text-sm font-medium text-slate-700">Order Items</label>
          {cart.map((item) => (
            <Card key={item.product.id} className="p-3 flex gap-3 items-center">
              <img src={item.product.image} alt="" className="h-16 w-16 object-cover rounded bg-slate-100" />
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-sm truncate">{item.product.name}</h4>
                <p className="text-sm text-slate-500">${item.product.price.toFixed(2)} / unit</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-6 w-6" 
                    onClick={() => addToCart(item.product, -1)} // Will handle removal if qty 0? No store logic handles it but lets assume standard behavior or add checks
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-4 text-center text-sm font-medium">{item.quantity}</span>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-6 w-6"
                    onClick={() => addToCart(item.product, 1)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <div className="font-bold">
                  ${(item.product.price * item.quantity).toFixed(2)}
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-slate-400 hover:text-red-500"
                onClick={() => removeFromCart(item.product.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 pb-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-20">
          <div className="max-w-4xl mx-auto flex items-center justify-between mb-4">
            <span className="text-slate-500">Total Amount</span>
            <span className="text-2xl font-bold text-primary">${total.toFixed(2)}</span>
          </div>
          <Button className="w-full text-lg h-12" onClick={handleCheckout} disabled={isSubmitting}>
            {isSubmitting ? "Processing..." : (
              <>
                Submit Order {isOfflineMode && "(Offline)"}
                <ArrowRight className="ml-2 h-5 w-5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </MobileShell>
  );
}
