---
name: Attendance spreadsheet scope
description: The attendance spreadsheet guides in-app workflow behavior but is not a source of imported or synchronized records.
---

Treat the spreadsheet as a feature reference only. Do not import its records or create spreadsheet synchronization.

**Why:** The user explicitly clarified that the workbook describes desired functionality, not a data migration source.

**How to apply:** When changing Attendance or Payroll, build the requested workflow in the existing application and database; do not add spreadsheet ingestion or sync unless the user separately requests it.
