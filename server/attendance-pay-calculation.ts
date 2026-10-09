import { parseDateTimeLocal } from "@shared/timezone";

export const DAILY_REGULAR_CAP_SECONDS = 8 * 60 * 60;
const SCHEDULED_START_HOUR = 9;
const SCHEDULED_END_HOUR = 18;
const INCLUDED_BREAK_SECONDS = 60 * 60;

type BreakInterval = {
  break_started_at: Date | string;
  break_ended_at?: Date | string | null;
  duration_seconds?: number | null;
};

export type AttendancePaySession = {
  id: number;
  user_id?: number | string | null;
  work_date: string;
  time_in?: Date | string | null;
  time_out?: Date | string | null;
  status?: string | null;
  total_seconds?: number | string | null;
  break_seconds?: number | string | null;
  break_started_at?: Date | string | null;
  breaks?: BreakInterval[];
};

export type AttendancePayBreakdown = {
  workedSeconds: number;
  paidSeconds: number;
  overtimeSeconds: number;
  overtimeStartsAt: Date | null;
};

type WorkSegment = {
  start: number;
  end: number;
  attendanceId: number;
};

type NormalizedSession = {
  session: AttendancePaySession;
  timeIn: number | null;
  end: number | null;
  breaks: Array<{ start: number; end: number }>;
  workSegments: WorkSegment[];
  fallbackWorkedSeconds: number;
};

function timestamp(value: Date | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.getTime() : null;
}

function secondsBetween(start: number, end: number): number {
  return Math.max(0, Math.floor((end - start) / 1000));
}

function mergeIntervals(intervals: Array<{ start: number; end: number }>) {
  const ordered = intervals
    .filter(interval => Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.end > interval.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Array<{ start: number; end: number }> = [];
  for (const interval of ordered) {
    const previous = merged[merged.length - 1];
    if (previous && interval.start <= previous.end) {
      previous.end = Math.max(previous.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

function breakIntervalsForSession(
  session: AttendancePaySession,
  timeIn: number,
  end: number,
  nowMs: number,
  scheduleStart: number,
): Array<{ start: number; end: number }> {
  const intervals = (session.breaks ?? []).flatMap(item => {
    const start = timestamp(item.break_started_at);
    const breakEnd = timestamp(item.break_ended_at) ?? end;
    if (start == null || breakEnd <= start) return [];
    return [{ start: Math.max(timeIn, start), end: Math.min(end, breakEnd) }];
  });

  if (!intervals.length && session.break_started_at) {
    const start = timestamp(session.break_started_at);
    if (start != null && start < end) intervals.push({ start: Math.max(timeIn, start), end });
  }

  if (!intervals.length) {
    const storedBreakSeconds = Math.max(0, Math.floor(Number(session.break_seconds) || 0));
    const fallbackDurationMs = Math.min(storedBreakSeconds * 1000, Math.max(0, end - timeIn));
    if (fallbackDurationMs > 0) {
      // Older sessions can have cumulative break seconds without preserved event pairs.
      // Estimate it at the beginning of the scheduled window; new records use exact intervals.
      const fallbackStart = Math.max(timeIn, scheduleStart);
      intervals.push({ start: fallbackStart, end: Math.min(end, fallbackStart + fallbackDurationMs) });
    }
  }

  return mergeIntervals(intervals.map(interval => ({
    start: Math.max(timeIn, interval.start),
    end: Math.min(end, interval.end ?? nowMs),
  })));
}

function subtractBreaks(
  start: number,
  end: number,
  breaks: Array<{ start: number; end: number }>,
  attendanceId: number,
): WorkSegment[] {
  const segments: WorkSegment[] = [];
  let cursor = start;
  for (const interval of breaks) {
    const clippedStart = Math.max(start, interval.start);
    const clippedEnd = Math.min(end, interval.end);
    if (clippedStart > cursor) segments.push({ start: cursor, end: clippedStart, attendanceId });
    cursor = Math.max(cursor, clippedEnd);
    if (cursor >= end) break;
  }
  if (cursor < end) segments.push({ start: cursor, end, attendanceId });
  return segments.filter(segment => segment.end > segment.start);
}

function normalizeSession(session: AttendancePaySession, scheduleStart: number, nowMs: number): NormalizedSession {
  const timeIn = timestamp(session.time_in);
  const timeOut = timestamp(session.time_out);
  const active = session.status === "active" || session.status === "on_break";
  const end = timeOut ?? (active && timeIn != null ? nowMs : null);
  const fallbackWorkedSeconds = Math.max(0, Math.floor(Number(session.total_seconds) || 0));
  if (timeIn == null || end == null || end <= timeIn) {
    return { session, timeIn, end, breaks: [], workSegments: [], fallbackWorkedSeconds };
  }

  const breaks = breakIntervalsForSession(session, timeIn, end, nowMs, scheduleStart);
  const countedStart = Math.max(scheduleStart, timeIn);
  const workSegments = countedStart < end
    ? subtractBreaks(countedStart, end, breaks, session.id)
    : [];

  return { session, timeIn, end, breaks, workSegments, fallbackWorkedSeconds: 0 };
}

function capOverlaps(
  intervals: Array<{ start: number; end: number }>,
  rangeStart: number,
  rangeEnd: number,
): number {
  return mergeIntervals(intervals.map(interval => ({
    start: Math.max(interval.start, rangeStart),
    end: Math.min(interval.end, rangeEnd),
  }))).reduce((sum, interval) => sum + secondsBetween(interval.start, interval.end), 0);
}

function groupKey(session: AttendancePaySession): string {
  return `${session.user_id ?? ""}:${session.work_date}`;
}

export function calculateAttendanceDayPay(
  sessions: AttendancePaySession[],
  timeZone: string,
  now = new Date(),
): Map<number, AttendancePayBreakdown> {
  const result = new Map<number, AttendancePayBreakdown>();
  const nowMs = now.getTime();
  const groups = new Map<string, AttendancePaySession[]>();

  for (const session of sessions) {
    const group = groups.get(groupKey(session)) ?? [];
    group.push(session);
    groups.set(groupKey(session), group);
  }

  for (const daySessions of groups.values()) {
    const workDate = daySessions[0]?.work_date;
    const startTime = `${String(SCHEDULED_START_HOUR).padStart(2, "0")}:00`;
    const endTime = `${String(SCHEDULED_END_HOUR).padStart(2, "0")}:00`;
    const scheduledStart = parseDateTimeLocal(`${workDate}T${startTime}`, timeZone)?.getTime();
    const scheduledEnd = parseDateTimeLocal(`${workDate}T${endTime}`, timeZone)?.getTime();

    if (scheduledStart == null || scheduledEnd == null) {
      for (const session of daySessions) {
        const fallback = Math.max(0, Math.floor(Number(session.total_seconds) || 0));
        result.set(session.id, {
          workedSeconds: fallback,
          paidSeconds: Math.min(fallback, DAILY_REGULAR_CAP_SECONDS),
          overtimeSeconds: 0,
          overtimeStartsAt: null,
        });
      }
      continue;
    }

    const normalized = daySessions.map(session => normalizeSession(session, scheduledStart, nowMs));
    const firstShiftStart = normalized
      .filter(item => item.timeIn != null && item.end != null && item.end > scheduledStart)
      .reduce<number | null>((first, item) => first == null ? item.timeIn : Math.min(first, item.timeIn!), null);
    const lateStartMs = firstShiftStart == null ? 0 : Math.max(0, firstShiftStart - scheduledStart);
    const standardWindowStart = scheduledStart + lateStartMs;
    const standardWindowEnd = scheduledEnd + lateStartMs;
    const allBreaks = mergeIntervals(normalized.flatMap(item => item.breaks));
    const breakSecondsInStandardWindow = capOverlaps(allBreaks, standardWindowStart, standardWindowEnd);
    const excessBreakMs = Math.max(0, breakSecondsInStandardWindow - INCLUDED_BREAK_SECONDS) * 1000;
    const scheduledOvertimeStart = standardWindowEnd + excessBreakMs;

    const orderedSegments = normalized
      .flatMap(item => item.workSegments)
      .sort((a, b) => a.start - b.start || a.end - b.end || a.attendanceId - b.attendanceId);
    const uniqueSegments: WorkSegment[] = [];
    let previousEnd = Number.NEGATIVE_INFINITY;
    for (const segment of orderedSegments) {
      const start = Math.max(segment.start, previousEnd);
      if (segment.end > start) {
        uniqueSegments.push({ ...segment, start });
        previousEnd = segment.end;
      }
    }

    const workedSecondsBySession = new Map<number, number>();
    const regularCandidateSecondsBySession = new Map<number, number>();
    const overtimeSecondsBySession = new Map<number, number>();
    const timelineWorkedSeconds = uniqueSegments.reduce((sum, segment) => {
      const duration = secondsBetween(segment.start, segment.end);
      workedSecondsBySession.set(segment.attendanceId, (workedSecondsBySession.get(segment.attendanceId) ?? 0) + duration);
      return sum + duration;
    }, 0);

    let cumulative = 0;
    let timeEightHoursReached: number | null = null;
    for (const segment of uniqueSegments) {
      const duration = secondsBetween(segment.start, segment.end);
      if (cumulative < DAILY_REGULAR_CAP_SECONDS && cumulative + duration >= DAILY_REGULAR_CAP_SECONDS) {
        timeEightHoursReached = segment.start + (DAILY_REGULAR_CAP_SECONDS - cumulative) * 1000;
        break;
      }
      cumulative += duration;
    }

    const overtimeStartsAt = timelineWorkedSeconds >= DAILY_REGULAR_CAP_SECONDS && timeEightHoursReached != null
      ? Math.max(scheduledOvertimeStart, timeEightHoursReached)
      : null;

    for (const segment of uniqueSegments) {
      const duration = secondsBetween(segment.start, segment.end);
      if (overtimeStartsAt == null || segment.end <= overtimeStartsAt) {
        regularCandidateSecondsBySession.set(segment.attendanceId, (regularCandidateSecondsBySession.get(segment.attendanceId) ?? 0) + duration);
        continue;
      }
      if (segment.start >= overtimeStartsAt) {
        overtimeSecondsBySession.set(segment.attendanceId, (overtimeSecondsBySession.get(segment.attendanceId) ?? 0) + duration);
        continue;
      }
      const regularPart = secondsBetween(segment.start, overtimeStartsAt);
      regularCandidateSecondsBySession.set(segment.attendanceId, (regularCandidateSecondsBySession.get(segment.attendanceId) ?? 0) + regularPart);
      overtimeSecondsBySession.set(segment.attendanceId, (overtimeSecondsBySession.get(segment.attendanceId) ?? 0) + duration - regularPart);
    }

    for (const item of normalized) {
      if (item.fallbackWorkedSeconds > 0) {
        regularCandidateSecondsBySession.set(
          item.session.id,
          (regularCandidateSecondsBySession.get(item.session.id) ?? 0) + item.fallbackWorkedSeconds,
        );
        workedSecondsBySession.set(
          item.session.id,
          (workedSecondsBySession.get(item.session.id) ?? 0) + item.fallbackWorkedSeconds,
        );
      }
    }

    const allocationOrder = [...daySessions].sort((a, b) => {
      const aStart = normalized.find(item => item.session.id === a.id)?.workSegments[0]?.start ?? timestamp(a.time_in) ?? Number.POSITIVE_INFINITY;
      const bStart = normalized.find(item => item.session.id === b.id)?.workSegments[0]?.start ?? timestamp(b.time_in) ?? Number.POSITIVE_INFINITY;
      return aStart - bStart || a.id - b.id;
    });
    let remainingPaidSeconds = DAILY_REGULAR_CAP_SECONDS;
    for (const session of allocationOrder) {
      const regularCandidate = regularCandidateSecondsBySession.get(session.id) ?? 0;
      const paidSeconds = Math.min(regularCandidate, remainingPaidSeconds);
      remainingPaidSeconds -= paidSeconds;
      result.set(session.id, {
        workedSeconds: workedSecondsBySession.get(session.id) ?? 0,
        paidSeconds,
        overtimeSeconds: overtimeSecondsBySession.get(session.id) ?? 0,
        overtimeStartsAt: overtimeStartsAt == null ? null : new Date(overtimeStartsAt),
      });
    }
  }

  return result;
}
