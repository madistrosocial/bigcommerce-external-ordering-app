import assert from "node:assert/strict";
import { calculateAttendanceDayPay } from "../server/attendance-pay-calculation";
import { parseDateTimeLocal } from "@shared/timezone";

const timeZone = "Asia/Manila";
const workDate = "2026-01-15";

function at(localTime: string) {
  const value = parseDateTimeLocal(`${workDate}T${localTime}`, timeZone);
  assert.ok(value, `Expected ${localTime} to be valid in ${timeZone}`);
  return value;
}

function session(
  id: number,
  timeIn: string,
  timeOut: string,
  breaks: Array<[string, string]> = [],
) {
  return {
    id,
    user_id: 42,
    work_date: workDate,
    status: "completed",
    time_in: at(timeIn),
    time_out: at(timeOut),
    total_seconds: 0,
    break_seconds: breaks.reduce((sum, [start, end]) => sum + (at(end).getTime() - at(start).getTime()) / 1000, 0),
    breaks: breaks.map(([start, end]) => ({
      break_started_at: at(start),
      break_ended_at: at(end),
    })),
  };
}

function breakdown(sessions: ReturnType<typeof session>[]) {
  const result = calculateAttendanceDayPay(sessions, timeZone);
  return sessions.map(item => result.get(item.id)!);
}

{
  const [pay] = breakdown([session(1, "09:10", "18:10", [["12:00", "13:00"]])]);
  assert.equal(pay.workedSeconds, 8 * 60 * 60);
  assert.equal(pay.paidSeconds, 8 * 60 * 60);
  assert.equal(pay.overtimeSeconds, 0);
}

{
  const [pay] = breakdown([session(2, "09:10", "19:00", [["12:00", "13:00"]])]);
  assert.equal(pay.paidSeconds, 8 * 60 * 60);
  assert.equal(pay.overtimeSeconds, 50 * 60);
}

{
  const [pay] = breakdown([session(3, "09:00", "17:30", [["12:00", "12:30"]])]);
  assert.equal(pay.workedSeconds, 8 * 60 * 60);
  assert.equal(pay.paidSeconds, 8 * 60 * 60);
  assert.equal(pay.overtimeSeconds, 0);
}

{
  const [pay] = breakdown([session(4, "09:00", "18:00", [["12:00", "12:30"]])]);
  assert.equal(pay.workedSeconds, 8.5 * 60 * 60);
  assert.equal(pay.paidSeconds, 8 * 60 * 60);
  assert.equal(pay.overtimeSeconds, 0);
}

{
  const [pay] = breakdown([session(10, "09:00", "19:30", [["12:00", "13:30"]])]);
  assert.equal(pay.workedSeconds, 9 * 60 * 60);
  assert.equal(pay.paidSeconds, 8 * 60 * 60);
  assert.equal(pay.overtimeSeconds, 60 * 60);
}

{
  const [pay] = breakdown([session(5, "08:50", "19:00", [["12:00", "13:00"]])]);
  assert.equal(pay.workedSeconds, 9 * 60 * 60);
  assert.equal(pay.paidSeconds, 8 * 60 * 60);
  assert.equal(pay.overtimeSeconds, 60 * 60);
}

{
  const [first, second] = breakdown([
    session(6, "09:00", "12:00"),
    session(7, "13:00", "19:00"),
  ]);
  assert.equal(first.paidSeconds, 3 * 60 * 60);
  assert.equal(second.paidSeconds, 5 * 60 * 60);
  assert.equal(second.overtimeSeconds, 60 * 60);
}

{
  const [first, second] = breakdown([
    session(8, "09:00", "12:00"),
    session(9, "16:00", "20:00"),
  ]);
  assert.equal(first.paidSeconds + second.paidSeconds, 7 * 60 * 60);
  assert.equal(first.overtimeSeconds + second.overtimeSeconds, 0);
}
