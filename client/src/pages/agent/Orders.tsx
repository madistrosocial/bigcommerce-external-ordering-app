import { MobileShell } from "@/components/layout/MobileShell";
import { useStore } from "@/lib/store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock, CheckCircle2, CloudOff, AlertCircle, FileText, Send, Loader2, Search, Edit, User } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import * as api from "@/lib/api";

function getStatusBadge(order: api.Order) {
  switch (order.status) {
    case 'synced':
      return (
        <Badge className="bg-green-600 hover:bg-green-700">
          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Synced</span>
        </Badge>
      );
    case 'pending_sync':
      return (
        <Badge className="bg-orange-500 hover:bg-orange-600">
          <span className="flex items-center gap-1"><CloudOff className="h-3 w-3" /> Pending</span>
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="destructive">
          <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Failed</span>
        </Badge>
      );
    case 'draft':
      return (
        <Badge className="bg-slate-500 hover:bg-slate-600">
          <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> Draft</span>
        </Badge>
      );
    default:
      return (
        <Badge variant="outline">
          <span>{order.status}</span>
        </Badge>
      );
  }
}

export default function Orders() {
  const { currentUser, isOfflineMode } = useStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [editingDraft, setEditingDraft] = useState<api.Order | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<api.BigCommerceCustomer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<api.BigCommerceCustomer | null>(null);
  const [customerAddresses, setCustomerAddresses] = useState<any[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<any | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { data: orders = [] } = useQuery({ 
    queryKey: ['orders', currentUser?.id], 
    queryFn: () => api.getOrdersByUser(currentUser?.id || 0),
    enabled: !!currentUser
  });

  const openDraftEdit = (order: api.Order) => {
    setEditingDraft(order);
    setCustomerName(order.customer_name);
    setCustomerEmail(order.customer_email || "");
    setCustomerSearchQuery("");
    setSearchResults([]);
    setSelectedCustomer(null);
    setCustomerAddresses([]);
    setSelectedAddress(null);
  };

  const closeDraftEdit = () => {
    setEditingDraft(null);
    setSelectedCustomer(null);
    setSelectedAddress(null);
    setSearchResults([]);
  };

  const handleCustomerSearch = async () => {
    if (!customerSearchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const results = await api.searchBigCommerceCustomers(customerSearchQuery.trim());
      setSearchResults(results);
      if (results.length === 0) {
        toast({ title: "No customers found", description: "Try a different search term." });
      }
    } catch (error: any) {
      toast({ title: "Search failed", description: error.message, variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectCustomer = async (customer: api.BigCommerceCustomer) => {
    setSelectedCustomer(customer);
    setSelectedAddress(null);
    
    try {
      const addresses = await api.getCustomerAddresses(customer.id);
      setCustomerAddresses(addresses);
      if (addresses.length === 1) {
        setSelectedAddress(addresses[0]);
      }
    } catch (error: any) {
      toast({ title: "Failed to load addresses", description: error.message, variant: "destructive" });
      setCustomerAddresses([]);
    }
  };

  const handleSubmitDraft = async () => {
    if (!editingDraft || !selectedCustomer || !selectedAddress) {
      toast({ title: "Please select a customer and address", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
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

      const response = await api.submitDraftOrder(editingDraft.id!, {
        bigcommerce_customer_id: selectedCustomer.id,
        billing_address: billingAddress
      });

      queryClient.invalidateQueries({ queryKey: ['orders'] });
      
      if (response.bigcommerce?.success) {
        toast({
          title: "Order Submitted Successfully",
          description: `BigCommerce Order #${response.bigcommerce.order_id}`,
        });
        closeDraftEdit();
      } else {
        toast({
          title: "Order Submission Failed",
          description: response.bigcommerce?.error || "Unknown error",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      toast({
        title: "Submission Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const tryAutoSubmit = async (order: api.Order) => {
    setIsSubmitting(true);
    try {
      const email = order.customer_email;
      const name = order.customer_name;

      let customers: api.BigCommerceCustomer[] = [];
      if (email) {
        customers = await api.searchBigCommerceCustomers(email);
      }
      if (customers.length === 0 && name) {
        customers = await api.searchBigCommerceCustomers(name);
      }

      if (customers.length === 0) {
        openDraftEdit(order);
        toast({
          title: "Customer Not Found",
          description: "Please search and select a customer manually.",
          variant: "default"
        });
        return;
      }

      const customer = customers[0];
      const addresses = await api.getCustomerAddresses(customer.id);
      
      if (addresses.length === 0) {
        openDraftEdit(order);
        setSelectedCustomer(customer);
        toast({
          title: "No Address Found",
          description: "Customer has no addresses. Please select a different customer.",
          variant: "default"
        });
        return;
      }

      const addr = addresses[0];
      const billingAddress = {
        first_name: addr.first_name,
        last_name: addr.last_name,
        company: addr.company,
        street_1: addr.street_1,
        street_2: addr.street_2,
        city: addr.city,
        state: addr.state,
        zip: addr.zip,
        country: addr.country,
        country_iso2: addr.country_iso2,
        email: customer.email,
        phone: addr.phone || customer.phone
      };

      const response = await api.submitDraftOrder(order.id!, {
        bigcommerce_customer_id: customer.id,
        billing_address: billingAddress
      });

      queryClient.invalidateQueries({ queryKey: ['orders'] });
      
      if (response.bigcommerce?.success) {
        toast({
          title: "Order Submitted Successfully",
          description: `BigCommerce Order #${response.bigcommerce.order_id}`,
        });
      } else {
        toast({
          title: "Order Submission Failed",
          description: response.bigcommerce?.error || "Unknown error",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      openDraftEdit(order);
      toast({
        title: "Auto-submit Failed",
        description: "Please search and select a customer manually.",
        variant: "default"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MobileShell title="Order History">
      <div className="space-y-4">
        {orders.map((order) => (
          <Card key={order.id} className="overflow-hidden" data-testid={`order-${order.id}`}>
            <Accordion type="single" collapsible>
              <AccordionItem value="details" className="border-0">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex flex-col items-start w-full gap-2">
                    <div className="flex items-center justify-between w-full">
                      <span className="font-bold text-lg">{order.customer_name}</span>
                      {getStatusBadge(order)}
                    </div>
                    <div className="flex items-center justify-between w-full text-sm text-slate-500 font-normal">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {order.date && format(new Date(order.date), "MMM d, h:mm a")}
                      </span>
                      <span className="font-bold text-slate-900" data-testid={`total-${order.id}`}>${parseFloat(order.total).toFixed(2)}</span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="bg-slate-50 px-4 py-3 border-t">
                  <div className="space-y-3">
                    {order.sync_error && (
                      <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700" data-testid={`error-${order.id}`}>
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <div>
                            <div className="font-medium">Sync Error</div>
                            <div className="text-xs mt-1">{order.sync_error}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {order.order_note && (
                      <div className="p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700" data-testid={`note-${order.id}`}>
                        <div className="flex items-start gap-2">
                          <FileText className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <div>
                            <div className="font-medium">Order Note</div>
                            <div className="text-xs mt-1">{order.order_note}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase mb-2">Order Items</p>
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm" data-testid={`order-item-${order.id}-${idx}`}>
                          <span className="truncate flex-1 pr-4">
                            {item.quantity}x {item.name}
                          </span>
                          <span>${(parseFloat(item.price_at_sale) * item.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>

                    {order.bigcommerce_order_id && (
                      <div className="pt-2 border-t text-xs text-slate-400 text-center" data-testid={`bc-order-id-${order.id}`}>
                        BigCommerce Order ID: #{order.bigcommerce_order_id}
                      </div>
                    )}

                    {order.status === 'draft' && !isOfflineMode && (
                      <div className="pt-2 border-t space-y-2">
                        <Button
                          className="w-full"
                          onClick={() => tryAutoSubmit(order)}
                          disabled={isSubmitting}
                          data-testid={`button-submit-draft-${order.id}`}
                        >
                          {isSubmitting ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Send className="h-4 w-4 mr-2" />
                          )}
                          Submit to BigCommerce
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => openDraftEdit(order)}
                          data-testid={`button-edit-draft-${order.id}`}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Customer Details
                        </Button>
                      </div>
                    )}

                    {order.status === 'draft' && isOfflineMode && (
                      <div className="pt-2 border-t text-center text-xs text-orange-600">
                        Go online to submit this draft order
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Card>
        ))}

        {orders.length === 0 && (
          <div className="text-center py-10 text-slate-500" data-testid="text-no-orders">
            No orders found.
          </div>
        )}
      </div>

      <Dialog open={!!editingDraft} onOpenChange={(open) => !open && closeDraftEdit()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Draft Order</DialogTitle>
            <DialogDescription>
              Search for a BigCommerce customer to submit this order.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Customer Name (from draft)</Label>
              <Input 
                value={customerName} 
                onChange={(e) => setCustomerName(e.target.value)}
                data-testid="input-draft-customer-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Customer Email (from draft)</Label>
              <Input 
                value={customerEmail} 
                onChange={(e) => setCustomerEmail(e.target.value)}
                data-testid="input-draft-customer-email"
              />
            </div>

            <div className="border-t pt-4">
              <Label className="mb-2 block">Search BigCommerce Customers</Label>
              <div className="flex gap-2">
                <Input 
                  placeholder="Search by name or email..."
                  value={customerSearchQuery}
                  onChange={(e) => setCustomerSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCustomerSearch()}
                  data-testid="input-customer-search"
                />
                <Button 
                  onClick={handleCustomerSearch}
                  disabled={isSearching}
                  data-testid="button-customer-search"
                >
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-2">
                <Label>Select Customer</Label>
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {searchResults.map((customer) => (
                    <div
                      key={customer.id}
                      className={`p-3 border rounded cursor-pointer transition-colors ${
                        selectedCustomer?.id === customer.id 
                          ? 'border-primary bg-primary/5' 
                          : 'hover:bg-slate-50'
                      }`}
                      onClick={() => handleSelectCustomer(customer)}
                      data-testid={`customer-option-${customer.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-slate-400" />
                        <div>
                          <div className="font-medium text-sm">
                            {customer.first_name} {customer.last_name}
                          </div>
                          <div className="text-xs text-slate-500">{customer.email}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedCustomer && customerAddresses.length > 0 && (
              <div className="space-y-2">
                <Label>Select Shipping Address</Label>
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {customerAddresses.map((addr, idx) => (
                    <div
                      key={idx}
                      className={`p-3 border rounded cursor-pointer transition-colors ${
                        selectedAddress === addr 
                          ? 'border-primary bg-primary/5' 
                          : 'hover:bg-slate-50'
                      }`}
                      onClick={() => setSelectedAddress(addr)}
                      data-testid={`address-option-${idx}`}
                    >
                      <div className="text-sm">
                        <div className="font-medium">{addr.first_name} {addr.last_name}</div>
                        <div className="text-xs text-slate-500">
                          {addr.street_1}, {addr.city}, {addr.state} {addr.zip}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedCustomer && customerAddresses.length === 0 && (
              <div className="p-3 bg-orange-50 border border-orange-200 rounded text-sm text-orange-700">
                This customer has no shipping addresses in BigCommerce. Please add one or select a different customer.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDraftEdit}>Cancel</Button>
            <Button 
              onClick={handleSubmitDraft}
              disabled={!selectedCustomer || !selectedAddress || isSubmitting}
              data-testid="button-submit-edited-draft"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Submit Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MobileShell>
  );
}
