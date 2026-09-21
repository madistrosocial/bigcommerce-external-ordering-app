---
name: Order Form email templates
description: Rules for editable Order Form email title/body fields and customer placeholder resolution.
---

Order Form email content is entered per send: the sender address is validated against configured Marketing senders, while the title and body are resolved separately for each CRM customer. Supported placeholder aliases include first_name, last_name, fullname, full_name, business_name, business name, company, and email.

**Why:** The same order-form batch can contain different recipients, so personalization must happen in the server-side per-customer send loop rather than in the browser or once per batch.

**How to apply:** Keep the plain-text body as the source, generate escaped HTML from it for HTML-capable mail clients, preserve unknown placeholders for user visibility, and keep starter template defaults aligned between the form and send endpoint.