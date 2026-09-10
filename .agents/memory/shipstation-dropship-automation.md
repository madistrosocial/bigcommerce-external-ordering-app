---
name: ShipStation dropship automation
description: ShipStation product tags can flow to order tags, but shipment splitting requires separate product or routing configuration.
---

ShipStation treats product tagging and shipment splitting as separate workflows. Product tags can be inherited onto imported orders and used by automation rules, while Auto-Split is configured on product records and/or routing settings rather than triggered by an order tag alone.

**Why:** A Dropship order tag improves visibility but does not by itself create separate internal and vendor shipments.

**How to apply:** When implementing dropship detection, tag matching ShipStation product records first, configure and test Auto-Split with a dedicated vendor ship-from/routing setup, and handle existing orders separately from future imports.