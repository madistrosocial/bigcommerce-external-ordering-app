---
name: Payroll group work-time policies
description: Group-level rules for deriving worked hours from attendance sessions.
---

Payroll groups can count from actual clock-in or the later of actual clock-in and the existing 9:00 AM scheduled start. For breaks, a group can deduct exactly one hour once a session has a recorded break, or deduct the recorded break duration.

**Why:** Employees in different payroll groups follow different time-credit and lunch deduction policies; raw clock records must remain intact while derived attendance and payroll hours follow the group setting.

**How to apply:** Keep raw session timestamps and stored seconds unchanged. Apply the group policy in the shared derived-hours calculation used by attendance views, reports, overtime eligibility, and payroll. Existing groups default to scheduled-start counting and actual break duration.
