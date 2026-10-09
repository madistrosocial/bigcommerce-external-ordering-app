---
name: Attendance review and audit
description: Manager review lifecycle and correction-history rules for attendance records.
---

Attendance completion state and the review flag are separate concerns. Attendance is approved by default; only sessions explicitly tagged `needs_review` require review. Normal attendance does not need approval or locking.

**Why:** The user specified that logged time is accepted automatically unless someone flags it for review; the separate second-session approval remains required.

**How to apply:** Default new and legacy attendance to approved, allow payroll unless a completed session is flagged for review, and keep corrections auditable and tagged for review. Clearing the flag returns the record to the automatic-approved state; do not restore record locking.

For the daily attendance ledger, keep date rows compact and place “Needs review,” “Correct times,” and second-session approval controls directly in each row. Do not expand a ledger row to show the individual attendance log.

**Why:** The user explicitly prefers direct per-row actions over expanding rows into full log details.

**How to apply:** Reuse permission-aware actions in desktop and mobile rows; put the review-flag toggle, time correction, and second-session approval in the rightmost Actions column as icon-only buttons with accessible names/tooltips.

Keep the Team member selector for authorized managers, default it to the signed-in user, and omit the aggregate “All team members” option. The ledger should always show one selected person at a time.

**Why:** The user clarified that only the aggregate view should be removed; individual team-member selection remains useful.

**How to apply:** Scope the logs request and summaries to the selected user ID, initializing and resetting that selection to the signed-in user.