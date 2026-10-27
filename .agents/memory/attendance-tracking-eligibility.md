---
name: Attendance tracking eligibility
description: Product rule for managing attendance tracking across accounts and filtering Attendance Logs.
---

Attendance tracking is a per-user setting across all system accounts, including admins. Employee Rates & Recurring Items must make the toggle available for every account. Attendance Logs should list only accounts that are both system-enabled and tracking-enabled.

**Why:** The user clarified that account role must not determine who can be tracked; the tracking toggle is the source of truth for attendance eligibility.

**How to apply:** Keep all accounts manageable in payroll settings, and ensure both the Attendance Logs selector and its selected-user state only resolve to enabled, tracking-on users. The team selector must use an attendance-scoped endpoint; `/api/users` is admin-only and blocks non-admin attendance managers.
