---
name: Attendance overnight session recovery
description: Business rule for forgotten attendance time-outs and daily report visibility.
---

An open attendance session from a prior company-timezone workday must be shown to the employee and ended before a new day's session can start. Only show the daily work report after the employee has successfully timed in for that workday.

**Why:** The user wants missed prior-day logouts caught at the next attendance login and does not want a report shown before a successful time-in.

**How to apply:** Enforce prior-day session closure in both the employee flow and the server start endpoint. Keep report visibility and report writes gated by an attendance session for the current company-timezone date. When closure records the current time, clearly tell the employee that a manager can correct an earlier actual end time.
