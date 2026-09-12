---
name: Attendance accounting baseline
description: Business rules used by the attendance ledger when calculating expected work and lost time.
---

The attendance ledger treats Monday–Friday as expected workdays, excludes observed US holidays and weekends, and compares recorded time against an 8-hour weekday expectation. It does not claim to calculate clock-in lateness because no employee schedule or start-time rule is configured.

**Why:** The attendance schema stores sessions and total seconds but does not store schedules, expected start times, or a late threshold. Showing a made-up late rule would misstate payroll data.

**How to apply:** If accounting needs true late-hours reporting, add configurable schedules/expected daily hours first, then update the ledger calculations and labels together.