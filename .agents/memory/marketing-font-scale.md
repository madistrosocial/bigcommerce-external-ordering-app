---
name: Marketing typography scale
description: Font sizing rules for current and future Marketing modules.
---

Use the CRM Notes / Bulk Order scale for Marketing UI: 18px page titles, 14px section headings, 12px general content and buttons, 11px secondary metadata, and 14px form controls. Keep rendered customer email content at its authored size.

**Why:** The user explicitly requested the smaller CRM Notes/Bulk Order sizing across all Marketing modules and future modules, without changing system behavior.

**How to apply:** Build new Marketing pages on the shared PageShell so the scoped scale applies automatically. Add the same scale class to portal-rendered dialogs; do not apply it to customer-authored email previews/content.