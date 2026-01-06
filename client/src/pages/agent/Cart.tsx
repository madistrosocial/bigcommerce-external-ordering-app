import { MobileShell } from "@/components/layout/MobileShell";
import { useStore } from "@/lib/store";
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, Minus, CreditCard, Search, MapPin, User, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";

export default function Cart() {
  const { cart, removeFromCart, updateCartQuantity, clearCart, getCartTotal, currentUser } = useStore();
  const [customerSearch, setCustomerSearch] = useState("");
  const [searchResults, setSearchResults] = useState<api.BigCommerceCustomer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<api.BigCommerceCustomer | null>(null);
  const [customerAddresses, setCustomerAddresses] = useState<api.BigCommerceAddress[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<api.BigCommerceAddress | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const total = getCartTotal();

  const debounce = (fn: Function, ms: number) => {
    let timeout: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), ms);
    };
  };

  const searchCustomers = useCallback(
    debounce(async (query: string) => {
      if (query.length < 2) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const results = await api.searchBigCommerceCustomers(query);
        setSearchResults(results);
        setShowResults(true);
      } catch (e) {
        console.error('Customer search error:', e);
      } finally {
        setIsSearching(false);
      }
    }, 300),
    []
  );

  useEffect(() => {
    if (customerSearch && !selectedCustomer) {
      searchCustomers(customerSearch);
    }
  }, [customerSearch]);

  const handleSelectCustomer = async (customer: api.BigCommerceCustomer) => {
    setSelectedCustomer(customer);
    setCustomerSearch(`${customer.first_name} ${customer.last_name}`);
    setShowResults(false);
    setSearchResults([]);

    try {
      const addresses = await api.getCustomerAddresses(customer.id);
      setCustomerAddresses(addresses);
      if (addresses.length > 0) {
        setSelectedAddress(addresses[0]);
      }
    } catch (e) {
      console.error('Failed to load addresses:', e);
    }
  };

  const handleCheckout = async () => {
    if (!selectedCustomer) {
      toast({ title: "Please select a customer", variant: "destructive" });
      return;
    }

    if (!selectedAddress) {
      toast({ title: "Please select a shipping address", description: "A valid shipping address is required for checkout.", variant: "destructive" });
      return;
    }

    const billingAddress = {
      first_name: selectedAddress.first_name,
      last_name: selectedAddress.last_name,
      company: selectedAddress.company,
      street_1: selectedAddress.street_1,
      street_2: selectedAddress.street_2,
      city: selectedAddress.city,
      state: selectedAddress.state,
      zip: selectedAddress.zip,
      country: selectedAddress.country,
      country_iso2: selectedAddress.country_iso2,
      email: selectedCustomer.email,
      phone: selectedAddress.phone || selectedCustomer.phone
    };

    const orderData = {
      customer_name: `${selectedCustomer.first_name} ${selectedCustomer.last_name}`,
      status: 'pending_sync' as const,
      bigcommerce_customer_id: selectedCustomer.id,
      billing_address: billingAddress,
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
      
      const bcSuccess = response.bigcommerce?.success || false;
      const sheetsSuccess = response.google_sheets?.success || false;
      
      if (bcSuccess) {
        toast({
          title: "Order Created Successfully",
          description: `BigCommerce Order #${response.bigcommerce.order_id}${sheetsSuccess ? ' (Logged to Sheets)' : ''}`,
        });
      } else {
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
      <div className="space-y-6 pb-24">
        <div className="space-y-4">
          <div className="relative">
            <Label className="text-xs font-medium text-slate-500 mb-1 block">Customer</Label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Search customer by name or email..." 
                className="pl-9"
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                onFocus={() => {
                  if (selectedCustomer) {
                    setShowResults(false);
                  }
                }}
                data-testid="input-customer-search"
              />
              {isSearching && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-slate-400" />}
            </div>
            
            {showResults && searchResults.length > 0 && (
              <Card className="absolute z-20 w-full mt-1 max-h-48 overflow-auto shadow-lg">
                {searchResults.map(customer => (
                  <div 
                    key={customer.id}
                    className="p-3 hover:bg-slate-50 cursor-pointer border-b last:border-0"
                    onClick={() => handleSelectCustomer(customer)}
                    data-testid={`customer-result-${customer.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-slate-400" />
                      <span className="font-medium">{customer.first_name} {customer.last_name}</span>
                    </div>
                    <div className="text-xs text-slate-500 ml-6">{customer.email}</div>
                  </div>
                ))}
              </Card>
            )}
          </div>

          {selectedCustomer && (
            <Card className="p-3 bg-green-50 border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 text-green-700">
                    <User className="h-4 w-4" />
                    <span className="font-medium">{selectedCustomer.first_name} {selectedCustomer.last_name}</span>
                  </div>
                  <div className="text-xs text-green-600 mt-1">
                    {selectedCustomer.email} {selectedCustomer.phone && `• ${selectedCustomer.phone}`}
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-green-600 hover:text-red-500"
                  onClick={() => {
                    setSelectedCustomer(null);
                    setCustomerAddresses([]);
                    setSelectedAddress(null);
                    setCustomerSearch("");
                  }}
                  data-testid="button-clear-customer"
                >
                  Clear
                </Button>
              </div>
            </Card>
          )}

          {selectedCustomer && customerAddresses.length > 0 && (
            <div>
              <Label className="text-xs font-medium text-slate-500 mb-2 block">Shipping Address</Label>
              <div className="space-y-2">
                {customerAddresses.map(addr => (
                  <Card 
                    key={addr.id}
                    className={`p-3 cursor-pointer transition-colors ${selectedAddress?.id === addr.id ? 'border-primary bg-primary/5' : 'hover:border-slate-300'}`}
                    onClick={() => setSelectedAddress(addr)}
                    data-testid={`address-${addr.id}`}
                  >
                    <div className="flex items-start gap-2">
                      <MapPin className={`h-4 w-4 mt-0.5 ${selectedAddress?.id === addr.id ? 'text-primary' : 'text-slate-400'}`} />
                      <div className="text-sm">
                        <div className="font-medium">{addr.street_1}</div>
                        {addr.street_2 && <div>{addr.street_2}</div>}
                        <div className="text-slate-500">{addr.city}, {addr.state} {addr.zip}</div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {selectedCustomer && customerAddresses.length === 0 && (
            <Card className="p-3 bg-yellow-50 border-yellow-200">
              <div className="flex items-start gap-2 text-yellow-700">
                <MapPin className="h-4 w-4 mt-0.5" />
                <div>
                  <div className="font-medium text-sm">No addresses found</div>
                  <div className="text-xs">This customer has no saved shipping addresses in BigCommerce. Please add an address to their account before placing an order.</div>
                </div>
              </div>
            </Card>
          )}
        </div>
        
        <div className="space-y-3">
          {cart.map((item, idx) => (
            <Card key={`${item.product.id}-${item.variant?.id || idx}`} className="p-3 flex gap-3 items-center">
              <img src={item.product.image} className="h-12 w-12 object-cover rounded" alt="" />
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm leading-tight line-clamp-2">{item.product.name}</h4>
                {item.variant && <p className="text-xs text-slate-500">{item.variant.sku}</p>}
                <p className="text-sm">${parseFloat(item.variant?.price || item.product.price).toFixed(2)}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateCartQuantity(item.product.id, -1, item.variant?.id)}><Minus className="h-3 w-3"/></Button>
                <span className="text-sm w-6 text-center">{item.quantity}</span>
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateCartQuantity(item.product.id, 1, item.variant?.id)}><Plus className="h-3 w-3"/></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => removeFromCart(item.product.id, item.variant?.id)}><Trash2 className="h-4 w-4"/></Button>
              </div>
            </Card>
          ))}
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white p-4 border-t flex justify-between items-center">
          <span className="font-bold text-xl">${total.toFixed(2)}</span>
          <Button onClick={handleCheckout} disabled={!selectedCustomer || !selectedAddress} data-testid="button-submit-order">Submit Order</Button>
        </div>
      </div>
    </MobileShell>
  );
}
