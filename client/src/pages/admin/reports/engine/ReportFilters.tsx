import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FilterDef, FilterValues } from "./types";

interface ReportFiltersProps {
  filters: FilterDef[];
  values: FilterValues;
  onChange: (key: string, value: string | string[]) => void;
  onReset: () => void;
}

export function ReportFilters({ filters, values, onChange, onReset }: ReportFiltersProps) {
  const hasAny = Object.values(values).some((v) => (Array.isArray(v) ? v.length > 0 : v !== ""));

  if (filters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-end gap-3">
      {filters.map((f) => {
        const val = values[f.key] ?? "";

        if (f.type === "daterange") {
          const [from, to] = (val as string).split("|");
          return (
            <div key={f.key} className="flex items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-[11px] text-slate-500">{f.label} From</Label>
                <Input
                  type="date"
                  className="h-8 text-sm w-36"
                  value={from || ""}
                  onChange={(e) => onChange(f.key, `${e.target.value}|${to || ""}`)}
                  data-testid={`filter-${f.key}-from`}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[11px] text-slate-500">To</Label>
                <Input
                  type="date"
                  className="h-8 text-sm w-36"
                  value={to || ""}
                  onChange={(e) => onChange(f.key, `${from || ""}|${e.target.value}`)}
                  data-testid={`filter-${f.key}-to`}
                />
              </div>
            </div>
          );
        }

        if (f.type === "text") {
          return (
            <div key={f.key} className="flex flex-col gap-1">
              <Label className="text-[11px] text-slate-500">{f.label}</Label>
              <Input
                className="h-8 text-sm w-44"
                placeholder={f.placeholder ?? `Search ${f.label}…`}
                value={val as string}
                onChange={(e) => onChange(f.key, e.target.value)}
                data-testid={`filter-${f.key}`}
              />
            </div>
          );
        }

        if (f.type === "select") {
          return (
            <div key={f.key} className="flex flex-col gap-1">
              <Label className="text-[11px] text-slate-500">{f.label}</Label>
              <Select value={(val as string) || "__all__"} onValueChange={(v) => onChange(f.key, v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm w-40" data-testid={`filter-${f.key}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  {f.options?.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        return null;
      })}

      {hasAny && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-slate-500 gap-1"
          onClick={onReset}
          data-testid="btn-reset-filters"
        >
          <X className="h-3.5 w-3.5" />
          Reset
        </Button>
      )}
    </div>
  );
}
