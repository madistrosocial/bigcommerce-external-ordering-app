---
name: BC order note editing pattern
description: The canonical endpoint and field names for editing notes on BigCommerce orders, and how to distinguish BC orders from Sales App orders.
---

## Rule
Use `PATCH /api/bigcommerce/orders/:bcOrderId/notes` for **BC-native orders** (those without a local `orders` table row). For **Sales App orders** (local `orders` table), use `PATCH /api/orders/:id/note`.

## Field names
- `staff_notes` — BC API field for internal staff notes (maps to `customer_order_mirror.staff_notes`)
- `customer_message` — BC API field for customer-facing notes (maps to `customer_order_mirror.customer_order_notes`)
- **Not** `customer_note` — that's only for the local Sales App orders table column `customer_note`

**Why:** BC v2 PUT /orders/:id uses `staff_notes` and `customer_message`. Using the wrong field silently sends an empty value.

## How to apply
- `BcExpandedPreview` in OrdersList — uses `PATCH /api/bigcommerce/orders/:bcOrderId/notes`
- `BcOrderDetail` page — same endpoint
- `CustomerOrdersPanel` expanded rows — same endpoint
- `ExpandedPreview` (Sales App orders) — uses `PATCH /api/orders/:id/note` with fields `note` (staff) and `customer_note` (customer)

## Permission gate
`hasPermission("crm", "notes_edit")` — controls visibility of Edit buttons.
