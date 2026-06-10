import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { getAuthHeaders } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Building2, User, Mail, Phone, Hash, TrendingUp, ShoppingBag, Calendar, DollarSign } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

function fmtCurrency(v: string | number | null): string {
  if (v == null) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(v));
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return format(new Date(d), "MMM d, yyyy");
}

function statusColor(status: string | null): string {
  if (!status) return "secondary";
  const s = status.toLowerCase();
  if (s.includes("complete") || s.includes("shipped")) return "default";
  if (s.includes("cancel") || s.includes("refund")) return "destructive";
  if (s.includes("pending") || s.includes("awaiting")) return "secondary";
  return "outline";
}

export default function CustomerProfile() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const id = parseInt(params.id);

  const { data: customer, isLoading: loadingCustomer } = useQuery({
    queryKey: ["crm", "customer", id],
    queryFn: async () => {
      const r = await fetch(`/api/crm/customers/${id}`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Customer not found");
      return r.json();
    },
    enabled: !!id,
  });

  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ["crm", "customer", id, "orders"],
    queryFn: async () => {
      const r = await fetch(`/api/crm/customers/${id}/orders`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Failed to load orders");
      return r.json();
    },
    enabled: !!id,
  });

  if (loadingCustomer) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Loading customer…</div>
    );
  }

  if (!customer) {
    return (
      <div className="p-6">
        <p className="text-slate-500">Customer not found.</p>
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setLocation("/crm/customers")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
        </Button>
      </div>
    );
  }

  const avgOrderValue = customer.lifetime_orders > 0
    ? Number(customer.lifetime_revenue) / customer.lifetime_orders
    : 0;

  const daysSince = customer.last_order_date
    ? Math.floor((Date.now() - new Date(customer.last_order_date).getTime()) / 86_400_000)
    : null;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      {/* Back button */}
      <Button variant="ghost" size="sm" className="-ml-1" onClick={() => setLocation("/crm/customers")} data-testid="btn-back-customers">
        <ArrowLeft className="h-4 w-4 mr-1.5" /> All Customers
      </Button>

      {/* Header Card */}
      <div className="border rounded-xl p-5 bg-white shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="h-14 w-14 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <User className="h-7 w-7 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            {customer.company && (
              <div className="flex items-center gap-1.5 text-slate-500 text-sm mb-0.5">
                <Building2 className="h-3.5 w-3.5" />
                <span className="font-medium text-slate-700">{customer.company}</span>
              </div>
            )}
            <h1 className="text-xl font-bold text-slate-900">
              {[customer.first_name, customer.last_name].filter(Boolean).join(" ") || "—"}
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500">
              {customer.email && (
                <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{customer.email}</span>
              )}
              {customer.phone && (
                <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{customer.phone}</span>
              )}
              <span className="flex items-center gap-1.5">
                <Hash className="h-3.5 w-3.5" />BC ID: {customer.bigcommerce_customer_id}
              </span>
            </div>
            {customer.sales_rep_name && (
              <div className="mt-2">
                <Badge variant="secondary">Assigned: {customer.sales_rep_name}</Badge>
              </div>
            )}
          </div>
          {daysSince != null && (
            <div className={`text-right text-sm shrink-0 ${daysSince > 90 ? "text-red-500" : daysSince > 30 ? "text-amber-500" : "text-green-600"}`}>
              <p className="text-2xl font-bold">{daysSince}d</p>
              <p className="text-xs">since last order</p>
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-green-500" />
              <span className="text-xs text-slate-500">Lifetime Revenue</span>
            </div>
            <p className="text-xl font-bold text-slate-900" data-testid="text-lifetime-revenue">{fmtCurrency(customer.lifetime_revenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingBag className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-slate-500">Lifetime Orders</span>
            </div>
            <p className="text-xl font-bold text-slate-900" data-testid="text-lifetime-orders">{(customer.lifetime_orders ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-slate-500">Avg Order Value</span>
            </div>
            <p className="text-xl font-bold text-slate-900">{fmtCurrency(avgOrderValue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-slate-500">Last Order</span>
            </div>
            <p className="text-sm font-bold text-slate-900" data-testid="text-last-order-date">{fmtDate(customer.last_order_date)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Orders */}
      <div className="border rounded-xl bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50">
          <h2 className="font-semibold text-slate-700 text-sm">Recent Orders (last 20)</h2>
        </div>
        {loadingOrders ? (
          <div className="flex items-center justify-center h-24 text-slate-400 text-sm">Loading orders…</div>
        ) : orders.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-slate-400 text-sm">No orders found in mirror.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Order #</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Date</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o: any) => (
                  <tr key={o.id} data-testid={`row-order-${o.bigcommerce_order_id}`} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <button
                        className="text-blue-600 hover:underline font-mono text-xs"
                        onClick={() => window.open(`/orders/bc`, "_blank")}
                      >
                        #{o.order_number ?? o.bigcommerce_order_id}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{fmtDate(o.order_date)}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={statusColor(o.status) as any} className="text-xs capitalize">
                        {o.status ?? "—"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-800">{fmtCurrency(o.order_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
