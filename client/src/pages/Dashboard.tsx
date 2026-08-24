import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@/lib/store";
import { useLocation } from "wouter";
import {
  getAllOrders,
  getAuditKPIs,
  getCrmMetrics,
  getInventoryPushLogs,
  getUsersSummary,
  Order,
  UserSummary,
} from "@/lib/api";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  DollarSign,
  FileBarChart,
  Package,
  Plus,
  ShoppingBag,
  TrendingUp,
  Upload,
  UsersRound,
} from "lucide-react";
import {
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTimeService } from "@/hooks/useTimeService";

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

function filterByPeriod<T extends { date?: any; created_at?: any }>(
  items: T[],
  period: Period,
  dateKey: "date" | "created_at" = "date",
): T[] {
  const start = getPeriodStart(period);
  if (!start) return items;
  return items.filter((item) => {
    const value = item[dateKey];
    return value ? new Date(value) >= start : false;
  });
}

function getPreviousPeriodStart(period: Period): Date | null {
  const now = new Date();
  switch (period) {
    case "day": return subDays(startOfDay(now), 1);
    case "week": return subWeeks(startOfWeek(now, { weekStartsOn: 1 }), 1);
    case "month": return subMonths(startOfMonth(now), 1);
    case "year": return subYears(startOfYear(now), 1);
    case "all": return null;
  }
}

function filterByPreviousPeriod<T extends { date?: any; created_at?: any }>(
  items: T[],
  period: Period,
  dateKey: "date" | "created_at" = "date",
): T[] {
  const currentStart = getPeriodStart(period);
  const previousStart = getPreviousPeriodStart(period);
  if (!currentStart || !previousStart) return [];
  return items.filter((item) => {
    const value = item[dateKey];
    if (!value) return false;
    const date = new Date(value);
    return date >= previousStart && date < currentStart;
  });
}

function money(value: number): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function shortDate(value: any): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  iconClass: string;
  iconBackground: string;
  trend?: React.ReactNode;
  trendTone?: "positive" | "negative" | "neutral";
  testId: string;
}

function StatCard({
  title,
  value,
  icon: Icon,
  iconClass,
  iconBackground,
  trend,
  trendTone = "positive",
  testId,
}: StatCardProps) {
  return (
    <Card className="rounded-2xl border-slate-200 bg-white shadow-none">
      <div className="flex min-h-[106px] items-center gap-3 p-3 sm:min-h-[116px] sm:p-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconBackground} ${iconClass}`}>
          <Icon className="h-6 w-6" strokeWidth={1.8} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:text-[11px]">{title}</p>
          <p className="mt-0.5 truncate text-[22px] font-bold leading-tight text-slate-900 sm:text-[24px]" data-testid={testId}>
            {value}
          </p>
          {trend && (
            <p className={`mt-1 text-[10px] font-medium sm:text-[11px] ${
              trendTone === "negative" ? "text-red-500" : trendTone === "neutral" ? "text-slate-500" : "text-emerald-600"
            }`}>
              {trend}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

interface AttentionItemProps {
  label: string;
  detail: string;
  value: number;
  icon: React.ElementType;
  tone: "amber" | "blue" | "red" | "purple";
  path: string;
}

const ATTENTION_TONES = {
  amber: { row: "bg-amber-50/70 border-amber-100", icon: "bg-amber-100 text-amber-600", value: "bg-amber-100/80 text-amber-600" },
  blue: { row: "bg-blue-50/60 border-blue-100", icon: "bg-blue-100 text-blue-600", value: "bg-blue-100/80 text-blue-600" },
  red: { row: "bg-red-50/60 border-red-100", icon: "bg-red-100 text-red-600", value: "bg-red-100/80 text-red-600" },
  purple: { row: "bg-purple-50/60 border-purple-100", icon: "bg-purple-100 text-purple-600", value: "bg-purple-100/80 text-purple-600" },
};

function AttentionItem({ label, detail, value, icon: Icon, tone, path }: AttentionItemProps) {
  const [, setLocation] = useLocation();
  const colors = ATTENTION_TONES[tone];
  return (
    <button
      type="button"
      onClick={() => setLocation(path)}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:brightness-[.98] ${colors.row}`}
      data-testid={`attention-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${colors.icon}`}>
        <Icon className="h-4 w-4" strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-slate-800">{label}</span>
        <span className="block truncate text-[10px] text-slate-500">{detail}</span>
      </span>
      <span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-bold ${colors.value}`}>{value}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
    </button>
  );
}

interface QuickActionProps {
  label: string;
  icon: React.ElementType;
  path: string;
  color: string;
  iconColor: string;
}

function QuickAction({ label, icon: Icon, path, color, iconColor }: QuickActionProps) {
  const [, setLocation] = useLocation();
  return (
    <button
      type="button"
      onClick={() => setLocation(path)}
      className={`flex min-h-[82px] flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 ${color} px-2 py-3 text-center transition-transform hover:-translate-y-0.5`}
      data-testid={`quick-action-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <Icon className={`h-6 w-6 ${iconColor}`} strokeWidth={1.8} />
      <span className="text-[10px] font-semibold text-slate-800 sm:text-[11px]">{label}</span>
    </button>
  );
}

function Trend({ current, previous, suffix = "vs last period", invert = false }: { current: number; previous: number; suffix?: string; invert?: boolean }) {
  if (previous === 0) return <span>Current period</span>;
  const delta = Math.round(((current - previous) / previous) * 1000) / 10;
  const isPositive = invert ? delta < 0 : delta >= 0;
  return (
    <span className={isPositive ? "text-emerald-600" : "text-red-500"}>
      {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}% <span className="text-slate-400">{suffix}</span>
    </span>
  );
}

export default function DashboardPage() {
  const { currentUser } = useStore();
  const fmt = useTimeService();
  const [, setLocation] = useLocation();
  const [period, setPeriod] = useState<Period>("month");

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
    queryFn: async () => (await getInventoryPushLogs({ page: 0, limit: 10000 })).rows,
    enabled: !!currentUser,
  });

  const { data: auditKpis } = useQuery({
    queryKey: ["audit-kpis"],
    queryFn: getAuditKPIs,
    enabled: !!currentUser,
    staleTime: 5 * 60 * 1000,
  });

  const { data: crmMetrics } = useQuery({
    queryKey: ["crm-metrics-dashboard"],
    queryFn: getCrmMetrics,
    enabled: !!currentUser,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = ordersLoading || logsLoading;
  const orders = filterByPeriod(allOrders as any[], period, "date") as Order[];
  const pushLogs = filterByPeriod(allPushLogs as any[], period, "created_at");
  const previousOrders = filterByPreviousPeriod(allOrders as any[], period, "date") as Order[];
  const previousPushLogs = filterByPreviousPeriod(allPushLogs as any[], period, "created_at");

  const syncedOrders = orders.filter((order) => order.status === "synced");
  const previousSyncedOrders = previousOrders.filter((order) => order.status === "synced");
  const totalOrders = orders.length;
  const revenue = syncedOrders.reduce((sum, order) => sum + parseFloat(String(order.total ?? "0")), 0);
  const previousRevenue = previousSyncedOrders.reduce((sum, order) => sum + parseFloat(String(order.total ?? "0")), 0);
  const avgOrderValue = syncedOrders.length ? revenue / syncedOrders.length : 0;
  const previousAvgOrderValue = previousSyncedOrders.length ? previousRevenue / previousSyncedOrders.length : 0;
  const pendingOrders = orders.filter((order) => order.status === "pending_sync").length;
  const failed = orders.filter((order) => order.status === "failed").length;
  const totalPushes = pushLogs.length;

  const userGroupMap = new Map<number, string>(usersSummary.map((user) => [user.id, user.group_name ?? user.role]));
  const groupBreakdown = Object.entries(orders.reduce<Record<string, number>>((result, order) => {
    const userId = (order as any).created_by_user_id ?? (order as any).user_id;
    const group = userId ? (userGroupMap.get(userId) ?? "Unknown") : "Unknown";
    if (order.status === "synced") result[group] = (result[group] ?? 0) + 1;
    return result;
  }, {})).sort((a, b) => b[1] - a[1]);

  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime())
    .slice(0, 5);
  const recentPushLogs = [...pushLogs]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5) as any[];

  const chartData = useMemo(() => {
    const validOrders = syncedOrders.filter((order) => order.date);
    if (period === "all") {
      const byMonth = new Map<string, number>();
      validOrders.forEach((order) => {
        const date = new Date(order.date!);
        const key = `${date.getFullYear()}-${date.getMonth()}`;
        byMonth.set(key, (byMonth.get(key) ?? 0) + parseFloat(String(order.total ?? "0")));
      });
      return Array.from(byMonth.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([key, value]) => {
        const [year, month] = key.split("-").map(Number);
        return { label: new Date(year, month, 1).toLocaleDateString("en-US", { month: "short" }), value };
      });
    }

    const start = getPeriodStart(period) ?? startOfMonth(new Date());
    const end = new Date();
    const step = period === "year" ? "month" : "day";
    const points: { label: string; value: number }[] = [];
    const cursor = new Date(start);
    while (cursor <= end && points.length < 32) {
      const pointStart = new Date(cursor);
      const pointEnd = new Date(cursor);
      if (step === "month") pointEnd.setMonth(pointEnd.getMonth() + 1);
      else pointEnd.setDate(pointEnd.getDate() + 1);
      const value = validOrders
        .filter((order) => {
          const date = new Date(order.date!);
          return date >= pointStart && date < pointEnd;
        })
        .reduce((sum, order) => sum + parseFloat(String(order.total ?? "0")), 0);
      points.push({
        label: step === "month"
          ? pointStart.toLocaleDateString("en-US", { month: "short" })
          : pointStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        value,
      });
      if (step === "month") cursor.setMonth(cursor.getMonth() + 1);
      else cursor.setDate(cursor.getDate() + 1);
    }
    return points;
  }, [period, syncedOrders]);

  const chartTickInterval = chartData.length > 12 ? Math.ceil(chartData.length / 6) - 1 : 0;
  const attention = [
    {
      label: "Inventory Audits",
      detail: `${auditKpis?.skusToAudit ?? 0} SKUs are waiting for physical audit.`,
      value: auditKpis?.skusToAudit ?? 0,
      icon: ClipboardCheck,
      tone: "amber" as const,
      path: "/inventory/audit",
    },
    {
      label: "Inventory Pushes",
      detail: `${totalPushes} manual pushes are waiting for warehouse review.`,
      value: totalPushes,
      icon: Package,
      tone: "blue" as const,
      path: "/inventory-push-logs",
    },
    {
      label: "Failed Syncs",
      detail: `${failed} orders require your attention.`,
      value: failed,
      icon: AlertCircle,
      tone: "red" as const,
      path: "/orders",
    },
    {
      label: "Customers At Risk",
      detail: `${crmMetrics?.at_risk ?? 0} customers have not ordered recently.`,
      value: crmMetrics?.at_risk ?? 0,
      icon: UsersRound,
      tone: "purple" as const,
      path: "/crm/customers",
    },
  ];

  const quickActions: QuickActionProps[] = [
    { label: "Push Inventory", icon: Upload, path: "/inventory/push", color: "bg-blue-50/70", iconColor: "text-blue-600" },
    { label: "Audit Stock", icon: ClipboardCheck, path: "/inventory/audit", color: "bg-amber-50/70", iconColor: "text-amber-600" },
    { label: "Sales Report", icon: BarChart3, path: "/reports/sales", color: "bg-emerald-50/70", iconColor: "text-emerald-600" },
    { label: "CRM", icon: UsersRound, path: "/crm/customers", color: "bg-purple-50/70", iconColor: "text-purple-600" },
    { label: "Store Credit", icon: CreditCard, path: "/crm/store-credit", color: "bg-yellow-50/80", iconColor: "text-yellow-600" },
    { label: "New Order", icon: Plus, path: "/pos", color: "bg-cyan-50/70", iconColor: "text-cyan-600" },
  ];

  return (
    <div className="min-h-full bg-[#fbfcfe] px-4 py-5 sm:px-6 sm:py-7 lg:px-7">
      <div className="mx-auto max-w-[1240px] space-y-4 sm:space-y-5">
        <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-[22px]">Good morning, {currentUser?.name?.split(" ")[0] ?? ""}</h2>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">Here&apos;s what&apos;s happening across Sales &amp; Operations.</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 w-fit gap-2 rounded-lg border-slate-300 bg-white px-3 text-xs font-medium text-slate-700" data-testid="btn-period-filter">
                <CalendarDays className="h-3.5 w-3.5 text-slate-600" />
                {PERIOD_LABELS[period]}
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {(Object.keys(PERIOD_LABELS) as Period[]).map((item) => (
                <DropdownMenuItem key={item} onClick={() => setPeriod(item)} className={period === item ? "font-semibold text-blue-600" : ""} data-testid={`period-option-${item}`}>
                  {PERIOD_LABELS[item]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard title="Orders" value={isLoading ? "—" : totalOrders.toLocaleString()} icon={ShoppingBag} iconClass="text-blue-600" iconBackground="bg-blue-50" trend={<Trend current={totalOrders} previous={previousOrders.length} />} testId="stat-orders" />
          <StatCard title="Sales Revenue" value={isLoading ? "—" : money(revenue)} icon={DollarSign} iconClass="text-emerald-600" iconBackground="bg-emerald-50" trend={<Trend current={revenue} previous={previousRevenue} />} testId="stat-sales-revenue" />
          <StatCard title="Avg Order Value" value={isLoading ? "—" : money(avgOrderValue)} icon={TrendingUp} iconClass="text-purple-600" iconBackground="bg-purple-50" trend={<Trend current={avgOrderValue} previous={previousAvgOrderValue} />} testId="stat-avg-order-value" />
          <StatCard title="Pending Audits" value={auditKpis?.skusToAudit ?? "—"} icon={ClipboardCheck} iconClass="text-amber-600" iconBackground="bg-amber-50" trend="Needs review" trendTone="neutral" testId="stat-pending-audits" />
          <StatCard title="Inventory Pushes" value={isLoading ? "—" : totalPushes} icon={Package} iconClass="text-blue-600" iconBackground="bg-blue-50" trend={<Trend current={totalPushes} previous={previousPushLogs.length} />} testId="stat-inventory-pushes" />
          <StatCard title="Sync Issues" value={isLoading ? "—" : failed} icon={AlertCircle} iconClass="text-red-600" iconBackground="bg-red-50" trend={<Trend current={failed} previous={0} invert />} trendTone="negative" testId="stat-sync-issues" />
        </section>

        <section className="grid w-full min-w-0 gap-4 lg:grid-cols-[0.96fr_1.04fr]">
          <Card className="w-full min-w-0 rounded-2xl border-slate-200 bg-white p-3 shadow-none sm:p-4">
            <div className="mb-3 flex items-center gap-2 px-1">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800">Needs Attention</h3>
            </div>
            <div className="space-y-2">
              {attention.map((item) => <AttentionItem key={item.label} {...item} />)}
            </div>
          </Card>

          <Card className="w-full min-w-0 rounded-2xl border-slate-200 bg-white p-3 shadow-none sm:p-4">
            <div className="mb-2 flex items-center justify-between px-1">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800">Sales Overview</h3>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1 rounded-md border-slate-200 px-2.5 text-[10px] font-medium">
                    {PERIOD_LABELS[period]} <ChevronDown className="h-3 w-3 text-slate-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  {(Object.keys(PERIOD_LABELS) as Period[]).map((item) => <DropdownMenuItem key={item} onClick={() => setPeriod(item)}>{PERIOD_LABELS[item]}</DropdownMenuItem>)}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="px-1">
              <p className="text-[10px] text-slate-500">Total Revenue</p>
              <p className="text-xl font-bold leading-tight text-slate-900">{isLoading ? "—" : money(revenue)}</p>
              <p className="mt-1 text-[10px]"><Trend current={revenue} previous={previousRevenue} /></p>
            </div>
            <div className="mt-3 h-[188px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} interval={chartTickInterval} tick={{ fill: "#64748b", fontSize: 10 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 9 }} tickFormatter={(value) => value >= 1000 ? `$${Math.round(value / 1000)}K` : `$${value}`} />
                  <Tooltip formatter={(value: number) => [money(value), "Revenue"]} labelStyle={{ color: "#0f172a", fontSize: 11 }} contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 11 }} />
                  <Area type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} fill="url(#salesFill)" dot={{ r: 2.5, fill: "#fff", stroke: "#2563eb", strokeWidth: 1.5 }} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <button type="button" onClick={() => setLocation("/reports/sales")} className="mt-1 flex w-full items-center justify-end gap-1 px-1 text-[11px] font-medium text-blue-600 hover:text-blue-700" data-testid="link-sales-report">
              View Sales Report <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-none">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800">Recent Orders</h3>
              <button type="button" onClick={() => setLocation("/orders/list")} className="flex items-center gap-1 text-[11px] font-medium text-blue-600" data-testid="link-recent-orders">
                View Sales History <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="hidden grid-cols-[70px_1fr_88px_72px_72px] gap-2 border-b border-slate-100 px-4 py-2 text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:grid">
              <span>Order #</span><span>Customer</span><span>Date</span><span>Total</span><span>Status</span>
            </div>
            <div className="divide-y divide-slate-100">
              {recentOrders.length === 0 && <p className="px-4 py-8 text-center text-xs text-slate-400">No orders found for this period.</p>}
              {recentOrders.map((order) => (
                <button key={order.id} type="button" onClick={() => order.id && setLocation(`/orders/${order.id}`)} className="grid w-full grid-cols-[1fr_auto] items-center gap-2 px-4 py-3 text-left hover:bg-slate-50 sm:grid-cols-[70px_1fr_88px_72px_72px]" data-testid={`dashboard-order-${order.id}`}>
                  <span className="text-[11px] font-medium text-slate-700 sm:text-xs">#{order.bigcommerce_order_id ?? order.id}</span>
                  <span className="min-w-0 truncate text-[11px] text-slate-700 sm:text-xs">{order.customer_name || "Unknown Customer"}</span>
                  <span className="hidden text-[10px] text-slate-500 sm:block">{shortDate(order.date)}</span>
                  <span className="text-right text-[11px] font-semibold text-slate-800 sm:text-left">{order.total ? money(parseFloat(String(order.total))) : "—"}</span>
                  <span className="hidden justify-self-start rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-semibold text-emerald-700 sm:inline-block">{order.status === "pending_sync" ? "Pending Sync" : order.status === "failed" ? "Failed" : order.status === "draft" ? "Draft" : "Completed"}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-none">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800">Inventory Activity</h3>
              <button type="button" onClick={() => setLocation("/inventory-push-logs")} className="flex items-center gap-1 text-[11px] font-medium text-blue-600" data-testid="link-inventory-logs">
                View Inventory Logs <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-[42px_1fr_90px] gap-2 border-b border-slate-100 px-4 py-2 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
              <span>Qty</span><span>Product / Activity</span><span>Date</span>
            </div>
            <div className="divide-y divide-slate-100">
              {recentPushLogs.length === 0 && <p className="px-4 py-8 text-center text-xs text-slate-400">No inventory activity found.</p>}
              {recentPushLogs.map((log) => {
                const quantity = Number(log.quantity_added ?? 0);
                return (
                  <div key={log.id} className="grid grid-cols-[42px_1fr_90px] items-center gap-2 px-4 py-3">
                    <span className={`text-xs font-semibold ${quantity < 0 ? "text-red-500" : "text-emerald-600"}`}>{quantity >= 0 ? "+" : ""}{quantity}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-medium text-slate-700">{log.variant_name || log.product_name || log.sku}</span>
                      <span className="block truncate text-[10px] text-slate-500">{log.reason || "Manual Push"}</span>
                    </span>
                    <span className="text-[10px] text-slate-500">{fmt.dateTime(log.created_at)}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </section>

        <Card className="rounded-2xl border-slate-200 bg-white p-3 shadow-none sm:p-4">
          <div className="mb-3 flex items-center justify-between px-1">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800">Quick Actions</h3>
            <FileBarChart className="h-4 w-4 text-slate-300" />
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {quickActions.map((action) => <QuickAction key={action.path} {...action} />)}
          </div>
        </Card>
      </div>
    </div>
  );
}