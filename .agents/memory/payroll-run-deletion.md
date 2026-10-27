---
name: Payroll run deletion
description: Access control and accounting side effects for removing payroll history runs.
---

System administrators can delete any payroll run. Non-admins may do so only when separately granted `payroll:delete_runs`; this permission covers draft and finalized runs. Deletion removes the run and its generated payslips/line items, releases approved overtime linked to the run so it can be included in a later run, and retains the payroll audit trail. Never imply that deletion reverses external payouts or recalls emails already sent.

**Why:** Payroll deletion is destructive, so it is a separate explicitly assigned capability; the user confirmed that authorized non-admins may delete finalized as well as draft runs.

**How to apply:** Enforce `payroll:delete_runs` on the server and expose the action only to admins or users with that permission. Confirmation copy must describe removed payslips, reopened overtime, retained audit records, and irreversible external payments/emails.
