import { useTimezone } from "@/contexts/TimezoneContext";
import {
  formatDate,
  formatDateShort,
  formatDateTime,
  formatDateTimeShort,
  formatDateTimeCompact,
  formatDateTimeLocalInput,
  formatDateLong,
  formatTimestamp,
  formatTime,
  formatRelative,
  daysSince,
} from "@/lib/timeService";
import { dateOnlyInTimeZone } from "@shared/timezone";

export function useTimeService() {
  const tz = useTimezone();
  return {
    tz,
    dateOnly: (d: Date = new Date()) => dateOnlyInTimeZone(d, tz),
    date: (d: string | Date | null | undefined) => formatDate(d, tz),
    dateShort: (d: string | Date | null | undefined) => formatDateShort(d, tz),
    dateTime: (d: string | Date | null | undefined) => formatDateTime(d, tz),
    dateTimeShort: (d: string | Date | null | undefined) => formatDateTimeShort(d, tz),
    dateTimeCompact: (d: string | Date | null | undefined) => formatDateTimeCompact(d, tz),
    dateTimeLocalInput: (d: string | Date | null | undefined) => formatDateTimeLocalInput(d, tz),
    dateLong: (d: string | Date | null | undefined) => formatDateLong(d, tz),
    timestamp: (d: string | Date | null | undefined) => formatTimestamp(d, tz),
    time: (d: string | Date | null | undefined) => formatTime(d, tz),
    relative: (d: string | Date | null | undefined) => formatRelative(d, tz),
    daysSince: (d: string | Date | null | undefined) => daysSince(d, tz),
  };
}
