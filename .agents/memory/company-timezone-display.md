---
name: Company timezone display
description: Durable rules for applying the configured company timezone across app dates and timestamps.
---

Use the configured IANA timezone for app timestamp display, date-based boundaries, `datetime-local` campaign scheduling, and Attendance payroll's 9:00 AM–6:00 PM shift boundaries. Use an IANA zone rather than a fixed UTC offset so daylight-saving transitions remain correct.

Preserve `YYYY-MM-DD` values as calendar dates rather than shifting them through the browser's timezone. Payroll group scheduling keeps its own timezone setting; only punch-based Attendance pay calculations use the company timezone.

**Why:** Attendance work dates and scheduled shift cutoffs follow the company's local calendar, while payroll-run cadence and payday scheduling remain separately configured.

**How to apply:** Use the shared time service for presentation and date-only calculations; convert `datetime-local` values using the configured IANA zone; do not apply the company's display timezone to payroll-run scheduling.
