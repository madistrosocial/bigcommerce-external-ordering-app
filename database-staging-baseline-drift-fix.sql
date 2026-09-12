-- ============================================================================
-- Staging baseline schema-drift correction
-- ============================================================================
-- These five non-unique indexes are present in the 04a1acb baseline schema
-- and the current schema, but were absent from Staging during verification.
-- This file intentionally contains CREATE INDEX statements only.

CREATE INDEX "idx_bc_order_line_items_order_date"
  ON "bc_order_line_items" USING btree ("order_date");

CREATE INDEX "idx_bc_order_line_items_product"
  ON "bc_order_line_items" USING btree ("bigcommerce_product_id");

CREATE INDEX "idx_audit_tasks_product"
  ON "inventory_audit_tasks" USING btree ("product_id");

CREATE INDEX "idx_audit_tasks_sku"
  ON "inventory_audit_tasks" USING btree ("sku");

CREATE INDEX "idx_audit_tasks_status"
  ON "inventory_audit_tasks" USING btree ("status");