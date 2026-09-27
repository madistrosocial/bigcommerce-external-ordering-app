---
name: Marketing Order Form architecture
description: Customer-specific order-form sends reuse CRM identity, visibility, audit history, and timeline activity.
---

The Marketing Order Form must build each file from the selected CRM customer and freshly fetched BigCommerce product/variant inventory at send time. It sends one attachment per customer, records pending/failed/sent states in the existing CRM audit log, and exposes only successful sends as the `order_form_sent` CRM timeline activity.

**Why:** A separate customer or activity system would create identity drift and make it possible to send the wrong customer's file. Reusing CRM access checks and audit history preserves visibility rules and per-recipient accountability without a new schema.

**How to apply:** Keep the send endpoint server-authoritative: validate every customer against CRM visibility, refresh products by ID, generate inside the per-customer send loop, and create the successful timeline activity only after that recipient's email provider accepts the message.

### XLSX import behavior

Marketing Order Form XLSX files place customer name and phone/email metadata above the SKU/Qty table. Product-group headings can be merged across the table columns. When reading a workbook, ignore merged-cell children: ExcelJS exposes the master cell's value through each child, which can otherwise make a group heading look like an SKU or quantity. Blank Qty cells mean the customer has not requested that line.

**Why:** A merged group label copied into the SKU and Qty columns creates false order rows; importing the actual customer labels also avoids relying on generated filenames for identity.

**How to apply:** Find the row containing SKU and Qty headers, read customer name/email from their labeled cells, ignore merged-cell children and blank quantities, and require at least one completed quantity before creating a draft.