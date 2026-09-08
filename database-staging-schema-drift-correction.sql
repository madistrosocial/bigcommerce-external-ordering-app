-- ============================================================================
-- External Staging schema-drift correction
-- ============================================================================
-- Expected definitions are present in both the 04a1acb baseline and the
-- current schema snapshots. This file contains only the five confirmed
-- Staging corrections and must be reviewed/executed manually.

ALTER TABLE "inventory_push_logs"
  ADD CONSTRAINT "inventory_push_logs_user_id_users_id_fk"
  FOREIGN KEY ("user_id")
  REFERENCES "public"."users"("id")
  ON DELETE no action
  ON UPDATE no action;

ALTER TABLE "customer_signups"
  ADD CONSTRAINT "customer_signups_bigcommerce_customer_id_unique"
  UNIQUE ("bigcommerce_customer_id");

ALTER TABLE "promo_free_sku_tracker"
  ADD CONSTRAINT "promo_free_sku_tracker_sku_unique"
  UNIQUE ("sku");

ALTER TABLE "roles"
  ADD CONSTRAINT "roles_name_unique"
  UNIQUE ("name");

ALTER TABLE "permissions"
  ALTER COLUMN "id" SET GENERATED ALWAYS;