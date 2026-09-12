const DEFAULT_TZ = "America/New_York";

function toDate(d: string | Date | null | undefined): Date | null {
  if (d == null || d === "") return null;
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}

export function formatDate(
  d: string | Date | null | undefined,
  tz: string = DEFAULT_TZ,
): string {
  const dt = toDate(d);
  if (!dt) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(dt);
}

export function formatDateTime(
  d: string | Date | null | undefined,
  tz: string = DEFAULT_TZ,
): string {
  const dt = toDate(d);
  if (!dt) return "—";
  const datePart = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(dt);
  const timePart = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(dt);
  return `${datePart} · ${timePart}`;
}

export function formatDateTimeShort(
  d: string | Date | null | undefined,
  tz: string = DEFAULT_TZ,
): string {
  const dt = toDate(d);
  if (!dt) return "—";
  const datePart = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
  }).format(dt);
  const timePart = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(dt);
  return `${datePart} · ${timePart}`;
}

export function formatDateTimeCompact(
  d: string | Date | null | undefined,
  tz: string = DEFAULT_TZ,
): string {
  const dt = toDate(d);
  if (!dt) return "—";
  const datePart = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  }).format(dt);
  const timePart = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(dt);
  return `${datePart} ${timePart}`;
}

export function formatDateLong(
  d: string | Date | null | undefined,
  tz: string = DEFAULT_TZ,
): string {
  const dt = toDate(d);
  if (!dt) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(dt);
}

export function formatTimestamp(
  d: string | Date | null | undefined,
  tz: string = DEFAULT_TZ,
): string {
  const dt = toDate(d);
  if (!dt) return "—";
  const timePart = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(dt);
  const datePart = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(dt);
  return `${timePart}, ${datePart}`;
}

export function formatTime(
  d: string | Date | null | undefined,
  tz: string = DEFAULT_TZ,
): string {
  const dt = toDate(d);
  if (!dt) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(dt);
}

export function formatRelative(
  d: string | Date | null | undefined,
  tz: string = DEFAULT_TZ,
): string {
  const dt = toDate(d);
  if (!dt) return "—";
  const diffMs = Date.now() - dt.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? "s" : ""} ago`;
  if (diffHour < 48) return "yesterday";
  return formatDateTime(dt, tz);
}

export function daysSince(d: string | Date | null | undefined): number {
  const dt = toDate(d);
  if (!dt) return 0;
  return Math.floor((Date.now() - dt.getTime()) / 86_400_000);
}
