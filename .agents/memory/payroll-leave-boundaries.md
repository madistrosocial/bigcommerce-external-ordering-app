---
name: Payroll and leave boundaries
description: Business and compatibility rules separating Attendance self-service from Payroll management.
---

Keep clocking, employee pay information, overtime claim submission, and Leave under Attendance. Put cross-employee pay profiles, payroll schedules, payroll runs, and overtime claim review in the separate Payroll module with its own view, manage, and review permissions. Payroll continues to reuse Attendance users, sessions, and existing role groups; do not create replacement employee groups.

Attendance `total_seconds` remains unchanged as historical net worked time. Payroll derives work intervals from punches and existing break events where available, ignores time before 9:00 AM in the configured company timezone, and shares an eight-hour regular cap across sessions on a work date. Overtime requires eight counted work hours and begins no earlier than 6:00 PM shifted for a late start or breaks beyond the one-hour allowance; only approved claims are paid.

Use each employee's configured hourly rate and currency for their payslip. Do not convert currencies. The semimonthly and biweekly cadences are configurable, but managers enter each run's exact period and payday; do not silently infer short-month or February payday dates.

**Why:** Separating management access limits exposure of employee pay data while preserving Attendance as the source of time records and keeping employee self-service in the established attendance workflow.

**How to apply:** Keep paid-hour calculations derived from existing punches and breaks, use the configured IANA company timezone, revalidate overtime eligibility before it enters payroll, keep pay settings attached to current employee/role records, and do not convert employee currencies.