---
name: Attendance review and audit
description: Manager review lifecycle and correction-history rules for attendance records.
---

Attendance completion state and manager review state are separate concerns. A record can be active, completed, incomplete, or exception while independently being not reviewed, needing review, approved, or locked.

**Why:** Payroll and audit workflows must not reinterpret employee clock-in state as managerial approval, and corrections must preserve accountability rather than overwrite history.

**How to apply:** Require a reason for manager-requested review and time corrections. Record actor, action, changed field, old value, new value, and timestamp for every review or correction. Locked records are immutable except for an authorized administrator reopening them into needs-review.

For the daily attendance ledger, keep date rows compact and place review/approval and “Correct times” controls directly in each row. Do not expand a ledger row to show the individual attendance log.

**Why:** The user explicitly prefers direct per-row actions over expanding rows into full log details.

**How to apply:** Reuse the existing permission-aware actions in desktop and mobile ledger rows; place them in the rightmost Actions column as icon-only buttons with accessible names/tooltips, and keep full record details separate from the row interaction.

Keep the Team member selector for authorized managers, default it to the signed-in user, and omit the aggregate “All team members” option. The ledger should always show one selected person at a time.

**Why:** The user clarified that only the aggregate view should be removed; individual team-member selection remains useful.

**How to apply:** Scope the logs request and summaries to the selected user ID, initializing and resetting that selection to the signed-in user.