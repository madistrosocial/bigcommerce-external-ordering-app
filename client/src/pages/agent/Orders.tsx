import { MobileShell } from "@/components/layout/MobileShell";
import { useStore } from "@/lib/store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, CheckCircle2, CloudOff, AlertCircle, FileText, Send, Loader2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
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
  
  const { data: orders = [] } = useQuery({ 
    queryKey: ['orders', currentUser?.id], 
    queryFn: () => api.getOrdersByUser(currentUser?.id || 0),
    enabled: !!currentUser
  });

  const submitDraftMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const order = orders.find(o => o.id === orderId);
      if (!order) throw new Error('Order not found');

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
        throw new Error('No matching customer found in BigCommerce. Please search and select a customer manually.');
      }

      const customer = customers[0];
      const addresses = await api.getCustomerAddresses(customer.id);
      
      if (addresses.length === 0) {
        throw new Error('Customer has no shipping addresses. Please add an address in BigCommerce first.');
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

      return api.submitDraftOrder(orderId, {
        bigcommerce_customer_id: customer.id,
        billing_address: billingAddress
      });
    },
    onSuccess: (response) => {
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
    },
    onError: (error: Error) => {
      toast({
        title: "Submission Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

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
                      <div className="pt-2 border-t">
                        <Button
                          className="w-full"
                          onClick={() => submitDraftMutation.mutate(order.id!)}
                          disabled={submitDraftMutation.isPending}
                          data-testid={`button-submit-draft-${order.id}`}
                        >
                          {submitDraftMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Send className="h-4 w-4 mr-2" />
                          )}
                          Submit to BigCommerce
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
    </MobileShell>
  );
}
