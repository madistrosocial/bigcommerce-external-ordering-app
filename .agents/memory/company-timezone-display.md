---
name: Company timezone display
description: Durable rules for applying the configured company timezone across app dates and timestamps.
---

Use the configured IANA timezone for app timestamp display, date-based boundaries, and `datetime-local` campaign scheduling. An IANA zone such as `America/New_York` must be used instead of a fixed EST offset so daylight-saving transitions remain correct.

Preserve `YYYY-MM-DD` values as calendar dates rather than shifting them through the browser's timezone. Payroll retains its own timezone setting and is not governed by this company-wide display preference.

**Why:** The application needs one consistent company calendar across dashboards and operational modules, while date-only fields and Payroll have distinct semantics.

**How to apply:** Use the shared time service for presentation and date-only calculations; convert `datetime-local` values using the configured IANA zone. Keep Payroll's timezone behavior independent.
