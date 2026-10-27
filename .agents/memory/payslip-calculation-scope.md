---
name: Payslip calculation scope
description: User-directed calculation rules and placeholders for the employee payslip.
---

Use the attached payslip's compact field order and layout. Compute hourly rate from the run-time pay-rate snapshot, base/regular pay from paid regular line items, total paid working hours from regular plus approved overtime, and days worked from payroll attendance dates. Commission and incentives are manager-entered per employee and pay period, and must be included in gross and net pay. A manager may enter the quoted PayPal transfer fee for an employee and period; subtract it from net pay as a deduction and retain it when rebuilding a draft. Do not infer a fee from a percentage or independently recalculate the quote. Save the manager-entered USD-to-PHP conversion rate on each payroll run; use it to convert USD net pay on the payslip, leave PHP net pay unchanged, and do not invent conversions for other currencies or legacy USD runs without a rate.

**Why:** The user wants commission and incentive amounts editable in a draft and also wants an optional quoted PayPal fee deducted from the employee's total pay. A manager-entered, run-specific exchange rate preserves the rate actually used and prevents historical payslips from changing.

**How to apply:** Save manual earnings and quoted fee with the employee's payslip in that run, preserve them when a draft is rebuilt, include commission/incentives in gross pay and the fee in deductions/net pay. Require a positive USD-to-PHP rate when creating a run and use that saved value on previews and downloads; never replace it with a live or inferred rate. Do not infer fee amounts or attendance exceptions, and retain the hourly-rate snapshot for historical payslips.

Treat `users.company_role` as the employee's company position, separate from system access role and payroll group. Snapshot it when a payslip is built. At startup, backfill only blank legacy snapshots from the current company role; keep existing snapshots unchanged, and use the payroll group name when no role is available.

**Why:** A finalized payslip must not drift with a live profile. Older slips lack a saved position, so the first available company role is captured as a fixed legacy value rather than shown live.

**How to apply:** Keep company designation out of permission/group logic, and render saved snapshots for historical documents; use the payroll group fallback only when both saved and backfilled positions are blank.
