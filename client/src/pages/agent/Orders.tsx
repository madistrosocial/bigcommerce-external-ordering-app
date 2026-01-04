import { MobileShell } from "@/components/layout/MobileShell";
import { db } from "@/lib/db";
import { useStore } from "@/lib/store";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2, CloudOff } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function Orders() {
  const { currentUser } = useStore();
  const orders = useLiveQuery(
    () => db.orders
      .where('created_by_user_id')
      .equals(currentUser?.id || 0)
      .reverse()
      .sortBy('date'),
    [currentUser]
  );

  return (
    <MobileShell title="Order History">
      <div className="space-y-4">
        {orders?.map((order) => (
          <Card key={order.id} className="overflow-hidden">
            <Accordion type="single" collapsible>
              <AccordionItem value="details" className="border-0">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex flex-col items-start w-full gap-2">
                    <div className="flex items-center justify-between w-full">
                      <span className="font-bold text-lg">{order.customer_name}</span>
                      <Badge 
                        variant={order.status === 'synced' ? 'default' : 'destructive'} 
                        className={order.status === 'synced' ? "bg-green-600 hover:bg-green-700" : "bg-orange-500 hover:bg-orange-600"}
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
                        {format(new Date(order.date), "MMM d, h:mm a")}
                      </span>
                      <span className="font-bold text-slate-900">${order.total.toFixed(2)}</span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="bg-slate-50 px-4 py-3 border-t">
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-500 uppercase">Order Items</p>
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="truncate flex-1 pr-4">
                          {item.quantity}x {item.name}
                        </span>
                        <span>${(item.price_at_sale * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                    {order.bigcommerce_order_id && (
                      <div className="mt-4 pt-2 border-t text-xs text-slate-400 text-center">
                        BigCommerce Order ID: #{order.bigcommerce_order_id}
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Card>
        ))}

        {orders?.length === 0 && (
          <div className="text-center py-10 text-slate-500">
            No orders found.
          </div>
        )}
      </div>
    </MobileShell>
  );
}
