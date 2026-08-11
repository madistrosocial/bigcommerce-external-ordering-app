import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@/lib/store";
import { useLocation } from "wouter";
import { getAllOrders, getUsersSummary, getInventoryPushLogs, UserSummary } from "@/lib/api";
import { Order } from "@shared/schema";
import {
  startOfDay, startOfWeek, startOfMonth, startOfYear,
} from "date-fns";
import {
  ShoppingBag, DollarSign, Clock, FileText, AlertCircle,
  CheckCircle2, Monitor, BookOpen, Settings, Shield, Package2,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTimeService } from "@/hooks/useTimeService";

// ─── Period filter ────────────────────────────────────────────────────────────

type Period = "day" | "week" | "month" | "year" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  day: "Today",
  week: "This Week",
  month: "This Month",
  year: "This Year",
  all: "All Time",
};

function getPeriodStart(period: Period): Date | null {
  const now = new Date();
  switch (period) {
    case "day": return startOfDay(now);
    case "week": return startOfWeek(now, { weekStartsOn: 1 });
    case "month": return startOfMonth(now);
    case "year": return startOfYear(now);
    case "all": return null;
  }
}

function filterByPeriod<T extends { date?: any; created_at?: any }>(items: T[], period: Period, dateKey: "date" | "created_at" = "date"): T[] {
  const start = getPeriodStart(period);
  if (!start) return items;
  return items.filter((item) => {
    const val = item[dateKey];
    if (!val) return false;
    return new Date(val) >= start;
  });
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  iconBg?: string;
  iconColor?: string;
  subtitle?: string;
}

function StatCard({ title, value, icon: Icon, iconBg = "bg-slate-100", iconColor = "text-blue-500", subtitle }: StatCardProps) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2.5 rounded-xl ${iconBg} ${iconColor} shrink-0`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide truncate">{title}</p>
          <p className="text-2xl font-bold text-slate-800 leading-tight" data-testid={`stat-${title.toLowerCase().replace(/\s+/g, "-")}`}>{value}</p>
          {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-600" },
  pending_sync: { label: "Pending", className: "bg-amber-100 text-amber-700" },
  synced: { label: "Synced", className: "bg-green-100 text-green-700" },
  failed: { label: "Failed", className: "bg-red-100 text-red-700" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status] ?? { label: status, className: "bg-slate-100 text-slate-600" };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

// ─── Quick Action ─────────────────────────────────────────────────────────────

interface QuickActionProps {
  label: string;
  icon: React.ElementType;
  path: string;
  description: string;
  color?: string;
}

function QuickAction({ label, icon: Icon, path, description, color = "bg-blue-50 text-blue-600" }: QuickActionProps) {
  const [, setLocation] = useLocation();
  return (
    <button
      onClick={() => setLocation(path)}
      data-testid={`quick-action-${label.toLowerCase().replace(/\s/g, "-")}`}
      className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-slate-300 transition-all text-left w-full"
    >
      <div className={`p-2.5 rounded-lg ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>
      </div>
    </button>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { currentUser } = useStore();
  const fmt = useTimeService();
  const [, setLocation] = useLocation();
  const [period, setPeriod] = useState<Period>("month");

  const isAdmin = currentUser?.role === "admin";

  const { data: allOrders = [], isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ["orders", "all"],
    queryFn: getAllOrders,
    enabled: !!currentUser,
  });

  const { data: usersSummary = [] } = useQuery<UserSummary[]>({
    queryKey: ["users", "summary"],
    queryFn: getUsersSummary,
    enabled: !!currentUser,
    staleTime: 5 * 60 * 1000,
  });

  const { data: allPushLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["inventory-push-logs-dashboard"],
    queryFn: async () => {
      const result = await getInventoryPushLogs({ page: 0, limit: 10000 });
      return result.rows;
    },
  });

  const isLoading = ordersLoading || logsLoading;

  // Apply period filter
  const orders = filterByPeriod(allOrders as any[], period, "date") as Order[];
  const pushLogs = filterByPeriod(allPushLogs as any[], period, "created_at");

  // Order stats
  const totalOrders = orders.length;
  const pending = orders.filter((o) => o.status === "pending_sync").length;
  const drafts = orders.filter((o) => o.status === "draft").length;
  const synced = orders.filter((o) => o.status === "synced").length;
  const failed = orders.filter((o) => o.status === "failed").length;
  const totalPushes = pushLogs.length;

  // Revenue: use stored order total for synced orders
  const revenue = orders
    .filter((o) => o.status === "synced")
    .reduce((sum, o) => sum + parseFloat(String((o as any).total ?? "0")), 0);

  // Group breakdown: map userId → group name (or role as fallback)
  const userGroupMap = new Map<number, string>(
    usersSummary.map((u) => [u.id, u.group_name ?? u.role])
  );
  const groupCounts: Record<string, number> = {};
  const groupRevenue: Record<string, number> = {};
  for (const order of orders) {
    const uid = (order as any).created_by_user_id ?? (order as any).user_id;
    const group = uid ? (userGroupMap.get(uid) ?? "Unknown") : "Unknown";
    if ((order as any).status === "synced") {
      groupCounts[group] = (groupCounts[group] ?? 0) + 1;
      groupRevenue[group] = (groupRevenue[group] ?? 0) + parseFloat(String((order as any).total ?? "0"));
    }
  }
  const groupBreakdown = Object.entries(groupCounts).sort((a, b) => b[1] - a[1]);
  const groupRevenueBreakdown = Object.entries(groupRevenue).sort((a, b) => b[1] - a[1]);

  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime())
    .slice(0, 5);

  const agentQuickActions: QuickActionProps[] = [
    { label: "POS Mode", icon: Monitor, path: "/pos", description: "Full-screen point of sale", color: "bg-blue-50 text-blue-600" },
    { label: "Browse Catalog", icon: BookOpen, path: "/catalog", description: "Search and add products", color: "bg-violet-50 text-violet-600" },
    { label: "Order History", icon: ShoppingBag, path: "/orders", description: "View and sync your orders", color: "bg-emerald-50 text-emerald-600" },
  ];

  const adminQuickActions: QuickActionProps[] = [
    { label: "Admin Console", icon: Settings, path: "/admin", description: "Manage products and agents", color: "bg-blue-50 text-blue-600" },
    { label: "Order History", icon: ShoppingBag, path: "/orders", description: "All orders across agents", color: "bg-emerald-50 text-emerald-600" },
    { label: "Access Control", icon: Shield, path: "/admin/rbac", description: "Roles and permissions", color: "bg-amber-50 text-amber-600" },
  ];

  const quickActions = isAdmin ? adminQuickActions : agentQuickActions;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">

      {/* Welcome + period filter */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            Welcome back, {currentUser?.name?.split(" ")[0] ?? ""}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {isAdmin ? "Here's an overview of all sales activity." : "Here's a summary of your recent activity."}
          </p>
        </div>

        {/* Period dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-medium shrink-0" data-testid="btn-period-filter">
              {PERIOD_LABELS[period]}
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <DropdownMenuItem
                key={p}
                onClick={() => setPeriod(p)}
                className={period === p ? "font-semibold text-blue-600" : ""}
                data-testid={`period-option-${p}`}
              >
                {PERIOD_LABELS[p]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Row 1: Total Orders (with group count breakdown) | Synced Revenue (with group amount breakdown) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Total Orders */}
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-500 shrink-0">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Orders</p>
                <p className="text-2xl font-bold text-slate-800 leading-tight" data-testid="stat-total-orders">
                  {isLoading ? "—" : synced}
                </p>
                {!isLoading && groupBreakdown.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-1">
                    {groupBreakdown.map(([group, count]) => (
                      <span key={group} className="text-[11px] text-slate-500 capitalize">
                        <span className="font-semibold text-slate-700">{count}</span> {group}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Synced Revenue */}
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-500 shrink-0">
                <DollarSign className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Synced Revenue</p>
                <p className="text-2xl font-bold text-slate-800 leading-tight" data-testid="stat-revenue">
                  {isLoading ? "—" : `$${revenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </p>
                {!isLoading && groupRevenueBreakdown.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-1">
                    {groupRevenueBreakdown.map(([group, amt]) => (
                      <span key={group} className="text-[11px] text-slate-500 capitalize">
                        <span className="font-semibold text-slate-700">${amt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> {group}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Drafts, Successful Sync, Failed Sync, Inventory Pushes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          title="Drafts"
          value={isLoading ? "—" : drafts}
          icon={FileText}
          iconBg="bg-slate-100"
          iconColor="text-slate-500"
        />
        <StatCard
          title="Successful Sync"
          value={isLoading ? "—" : synced}
          icon={CheckCircle2}
          iconBg="bg-green-50"
          iconColor="text-green-500"
        />
        <StatCard
          title="Failed Sync"
          value={isLoading ? "—" : failed}
          icon={AlertCircle}
          iconBg="bg-red-50"
          iconColor="text-red-500"
        />
        <StatCard
          title="Inventory Pushes"
          value={isLoading ? "—" : totalPushes}
          icon={Package2}
          iconBg="bg-violet-50"
          iconColor="text-violet-500"
        />
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {quickActions.map((a) => (
            <QuickAction key={a.path} {...a} />
          ))}
        </div>
      </div>

      {/* Recent orders */}
      {recentOrders.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">
              Recent Orders
              {period !== "all" && (
                <span className="ml-2 text-[11px] font-normal text-slate-400">({PERIOD_LABELS[period]})</span>
              )}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-blue-600"
              onClick={() => setLocation("/orders")}
            >
              View all
            </Button>
          </div>
          <Card className="shadow-sm overflow-hidden">
            <div className="divide-y">
              {recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between px-4 py-3"
                  data-testid={`dashboard-order-${order.id}`}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-slate-700">
                      {order.customer_name || "Unknown Customer"}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {order.date ? fmt.dateTime(order.date) : "—"}
                      {isAdmin && order.user_id && (
                        <span className="ml-2 text-slate-300">Agent #{order.user_id}</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-800">
                      {order.total ? `$${parseFloat(String(order.total)).toFixed(2)}` : "—"}
                    </span>
                    <StatusBadge status={order.status ?? "draft"} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {orders.length === 0 && !isLoading && (
        <div className="text-center py-8 text-slate-400 text-sm">
          No orders found for {PERIOD_LABELS[period].toLowerCase()}.
        </div>
      )}
    </div>
  );
}
