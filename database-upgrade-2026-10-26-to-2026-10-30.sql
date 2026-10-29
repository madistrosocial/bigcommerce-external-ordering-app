-- ============================================================================
-- Incremental PostgreSQL schema update for manually managed staging/live DBs
-- Baseline: database-upgrade-2026-10-09-to-2026-10-26.sql has been applied
-- Target: shared/schema.ts as of 2026-10-30
--
-- Apply to staging first, verify the three columns below, then apply to live.
-- This update is additive and rerunnable; it does not delete or rewrite data.
-- ============================================================================

BEGIN;

ALTER TABLE public.attendance_payroll_group_schedules
  ADD COLUMN IF NOT EXISTS paypal_php_conversion_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS paypal_php_conversion_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS usd_to_php_rate decimal(12,4) NOT NULL DEFAULT 0;

COMMIT;

-- Verification: expect exactly three rows with the types/defaults below.
SELECT
  table_name,
  column_name,
  data_type,
  numeric_precision,
  numeric_scale,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'attendance_payroll_group_schedules'
      AND column_name = 'paypal_php_conversion_enabled')
    OR (table_name = 'payroll_runs'
      AND column_name IN ('paypal_php_conversion_enabled', 'usd_to_php_rate'))
  )
ORDER BY table_name, column_name;
