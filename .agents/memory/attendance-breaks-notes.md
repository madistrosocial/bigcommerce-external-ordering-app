---
name: Attendance breaks and daily notes
description: Rules for pausing a work session and storing employee context for a work date.
---

Attendance breaks stay inside the same session; they use a paused status and cumulative break seconds rather than the separately approved second-session mechanism. Final worked seconds exclude active and completed break intervals. Daily notes are stored once per employee/work date so multiple sessions do not duplicate or overwrite the note.

**Why:** The second session is an approval-controlled exception for separate work periods. Treating an ordinary break as a second session would incorrectly consume that allowance and require manager approval.

**How to apply:** Keep break start/resume/end calculations on the session, keep `total_seconds` as worked time, and read/write daily notes by employee and work date. Preserve the existing second-session approval flow for genuine separate shifts.

Attendance break display intervals are derived from the existing break audit/checkpoint events and exposed as one shared interval representation; do not add parallel persisted break columns just for presentation.

**Why:** The session stores cumulative accounting fields, while audit/checkpoint records preserve the actual start/end events needed by timelines and reports.

**How to apply:** Pair ordered break-start and break-end events, leave an active interval open-ended, and use the same intervals for employee history, admin logs, detail views, reports, and exports.