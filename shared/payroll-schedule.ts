export type PayrollSchedule = {
  cadence: string;
  biweekly_anchor_date?: string | null;
  semimonthly_first_payday?: number | null;
  semimonthly_second_payday?: number | null;
};

export type PayrollPeriod = {
  period_start: string;
  period_end: string;
  payday: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const isBiweekly = (cadence: string) => cadence === "biweekly" || cadence === "biweekly_friday";
const isSemimonthly = (cadence: string) => cadence === "semimonthly" || cadence === "semimonthly_15_30";

function dateMs(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
    ? parsed.getTime()
    : null;
}

function dateString(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const ms = dateMs(date);
  return ms == null ? null : dateString(ms + days * DAY_MS);
}

function daysBetween(from: string, to: string) {
  const fromMs = dateMs(from);
  const toMs = dateMs(to);
  return fromMs == null || toMs == null ? null : Math.round((toMs - fromMs) / DAY_MS);
}

function paydayInMonth(year: number, monthIndex: number, day: number) {
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return dateString(Date.UTC(year, monthIndex, Math.min(day, daysInMonth)));
}

function semimonthlyPaydaysInMonth(schedule: PayrollSchedule, year: number, monthIndex: number) {
  const first = Number(schedule.semimonthly_first_payday);
  const second = Number(schedule.semimonthly_second_payday);
  if (![first, second].every(day => Number.isInteger(day) && day >= 1 && day <= 31) || first === second) return [];
  return [...new Set([
    paydayInMonth(year, monthIndex, first),
    paydayInMonth(year, monthIndex, second),
  ])].sort();
}

function nextSemimonthlyPayday(schedule: PayrollSchedule, after: string, inclusive: boolean) {
  const afterMs = dateMs(after);
  if (afterMs == null) return null;
  const base = new Date(afterMs);
  const candidates: string[] = [];
  for (let offset = -1; offset <= 24; offset++) {
    const month = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offset, 1));
    candidates.push(...semimonthlyPaydaysInMonth(schedule, month.getUTCFullYear(), month.getUTCMonth()));
  }
  return candidates.sort().find(date => inclusive ? date >= after : date > after) ?? null;
}

function previousSemimonthlyPayday(schedule: PayrollSchedule, before: string) {
  const beforeMs = dateMs(before);
  if (beforeMs == null) return null;
  const base = new Date(beforeMs);
  const candidates: string[] = [];
  for (let offset = -24; offset <= 1; offset++) {
    const month = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offset, 1));
    candidates.push(...semimonthlyPaydaysInMonth(schedule, month.getUTCFullYear(), month.getUTCMonth()));
  }
  return candidates.sort().filter(date => date < before).at(-1) ?? null;
}

function nextPayday(schedule: PayrollSchedule, after: string, inclusive: boolean) {
  if (isSemimonthly(schedule.cadence)) return nextSemimonthlyPayday(schedule, after, inclusive);
  if (!isBiweekly(schedule.cadence) || !schedule.biweekly_anchor_date || dateMs(schedule.biweekly_anchor_date) == null) return null;
  const days = daysBetween(schedule.biweekly_anchor_date, after);
  if (days == null) return null;
  const cycles = Math.max(0, inclusive ? Math.ceil(days / 14) : Math.floor(days / 14) + 1);
  const candidate = addDays(schedule.biweekly_anchor_date, cycles * 14);
  return candidate && (inclusive ? candidate >= after : candidate > after) ? candidate : null;
}

function previousPayday(schedule: PayrollSchedule, before: string) {
  if (isBiweekly(schedule.cadence)) return addDays(before, -14);
  if (isSemimonthly(schedule.cadence)) return previousSemimonthlyPayday(schedule, before);
  return null;
}

function lastWeekdayBefore(date: string) {
  let candidate = addDays(date, -1);
  while (candidate) {
    const weekday = new Date(`${candidate}T00:00:00.000Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) return candidate;
    candidate = addDays(candidate, -1);
  }
  return null;
}

export function calculateNextPayrollPeriod(
  schedule: PayrollSchedule,
  latestRunPayday: string | null | undefined,
  today: string,
): PayrollPeriod | null {
  if (dateMs(today) == null) return null;
  const payday = latestRunPayday
    ? nextPayday(schedule, latestRunPayday, false)
    : isBiweekly(schedule.cadence) && schedule.biweekly_anchor_date
      ? nextPayday(schedule, schedule.biweekly_anchor_date, false)
      : nextPayday(schedule, today, true);
  if (!payday) return null;
  const periodStart = latestRunPayday || previousPayday(schedule, payday);
  const periodEnd = lastWeekdayBefore(payday);
  if (!periodStart || !periodEnd || periodStart > periodEnd) return null;
  return { period_start: periodStart, period_end: periodEnd, payday };
}
