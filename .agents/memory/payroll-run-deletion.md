---
name: Payroll run deletion
description: Access control and accounting side effects for removing payroll history runs.
---

Only draft payroll runs can be deleted. System administrators and users with `payroll:delete_runs` may delete drafts; finalized runs must first be reverted to draft by a payroll manager or a user with delete permission. Reverting clears finalization markers and releases approved overtime linked to the run. Deletion removes the run and its generated payslips/line items while retaining the payroll audit trail. Neither revert nor deletion reverses external payouts or recalls emails already sent.

**Why:** The user requires finalized payroll to remain protected from direct deletion, with a deliberate revert step before any deletion. External payment and email actions cannot be undone by the app.

**How to apply:** Enforce draft-only deletion on the server. Show Revert to Draft for finalized runs to managers or users with `payroll:delete_runs`; show Delete only for drafts to users with delete permission. Confirmation copy must disclose linked overtime becoming available again and that existing payments/emails are unaffected.
