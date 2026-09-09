---
name: Sales App order routing
description: How to choose the correct detail route for Sales App orders that may also have a BigCommerce counterpart.
---

Sales App orders are stored with a local internal ID, and synced orders may additionally have a BigCommerce order ID. When navigating to order details, prefer the BigCommerce route whenever that external ID exists; use the local order route only for unsynced orders.

**Why:** The internal Sales App ID and BigCommerce order number are different identifiers. Using the local ID for a synced order can open the wrong order or a missing detail page.

**How to apply:** In order-list and order-action navigation, check for `bigcommerce_order_id` before falling back to the local order ID. Keep invoice and BigCommerce detail links aligned with this rule.