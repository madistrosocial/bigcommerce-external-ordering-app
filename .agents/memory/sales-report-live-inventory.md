---
name: Sales Report live inventory
description: Rules for overlaying live BigCommerce stock on sales report rows and totals.
---

Live sales-report stock must resolve by variant ID first, then by normalized SKU, then by product ID. A missing live match must leave the report's stored stock value unchanged; it must never become zero merely because the live lookup missed.

**Why:** BigCommerce product-level inventory can be zero for variant-tracked products, and order-line mirrors can lack a reliable variant ID. Replacing a valid cached value with a fallback zero makes every affected SKU appear out of stock.

**How to apply:** When changing the sales report inventory fetch or stats aggregation, carry the SKU through the lookup key, preserve explicit live zeroes, and deduplicate stats keys by product/variant so totals are not double-counted.