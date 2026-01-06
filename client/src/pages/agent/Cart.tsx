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

  const handleCheckout = async () => {
    if (!customerName.trim()) {
      toast({ title: "Customer Name Required", variant: "destructive" });
      return;
    }

    const orderData = {
      customer_name: customerName,
      status: 'pending_sync' as const,
      items: cart.map(item => ({
        product_id: item.product.id,
        bigcommerce_product_id: item.product.bigcommerce_id,
        variant_id: item.variant?.id,
        variant_option_values: item.variant?.option_values,
        quantity: item.quantity,
        price_at_sale: item.variant?.price || item.product.price,
        name: item.variant ? `${item.product.name} (${item.variant.sku})` : item.product.name,
        sku: item.variant?.sku || item.product.sku,
        image: item.product.image
      })),
      total: total.toFixed(2),
      created_by_user_id: currentUser?.id || 0
    };

    try {
      const response = await api.createOrder(orderData);
      
      // Handle new response format with BigCommerce and Google Sheets status
      const bcSuccess = response.bigcommerce?.success || false;
      const sheetsSuccess = response.google_sheets?.success || false;
      
      if (bcSuccess) {
        toast({
          title: "Order Created Successfully",
          description: `BigCommerce Order #${response.bigcommerce.order_id}${sheetsSuccess ? ' (Logged to Sheets)' : ''}`,
        });
      } else {
        // Show failure but confirm local save
        const errorMsg = response.bigcommerce?.error || "BigCommerce sync failed";
        toast({
          title: "Order Saved Locally",
          description: `${errorMsg}${sheetsSuccess ? ' - Logged to Sheets' : ''}`,
          variant: "destructive"
        });
      }
      
      clearCart();
      setLocation('/orders');
    } catch (e: any) {
      toast({ title: "Error creating order", description: e.message, variant: "destructive" });
    }
  };

  if (cart.length === 0) {
    return (
      <MobileShell title="Cart" showBack>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center">
          <CreditCard className="h-12 w-12 text-slate-400 mb-4" />
          <h2 className="text-xl font-bold">Your cart is empty</h2>
          <Button onClick={() => setLocation('/catalog')} className="mt-4">Browse Catalog</Button>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell title="Checkout" showBack>
      <div className="space-y-6 pb-20">
        <Input placeholder="Customer Name" value={customerName} onChange={e => setCustomerName(e.target.value)} />
        
        <div className="space-y-3">
          {cart.map((item, idx) => (
            <Card key={`${item.product.id}-${item.variant?.id || idx}`} className="p-3 flex gap-3 items-center">
              <img src={item.product.image} className="h-12 w-12 object-cover rounded" alt="" />
              <div className="flex-1">
                <h4 className="font-bold text-sm">{item.product.name}</h4>
                {item.variant && <p className="text-xs text-slate-500">{item.variant.sku}</p>}
                <p className="text-sm">${parseFloat(item.variant?.price || item.product.price).toFixed(2)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateCartQuantity(item.product.id, -1, item.variant?.id)}><Minus className="h-3 w-3"/></Button>
                <span className="text-sm w-4 text-center">{item.quantity}</span>
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateCartQuantity(item.product.id, 1, item.variant?.id)}><Plus className="h-3 w-3"/></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => removeFromCart(item.product.id, item.variant?.id)}><Trash2 className="h-4 w-4"/></Button>
              </div>
            </Card>
          ))}
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white p-4 border-t flex justify-between items-center">
          <span className="font-bold text-xl">${total.toFixed(2)}</span>
          <Button onClick={handleCheckout}>Submit Order</Button>
        </div>
      </div>
    </MobileShell>
  );
}
