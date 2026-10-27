---
name: Payroll schedule calculation
description: Approved recurrence and cutoff rules for user-group payroll schedules.
---

Payroll periods start on the previous payday and end on the last weekday before the next scheduled payday. A biweekly schedule's configurable anchor is the previous payday and establishes the payday weekday; later paydays repeat every 14 days. Twice-monthly schedules use two user-configured calendar days, clamping a missing day to that month's last calendar day. Keep actual payroll dates generated from these settings rather than fixed examples.

**Why:** This reproduces the approved Monday example (October 12–23 coverage, October 26 payday) and lets different groups use distinct recurring schedules.

**How to apply:** Keep the schedule preview and server-side payroll-run generation on the same recurrence rule. A separate policy for paydays landing on weekends or holidays has not been selected.
