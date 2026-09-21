---
name: Marketing Order Form architecture
description: Customer-specific order-form sends reuse CRM identity, visibility, audit history, and timeline activity.
---

The Marketing Order Form must build each file from the selected CRM customer and freshly fetched BigCommerce product/variant inventory at send time. It sends one attachment per customer, records pending/failed/sent states in the existing CRM audit log, and exposes only successful sends as the `order_form_sent` CRM timeline activity.

**Why:** A separate customer or activity system would create identity drift and make it possible to send the wrong customer's file. Reusing CRM access checks and audit history preserves visibility rules and per-recipient accountability without a new schema.

**How to apply:** Keep the send endpoint server-authoritative: validate every customer against CRM visibility, refresh products by ID, generate inside the per-customer send loop, and create the successful timeline activity only after that recipient's email provider accepts the message.