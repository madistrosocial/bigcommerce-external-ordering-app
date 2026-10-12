---
name: Payroll period disclosure
description: Compatibility choice for the employee pay-period disclosure list.
---

Use native buttons with `aria-expanded` and an associated region for the employee payslip period list instead of adding Radix Accordion there.

**Why:** Loading the Radix accordion on the payroll route triggered an invalid React hook call in its collection provider after Vite optimized the dependency, crashing the app workflow. A native control avoids that observed runtime failure.

**How to apply:** Keep each period collapsed by default, expand only its payslip, and retain per-period actions outside the expandable region. Reconsider Radix only after fixing and verifying the hook/runtime issue.
