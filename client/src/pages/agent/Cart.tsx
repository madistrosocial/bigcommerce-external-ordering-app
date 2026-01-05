import { MobileShell } from "@/components/layout/MobileShell";
import { useStore } from "@/lib/store";
import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Trash2, Plus, Minus, ArrowRight, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";

export default function Cart() {
  const { cart, removeFromCart, updateCartQuantity, clearCart, getCartTotal, currentUser, isOfflineMode } = useStore();
  const [customerName, setCustomerName] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const total = getCartTotal();

  const createOrderMutation = useMutation({
    mutationFn: api.createOrder,
    onSuccess: (order) => {
      toast({
        title: order.status === 'pending_sync' ? "Order Queued (Offline)" : "Order Created",
        description: order.status === 'pending_sync'
          ? "Saved locally. Will sync when online." 
          : `Order #${order.bigcommerce_order_id} confirmed.`,
      });
      clearCart();
      setLocation('/orders');
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save order.",
        variant: "destructive",
      });
    }
  });

  const handleCheckout = async () => {
    if (!customerName.trim()) {
      toast({
        title: "Customer Name Required",
        description: "Please enter the customer's name to proceed.",
        variant: "destructive",
      });
      return;
    }

    const orderData = {
      customer_name: customerName,
      status: (isOfflineMode ? 'pending_sync' : 'synced') as 'pending_sync' | 'synced',
      items: cart.map(item => ({
        product_id: item.product.id,
        quantity: item.quantity,
        price_at_sale: item.product.price,
        name: item.product.name,
        sku: item.product.sku,
        image: item.product.image
      })),
      total: total.toFixed(2),
      created_by_user_id: currentUser?.id || 0,
      bigcommerce_order_id: isOfflineMode ? undefined : Math.floor(Math.random() * 100000) + 50000
    };

    createOrderMutation.mutate(orderData);
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
          <Button onClick={() => setLocation('/catalog')} className="mt-4" data-testid="button-browse">
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
            data-testid="input-customer-name"
          />
        </div>

        <div className="space-y-3">
          <label className="text-sm font-medium text-slate-700">Order Items</label>
          {cart.map((item) => (
            <Card key={item.product.id} className="p-3 flex gap-3 items-center" data-testid={`cart-item-${item.product.id}`}>
              <img src={item.product.image} alt="" className="h-16 w-16 object-cover rounded bg-slate-100" />
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-sm truncate">{item.product.name}</h4>
                <p className="text-sm text-slate-500">${parseFloat(item.product.price).toFixed(2)} / unit</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-6 w-6" 
                    onClick={() => updateCartQuantity(item.product.id, -1)}
                    data-testid={`button-decrease-${item.product.id}`}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-4 text-center text-sm font-medium" data-testid={`qty-${item.product.id}`}>{item.quantity}</span>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-6 w-6"
                    onClick={() => updateCartQuantity(item.product.id, 1)}
                    data-testid={`button-increase-${item.product.id}`}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <div className="font-bold" data-testid={`subtotal-${item.product.id}`}>
                  ${(parseFloat(item.product.price) * item.quantity).toFixed(2)}
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-slate-400 hover:text-red-500"
                onClick={() => removeFromCart(item.product.id)}
                data-testid={`button-remove-${item.product.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 pb-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-20">
          <div className="max-w-4xl mx-auto flex items-center justify-between mb-4">
            <span className="text-slate-500">Total Amount</span>
            <span className="text-2xl font-bold text-primary" data-testid="text-total">${total.toFixed(2)}</span>
          </div>
          <Button 
            className="w-full text-lg h-12" 
            onClick={handleCheckout} 
            disabled={createOrderMutation.isPending}
            data-testid="button-submit-order"
          >
            {createOrderMutation.isPending ? "Processing..." : (
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
