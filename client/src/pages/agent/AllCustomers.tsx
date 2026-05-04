import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import * as api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Loader2, Users, Search, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BcCustomer {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  company: string;
  phone: string;
  customer_group_id: number | null;
  orders_count: number;
  total_spent: number;
  date_created: string | null;
  date_modified: string | null;
  date_last_order_placed: string | null;
}

type SortKey = "newest" | "oldest" | "most_orders" | "most_value" | "last_order" | "no_orders";

const SORT_LABELS: Record<SortKey, string> = {
  newest: "Newest",
  oldest: "Oldest",
  most_orders: "Most Orders",
  most_value: "Most Order Value ($)",
  last_order: "Last Order Date",
  no_orders: "No Orders",
};

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchAllCustomers(): Promise<BcCustomer[]> {
  const res = await fetch("/api/bigcommerce/customers/all", { headers: api.getAuthHeaders() });
  if (!res.ok) throw new Error("Failed to load customers");
  return res.json();
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

function sortCustomers(customers: BcCustomer[], sort: SortKey): BcCustomer[] {
  const copy = [...customers];
  switch (sort) {
    case "newest":
      return copy.sort((a, b) => new Date(b.date_created ?? 0).getTime() - new Date(a.date_created ?? 0).getTime());
    case "oldest":
      return copy.sort((a, b) => new Date(a.date_created ?? 0).getTime() - new Date(b.date_created ?? 0).getTime());
    case "most_orders":
      return copy.sort((a, b) => b.orders_count - a.orders_count);
    case "most_value":
      return copy.sort((a, b) => b.total_spent - a.total_spent);
    case "last_order":
      return copy
        .filter((c) => c.date_last_order_placed)
        .sort((a, b) => new Date(b.date_last_order_placed!).getTime() - new Date(a.date_last_order_placed!).getTime());
    case "no_orders":
      return copy.filter((c) => c.orders_count === 0).sort((a, b) => new Date(b.date_created ?? 0).getTime() - new Date(a.date_created ?? 0).getTime());
  }
}

// ─── CustomerRow ──────────────────────────────────────────────────────────────

function CustomerRow({ customer }: { customer: BcCustomer }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b last:border-b-0" data-testid={`customer-row-${customer.id}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn("w-full flex items-center gap-3 px-4 py-3 text-left transition-colors", open ? "bg-slate-50" : "hover:bg-slate-50")}
        data-testid={`customer-toggle-${customer.id}`}
      >
        {/* Avatar initial */}
        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0 uppercase">
          {customer.first_name?.[0] ?? "?"}{customer.last_name?.[0] ?? ""}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">
            {customer.first_name} {customer.last_name}
          </p>
          <p className="text-xs text-slate-400 truncate">{customer.email}</p>
        </div>

        <div className="text-right shrink-0 mr-1">
          <p className="text-sm font-semibold text-slate-800">
            {customer.orders_count} {customer.orders_count === 1 ? "order" : "orders"}
          </p>
          <p className="text-xs text-slate-500">${customer.total_spent.toFixed(2)}</p>
        </div>

        {open
          ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
          : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
      </button>

      {open && (
        <div className="bg-slate-50 border-t px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
          {customer.company && (
            <div><span className="text-slate-400">Company</span><br /><span className="font-medium text-slate-700">{customer.company}</span></div>
          )}
          {customer.phone && (
            <div><span className="text-slate-400">Phone</span><br /><span className="font-medium text-slate-700">{customer.phone}</span></div>
          )}
          {customer.date_created && (
            <div><span className="text-slate-400">Registered</span><br /><span className="font-medium text-slate-700">{format(new Date(customer.date_created), "MMM d, yyyy")}</span></div>
          )}
          {customer.date_last_order_placed && (
            <div><span className="text-slate-400">Last Order</span><br /><span className="font-medium text-slate-700">{format(new Date(customer.date_last_order_placed), "MMM d, yyyy")}</span></div>
          )}
          <div><span className="text-slate-400">BC ID</span><br /><span className="font-mono text-slate-500">#{customer.id}</span></div>
          {customer.customer_group_id != null && (
            <div><span className="text-slate-400">Group ID</span><br /><span className="font-mono text-slate-500">{customer.customer_group_id}</span></div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AllCustomers() {
  const [sort, setSort] = useState<SortKey>("newest");
  const [search, setSearch] = useState("");

  const { data: customers = [], isLoading, error } = useQuery({
    queryKey: ["bc-customers-all"],
    queryFn: fetchAllCustomers,
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? customers.filter(
          (c) =>
            `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
            c.email.toLowerCase().includes(q) ||
            c.company.toLowerCase().includes(q),
        )
      : customers;
    return sortCustomers(base, sort);
  }, [customers, sort, search]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3 shrink-0 flex-wrap gap-y-2">
        <Users className="h-5 w-5 text-slate-600 shrink-0" />
        <h1 className="text-base font-bold text-slate-800">All Customers</h1>
        {!isLoading && (
          <span className="text-xs text-slate-400 ml-1">({customers.length} total)</span>
        )}

        {/* Sort pills */}
        <div className="flex items-center gap-1 ml-auto flex-wrap">
          {(Object.keys(SORT_LABELS) as SortKey[]).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              data-testid={`sort-${s}`}
              className={cn(
                "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap",
                sort === s ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              {SORT_LABELS[s]}
            </button>
          ))}
        </div>
      </header>

      {/* Search */}
      <div className="bg-white border-b px-4 py-2">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or company…"
            className="pl-8 h-8 text-sm"
            data-testid="input-customer-search"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading customers…
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-red-400 text-sm">
            <p>{(error as Error).message}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Users className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">{search ? "No customers match your search." : "No customers found."}</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
            {filtered.map((c) => (
              <CustomerRow key={c.id} customer={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
