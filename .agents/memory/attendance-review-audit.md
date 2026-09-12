---
name: Attendance review and audit
description: Manager review lifecycle and correction-history rules for attendance records.
---

Attendance completion state and manager review state are separate concerns. A record can be active, completed, incomplete, or exception while independently being not reviewed, needing review, approved, or locked.

**Why:** Payroll and audit workflows must not reinterpret employee clock-in state as managerial approval, and corrections must preserve accountability rather than overwrite history.

**How to apply:** Require a reason for manager-requested review and time corrections. Record actor, action, changed field, old value, new value, and timestamp for every review or correction. Locked records are immutable except for an authorized administrator reopening them into needs-review.