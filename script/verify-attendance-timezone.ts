import assert from "node:assert/strict";
import {
  dateOnlyInTimeZone,
  formatDateTimeLocal,
  parseDateTimeLocal,
} from "@shared/timezone";

function expectLocalTime(value: string, timeZone: string, expectedIso: string) {
  const parsed = parseDateTimeLocal(value, timeZone);
  assert.ok(parsed, `Expected ${value} to be valid in ${timeZone}`);
  assert.equal(parsed.toISOString(), expectedIso);
  assert.equal(formatDateTimeLocal(parsed, timeZone), value);
}

expectLocalTime("2026-09-20T09:00", "America/New_York", "2026-09-20T13:00:00.000Z");
expectLocalTime("2026-01-15T09:00", "America/New_York", "2026-01-15T14:00:00.000Z");
expectLocalTime("2026-09-20T09:00", "Asia/Manila", "2026-09-20T01:00:00.000Z");

assert.equal(parseDateTimeLocal("2026-03-08T02:30", "America/New_York"), null);
expectLocalTime("2026-11-01T01:30", "America/New_York", "2026-11-01T05:30:00.000Z");

const easternMidnight = new Date("2026-09-20T03:30:00.000Z");
assert.equal(dateOnlyInTimeZone(easternMidnight, "America/New_York"), "2026-09-19");

console.log("Attendance timezone verification passed.");