---
name: Payroll and leave boundaries
description: Business and compatibility rules for Payroll and Leave inside the Attendance module.
---

Keep Payroll and Leave inside the existing Attendance module and reuse its users, attendance sessions, and role groups. Configure payroll cadence per existing role; do not create replacement employee groups.

Attendance `total_seconds` remains unchanged as historical net worked time. Payroll derives work intervals from punches and existing break events where available, ignores time before 9:00 AM in the configured company timezone, and shares an eight-hour regular cap across sessions on a work date. Overtime requires eight counted work hours and begins no earlier than 6:00 PM shifted for a late start or breaks beyond the one-hour allowance; only approved claims are paid.

Use each employee's configured hourly rate and currency for their payslip. Do not convert currencies. The semimonthly and biweekly cadences are configurable, but managers enter each run's exact period and payday; do not silently infer short-month or February payday dates.

**Why:** Payroll must preserve production attendance history while applying the user's fixed 9:00 AM–6:00 PM rule; past attendance has no separate schedule snapshot, and approved overtime must remain approval-gated.

**How to apply:** Keep this calculation derived and migration-free, use the configured IANA company timezone and actual break intervals, validate overtime eligibility again when approved hours enter payroll, keep pay settings attached to current employee/role records, and do not convert employee currencies.