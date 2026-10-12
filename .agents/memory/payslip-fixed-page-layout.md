---
name: Payslip fixed-page layout
description: The payslip preview must preserve the same A4 layout across device sizes.
---

Keep the payslip document at a fixed A4 canvas size on screen. On narrow viewports, allow horizontal panning and browser zoom rather than changing typography or reflowing the document.

**Why:** The user explicitly wants payslips to look the same regardless of which device opens them; responsive shrinking made the mobile view differ from the preferred layout.

**How to apply:** Avoid viewport-based scaling and mobile typography/layout breakpoints on the payslip itself. Put the unchanged document in a horizontally scrollable viewport, and render downloads from that same fixed-size element.
