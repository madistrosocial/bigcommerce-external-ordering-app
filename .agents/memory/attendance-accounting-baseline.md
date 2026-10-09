---
name: Attendance accounting baseline
description: Business rules used by the attendance ledger when calculating expected work and lost time.
---

The attendance ledger treats Monday–Friday as expected workdays, excludes observed US holidays and weekends, and compares recorded time against an 8-hour weekday expectation. Payroll separately applies the fixed company 9:00 AM–6:00 PM shift rule; the ledger itself still does not report clock-in lateness.

**Why:** The ledger's attendance exceptions and the payroll schedule calculation are separate outputs; a payroll start boundary should not silently change the ledger's historical expected-hours metric.

**How to apply:** Keep schedule-based paid-hour and overtime calculations in Payroll and the Attendance Reports pay columns; if the ledger later needs lateness reporting, update its expected-hours model and labels independently.