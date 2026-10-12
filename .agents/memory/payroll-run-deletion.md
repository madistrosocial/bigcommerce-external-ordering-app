---
name: Payroll run deletion
description: Access control and accounting side effects for removing payroll history runs.
---

Only system administrators may delete payroll runs. Deletion removes the run and its generated payslips/line items, releases approved overtime linked to the run so it can be included in a later run, and retains the payroll audit trail. Never imply that deletion reverses external payouts or recalls emails already sent.

**Why:** The user wants admins to correct mistaken runs and rebuild payroll, while avoiding changes to attendance records and keeping audit history.

**How to apply:** Keep the server-side admin check even when hiding the UI action from non-admins. Confirmation copy must describe removed payslips, reopened overtime, retained audit records, and irreversible external payments/emails.
