---
name: POS store credit endpoints keyed by BigCommerce customer id
description: Why /api/pos/store-credit-usage resolves the CRM customer via bigcommerce_customer_id instead of requiring an internal customer_id from the client
---

The POS UI only ever holds a BigCommerce customer (`selectedCustomer.id` = BC id), not the internal CRM `customers_mirror.id`. Endpoints that need to record CRM-linked usage (e.g. store credit deduction) should accept `bigcommerce_customer_id` from the client and resolve the internal CRM `customer_id` server-side via `storage.getCrmCustomerByBcId(...)`, returning 404 if no CRM mirror record exists yet.

**Why:** Requiring the client to know/pass the internal CRM id either forces an extra lookup round-trip in the POS flow or invites bugs where BC id and internal id get passed into the same field. Resolving server-side keeps the POS client simple and matches how the rest of the CRM mirror is looked up elsewhere.

**How to apply:** Any new POS endpoint that writes into a CRM-linked table (notes, audits, usage logs) tied to a customer should take `bigcommerce_customer_id` as the primary key from POS-side callers and do the CRM id resolution internally, not the reverse.
