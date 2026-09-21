type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function getZonedDateParts(date: Date, timeZone: string): ZonedDateParts {
  const parts = getFormatter(timeZone).formatToParts(date);
  const values = new Map(parts.filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
  return {
    year: values.get("year") ?? 0,
    month: values.get("month") ?? 0,
    day: values.get("day") ?? 0,
    hour: values.get("hour") ?? 0,
    minute: values.get("minute") ?? 0,
    second: values.get("second") ?? 0,
  };
}

function partsToUtcMs(parts: ZonedDateParts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  return partsToUtcMs(getZonedDateParts(date, timeZone)) - date.getTime();
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function isValidTimeZone(timeZone: string) {
  try {
    getFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function dateOnlyInTimeZone(date: Date, timeZone: string) {
  const parts = getZonedDateParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function formatDateTimeLocal(value: string | Date | null | undefined, timeZone: string) {
  if (value == null || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime()) || !isValidTimeZone(timeZone)) return "";
  const parts = getZonedDateParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

/**
 * Converts the wall-clock value from a datetime-local input into an instant.
 * The returned Date is always an absolute timestamp, independent of the
 * browser or server runtime timezone.
 */
export function parseDateTimeLocal(value: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match || !isValidTimeZone(timeZone)) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText ?? 0);
  const wallMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const wallDate = new Date(wallMs);
  if (
    wallDate.getUTCFullYear() !== year
    || wallDate.getUTCMonth() !== month - 1
    || wallDate.getUTCDate() !== day
    || wallDate.getUTCHours() !== hour
    || wallDate.getUTCMinutes() !== minute
    || wallDate.getUTCSeconds() !== second
  ) return null;

  let candidateMs = wallMs;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    candidateMs = wallMs - getTimeZoneOffsetMs(new Date(candidateMs), timeZone);
  }

  const candidate = new Date(candidateMs);
  const normalized = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
  return formatDateTimeLocal(candidate, timeZone) === normalized ? candidate : null;
}