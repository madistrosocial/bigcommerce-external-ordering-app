import { useTimezone } from "@/contexts/TimezoneContext";
import {
  formatDate,
  formatDateTime,
  formatDateTimeShort,
  formatDateTimeCompact,
  formatDateLong,
  formatTimestamp,
  formatTime,
  formatRelative,
  daysSince,
} from "@/lib/timeService";

export function useTimeService() {
  const tz = useTimezone();
  return {
    tz,
    date: (d: string | Date | null | undefined) => formatDate(d, tz),
    dateTime: (d: string | Date | null | undefined) => formatDateTime(d, tz),
    dateTimeShort: (d: string | Date | null | undefined) => formatDateTimeShort(d, tz),
    dateTimeCompact: (d: string | Date | null | undefined) => formatDateTimeCompact(d, tz),
    dateLong: (d: string | Date | null | undefined) => formatDateLong(d, tz),
    timestamp: (d: string | Date | null | undefined) => formatTimestamp(d, tz),
    time: (d: string | Date | null | undefined) => formatTime(d, tz),
    relative: (d: string | Date | null | undefined) => formatRelative(d, tz),
    daysSince: (d: string | Date | null | undefined) => daysSince(d),
  };
}
