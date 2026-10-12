import { Link } from "wouter";

const CUSTOMER_AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-indigo-100 text-indigo-700",
  "bg-orange-100 text-orange-700",
] as const;

export function getCustomerAvatarColor(customerId: number): string {
  return CUSTOMER_AVATAR_COLORS[Math.abs(customerId) % CUSTOMER_AVATAR_COLORS.length];
}

type CustomerIdentityProps = {
  customerId?: number | null;
  company?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  fallbackName?: string | null;
};

export function CustomerIdentity({
  customerId,
  company,
  firstName,
  lastName,
  email,
  fallbackName,
}: CustomerIdentityProps) {
  const personName = [firstName, lastName].filter(Boolean).join(" ");
  const initials = (company || personName || fallbackName || "?")
    .split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  const identity = (
    <>
      <span className={`flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full text-[11px] font-bold ${getCustomerAvatarColor(customerId ?? 0)}`}>
        {initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold leading-tight text-slate-900">{company || fallbackName || "—"}</span>
        <span className="block truncate text-[12px] font-medium leading-tight text-slate-500">{personName}</span>
        {email && <span className="block truncate text-[11px] leading-tight text-slate-400">{email}</span>}
      </span>
    </>
  );

  return customerId
    ? <Link href={`/crm/customers/${customerId}`} className="flex min-w-0 items-center gap-2.5 hover:text-blue-700" aria-label={`View CRM profile for ${company || personName || fallbackName || "customer"}`}>{identity}</Link>
    : <div className="flex min-w-0 items-center gap-2.5">{identity}</div>;
}
