---
name: Payslip calculation scope
description: User-directed calculation rules and placeholders for the employee payslip.
---

Use the attached payslip's compact field order and layout. Compute hourly rate from the run-time pay-rate snapshot, base/regular pay from paid regular line items, total paid working hours from regular plus approved overtime, and days worked from payroll attendance dates. Keep unavailable commission, incentives, PayPal fee, attendance exceptions, and currency conversion at zero until their rules or source data are added.

**Why:** The user requested zeroes for unavailable values and explicitly deferred commission and incentive calculations.

**How to apply:** Replace a zero placeholder only when its calculation and data source are implemented; do not infer fees, attendance exceptions, or exchange rates, and retain the hourly-rate snapshot for historical payslips.

Treat `users.company_role` as the employee's company position, separate from system access role and payroll group. Snapshot it when a payslip is built and display that snapshot as Position; legacy slips may fall back to the payroll group name.

**Why:** A finalized payslip must retain the employee's position at the time the payroll run was built, even if their current profile later changes.

**How to apply:** Keep company designation out of permission/group logic, and use the payslip snapshot rather than the live user profile for historical documents.
