import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { useTimeService } from "@/hooks/useTimeService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Activity, ChevronLeft, ChevronRight, Loader2, RefreshCw, Search } from "lucide-react";

const PAGE_SIZE = 50;

const EVENT_LABELS: Record<api.UserActivityEventType, string> = {
  login: "Login",
  logout: "Logout",
  page_view: "Page visit",
  api_action: "API action",
};

export default function SystemActivityLogPage() {
  const fmt = useTimeService();
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [eventType, setEventType] = useState<"all" | api.UserActivityEventType>("all");
  const [page, setPage] = useState(0);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["syslog-activity", page, appliedSearch, eventType],
    queryFn: () => api.getSyslogActivity({
      page,
      limit: PAGE_SIZE,
      search: appliedSearch || undefined,
      eventType: eventType === "all" ? undefined : eventType,
    }),
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, total);

  const applySearch = (event: React.FormEvent) => {
    event.preventDefault();
    setAppliedSearch(search.trim());
    setPage(0);
  };

  const clearFilters = () => {
    setSearch("");
    setAppliedSearch("");
    setEventType("all");
    setPage(0);
  };

  return (
    <div className="min-h-full bg-slate-50 px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-slate-900 p-2.5 text-white">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">System activity</h1>
              <p className="mt-1 text-sm text-slate-500">
                Sign-ins, sign-outs, pages visited, and authenticated write actions.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Locations are approximate and may be unavailable. Public IPs are looked up by FreeIPAPI.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            data-testid="button-refresh-syslog"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </header>

        <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <form onSubmit={applySearch} className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="Search user, activity, IP, or location"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                data-testid="input-syslog-search"
              />
            </div>
            <Select
              value={eventType}
              onValueChange={(value: "all" | api.UserActivityEventType) => {
                setEventType(value);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-full sm:w-44" data-testid="select-syslog-type">
                <SelectValue placeholder="All activity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All activity</SelectItem>
                <SelectItem value="login">Logins</SelectItem>
                <SelectItem value="logout">Logouts</SelectItem>
                <SelectItem value="page_view">Page visits</SelectItem>
                <SelectItem value="api_action">API actions</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" disabled={isFetching && !data} data-testid="button-search-syslog">
              Search
            </Button>
            {(appliedSearch || eventType !== "all") && (
              <Button type="button" variant="ghost" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </form>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <p className="text-sm font-medium text-slate-700">
              {isLoading ? "Loading activity…" : `${total.toLocaleString()} entries`}
            </p>
            {data && total > 0 && (
              <p className="text-xs text-slate-500">
                Showing {rangeStart}–{rangeEnd}
              </p>
            )}
          </div>

          {isLoading && !data ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading activity…
            </div>
          ) : error ? (
            <div role="alert" className="px-4 py-12 text-center text-sm text-red-700">
              {error instanceof Error ? error.message : "Could not load the activity log."}
            </div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-14 text-center">
              <Activity className="mx-auto mb-3 h-9 w-9 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">No activity found</p>
              <p className="mt-1 text-xs text-slate-500">
                New activity will appear as users sign in and use the app.
              </p>
            </div>
          ) : (
            <div className={`overflow-x-auto ${isFetching ? "opacity-70" : ""}`}>
              <table className="w-full min-w-[1050px] text-left" data-testid="table-syslog">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Date and time</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">User</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">IP and location</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Type</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Activity</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                        {fmt.dateTime(row.created_at)}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{row.username}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        <div className="font-mono text-xs">{row.ip_address || "Not recorded"}</div>
                        {row.ip_address && (
                          <div className="mt-0.5 text-xs text-slate-500">
                            {[row.location_city, row.location_region, row.location_country].filter(Boolean).join(", ")
                              || "Approximate location unavailable"}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                          {EVENT_LABELS[row.event_type]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        <div>{row.action}</div>
                        {row.page_path && row.event_type !== "api_action" && (
                          <div className="mt-0.5 break-all font-mono text-xs text-slate-400">{row.page_path}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {row.status_code == null ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span className={row.status_code >= 400 ? "font-medium text-red-700" : "text-slate-600"}>
                            {row.status_code}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">
              Page {page + 1}{totalPages > 0 ? ` of ${totalPages}` : ""}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 0 || isFetching}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                data-testid="button-syslog-previous"
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!data || (page + 1) * PAGE_SIZE >= total || isFetching}
                onClick={() => setPage((current) => current + 1)}
                data-testid="button-syslog-next"
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}