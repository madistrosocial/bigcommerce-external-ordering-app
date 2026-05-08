import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import * as api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Loader2, Users, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

interface BcCustomerGroup {
  id: number;
  name: string;
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

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchAllCustomers(): Promise<BcCustomer[]> {
  const res = await fetch("/api/bigcommerce/customers/all", { headers: api.getAuthHeaders() });
  if (!res.ok) throw new Error("Failed to load customers");
  return res.json();
}

async function fetchCustomerGroups(): Promise<BcCustomerGroup[]> {
  const res = await fetch("/api/bigcommerce/customer-groups", { headers: api.getAuthHeaders() });
  if (!res.ok) return [];
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

function CustomerRow({ customer, groupName }: { customer: BcCustomer; groupName?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b last:border-b-0" data-testid={`customer-row-${customer.id}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn("w-full flex items-center gap-3 px-4 py-3 text-left transition-colors", open ? "bg-slate-50" : "hover:bg-slate-50")}
        data-testid={`customer-toggle-${customer.id}`}
      >
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
            <div>
              <span className="text-slate-400">Group ID</span><br />
              <span className="font-mono text-slate-500">
                {customer.customer_group_id}
                {groupName && (
                  <span className="ml-1 font-sans font-medium text-slate-700">— {groupName}</span>
                )}
              </span>
            </div>
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
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const { data: customers = [], isLoading, error } = useQuery({
    queryKey: ["bc-customers-all"],
    queryFn: fetchAllCustomers,
    staleTime: 60_000,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["bc-customer-groups"],
    queryFn: fetchCustomerGroups,
    staleTime: 300_000,
  });

  const groupMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of groups) m.set(g.id, g.name);
    return m;
  }, [groups]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let base = q
      ? customers.filter(
          (c) =>
            `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
            c.email.toLowerCase().includes(q) ||
            c.company.toLowerCase().includes(q),
        )
      : customers;

    if (groupFilter !== "all") {
      const gid = parseInt(groupFilter, 10);
      base = base.filter((c) => c.customer_group_id === gid);
    }

    return sortCustomers(base, sort);
  }, [customers, sort, search, groupFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleGroupChange = (val: string) => {
    setGroupFilter(val);
    setPage(1);
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  const handleSortChange = (s: SortKey) => {
    setSort(s);
    setPage(1);
  };

  const handlePageSizeChange = (val: string) => {
    setPageSize(parseInt(val, 10));
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3 shrink-0 flex-wrap gap-y-2">
        <Users className="h-5 w-5 text-slate-600 shrink-0" />
        <h1 className="text-base font-bold text-slate-800">All Customers</h1>
        {!isLoading && (
          <span className="text-xs text-slate-400 ml-1">({filtered.length} of {customers.length})</span>
        )}

        {/* Sort pills */}
        <div className="flex items-center gap-1 flex-wrap">
          {(Object.keys(SORT_LABELS) as SortKey[]).map((s) => (
            <button
              key={s}
              onClick={() => handleSortChange(s)}
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

        {/* Group filter dropdown */}
        <div className="ml-auto shrink-0">
          <Select value={groupFilter} onValueChange={handleGroupChange}>
            <SelectTrigger className="h-8 text-xs w-48" data-testid="select-group-filter">
              <SelectValue placeholder="All Groups" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Groups</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g.id} value={String(g.id)} data-testid={`group-option-${g.id}`}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* Search */}
      <div className="bg-white border-b px-4 py-2">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by name, email or company…"
            className="pl-8 h-8 text-sm"
            data-testid="input-customer-search"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4 flex flex-col">
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
            <p className="text-sm">{search || groupFilter !== "all" ? "No customers match your filters." : "No customers found."}</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
            {paginated.map((c) => (
              <CustomerRow key={c.id} customer={c} groupName={c.customer_group_id != null ? groupMap.get(c.customer_group_id) : undefined} />
            ))}
          </div>
        )}

        {/* Pagination footer */}
        {!isLoading && !error && filtered.length > 0 && (
          <div className="flex items-center justify-between mt-4 gap-3 flex-wrap">
            {/* Page size selector — bottom left */}
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Rows per page:</span>
              <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                <SelectTrigger className="h-7 text-xs w-20" data-testid="select-page-size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)} data-testid={`page-size-${n}`}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Page navigation — bottom right */}
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span className="text-slate-400">
                {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} of {filtered.length}
              </span>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                data-testid="pagination-prev"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="font-medium">{safePage} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                data-testid="pagination-next"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
