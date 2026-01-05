import { MobileShell } from "@/components/layout/MobileShell";
import { useStore } from "@/lib/store";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2, CloudOff } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import * as api from "@/lib/api";

export default function Orders() {
  const { currentUser } = useStore();
  
  const { data: orders = [] } = useQuery({ 
    queryKey: ['orders', currentUser?.id], 
    queryFn: () => api.getOrdersByUser(currentUser?.id || 0),
    enabled: !!currentUser
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
                      <Badge 
                        variant={order.status === 'synced' ? 'default' : 'destructive'} 
                        className={order.status === 'synced' ? "bg-green-600 hover:bg-green-700" : "bg-orange-500 hover:bg-orange-600"}
                        data-testid={`badge-status-${order.id}`}
                      >
                        {order.status === 'synced' ? (
                          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Synced</span>
                        ) : (
                          <span className="flex items-center gap-1"><CloudOff className="h-3 w-3" /> Pending</span>
                        )}
                      </Badge>
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
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-500 uppercase">Order Items</p>
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm" data-testid={`order-item-${order.id}-${idx}`}>
                        <span className="truncate flex-1 pr-4">
                          {item.quantity}x {item.name}
                        </span>
                        <span>${(parseFloat(item.price_at_sale) * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                    {order.bigcommerce_order_id && (
                      <div className="mt-4 pt-2 border-t text-xs text-slate-400 text-center" data-testid={`bc-order-id-${order.id}`}>
                        BigCommerce Order ID: #{order.bigcommerce_order_id}
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
