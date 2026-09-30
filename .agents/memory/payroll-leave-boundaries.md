---
name: Payroll and leave boundaries
description: Business and compatibility rules for Payroll and Leave inside the Attendance module.
---

Keep Payroll and Leave inside the existing Attendance module and reuse its users, attendance sessions, and role groups. Configure payroll cadence per existing role; do not create replacement employee groups.

Attendance `total_seconds` is the net worked time after recorded breaks. Regular time is capped at eight hours per completed session; overtime begins above that cap and is payable only after manager approval. A recorded meal break does not create another shift.

Use each employee's configured hourly rate and currency for their payslip. Do not convert currencies. The semimonthly and biweekly cadences are configurable, but managers enter each run's exact period and payday; do not silently infer short-month or February payday dates.

**Why:** The payroll feature must remain compatible with live attendance data, and the existing attendance records do not define a company timezone, universal pay calendar, or currency-conversion policy.

**How to apply:** When extending payroll calculations or scheduling, preserve the existing attendance records as the source of worked time, keep pay settings attached to current employee/role records, and require explicit configuration for calendar and currency assumptions.