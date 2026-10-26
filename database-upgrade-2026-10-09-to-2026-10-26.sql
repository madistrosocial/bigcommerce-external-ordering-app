-- ============================================================================
-- Incremental PostgreSQL update for the manually managed staging/live DBs
-- Baseline: database-upgrade-2026-09-28-to-2026-10-09.sql has been applied
-- Target: application schema and runtime DB requirements as of 2026-10-26
--
-- Apply to staging first, verify it, then apply the same script to live.
-- This script is rerunnable and does not drop tables or columns.
--
-- Data backfills included:
--   * fills blank payslip position/rate snapshots where source data exists
--   * normalizes attendance review statuses to the current approved/needs_review
--     states (all other values become approved; no attendance rows are deleted)
-- ============================================================================

BEGIN;

-- User attendance tracking and employee position.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS company_role text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS attendance_tracking_enabled boolean NOT NULL DEFAULT true;

-- BigCommerce catalog fields used by Product 360 and inventory workflows.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS inventory_tracking text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS bc_availability text,
  ADD COLUMN IF NOT EXISTS bc_is_visible boolean,
  ADD COLUMN IF NOT EXISTS bc_created_at timestamp,
  ADD COLUMN IF NOT EXISTS bc_updated_at timestamp,
  ADD COLUMN IF NOT EXISTS catalog_synced_at timestamp,
  ADD COLUMN IF NOT EXISTS catalog_data jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Payroll group work-time policy options.
ALTER TABLE public.attendance_payroll_group_schedules
  ADD COLUMN IF NOT EXISTS count_from_clock_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deduct_fixed_break_hour boolean NOT NULL DEFAULT false;

-- Store employee position and hourly rate on each payslip.
ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS position_snapshot text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS hourly_rate_snapshot decimal(12,4) NOT NULL DEFAULT 0;

UPDATE public.payslips AS p
SET position_snapshot = BTRIM(u.company_role)
FROM public.users AS u
WHERE p.user_id = u.id
  AND p.position_snapshot = ''
  AND NULLIF(BTRIM(u.company_role), '') IS NOT NULL;

UPDATE public.payslips AS p
SET hourly_rate_snapshot = source.rate
FROM (
  SELECT DISTINCT ON (payslip_id) payslip_id, rate
  FROM public.payslip_line_items
  WHERE line_type = 'regular'
    AND rate IS NOT NULL
  ORDER BY payslip_id, id
) AS source
WHERE p.id = source.payslip_id
  AND p.hourly_rate_snapshot = 0;

-- Match the current default for new attendance sessions and normalize legacy
-- review labels without deleting or changing the underlying time records.
ALTER TABLE public.attendance_sessions
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'approved';
ALTER TABLE public.attendance_sessions
  ALTER COLUMN review_status SET DEFAULT 'approved';
UPDATE public.attendance_sessions
SET review_status = 'approved'
WHERE review_status IS DISTINCT FROM 'needs_review'
  AND review_status IS DISTINCT FROM 'approved';
ALTER TABLE public.attendance_sessions
  ALTER COLUMN review_status SET NOT NULL;

-- Saved order-form templates.
CREATE TABLE IF NOT EXISTS public.marketing_order_form_drafts (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  product_snapshots jsonb NOT NULL DEFAULT '[]'::jsonb,
  file_format text NOT NULL DEFAULT 'xlsx',
  sender_email text NOT NULL DEFAULT '',
  email_title text NOT NULL DEFAULT '',
  email_body text NOT NULL DEFAULT '',
  created_by integer NOT NULL REFERENCES public.users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketing_order_form_drafts_updated_idx
  ON public.marketing_order_form_drafts (updated_at);

-- Shared vendor-order status and tracking-number storage for the Dropship
-- Brand Monitor.
CREATE TABLE IF NOT EXISTS public.dropship_order_tracking (
  bigcommerce_order_id integer PRIMARY KEY,
  status text NOT NULL DEFAULT 'Sent to vendor'
    CHECK (status IN ('Sent to vendor', 'Awaiting Shipment', 'Shipped')),
  tracking_number text NOT NULL DEFAULT '',
  updated_by_user_id integer REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamp NOT NULL DEFAULT now()
);

COMMIT;

-- ============================================================================
-- Verification: each listed column/table/index should be present after the run.
-- ============================================================================
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'users' AND column_name IN ('company_role', 'attendance_tracking_enabled'))
    OR (table_name = 'products' AND column_name IN (
      'inventory_tracking', 'bc_availability', 'bc_is_visible',
      'bc_created_at', 'bc_updated_at', 'catalog_synced_at', 'catalog_data'
    ))
    OR (table_name = 'attendance_payroll_group_schedules'
        AND column_name IN ('count_from_clock_in', 'deduct_fixed_break_hour'))
    OR (table_name = 'payslips'
        AND column_name IN ('position_snapshot', 'hourly_rate_snapshot'))
    OR (table_name = 'attendance_sessions' AND column_name = 'review_status')
  )
ORDER BY table_name, column_name;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('marketing_order_form_drafts', 'dropship_order_tracking')
ORDER BY table_name;

SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname = 'marketing_order_form_drafts_updated_idx';

-- Review existing attendance status values after normalization.
SELECT review_status, count(*) AS session_count
FROM public.attendance_sessions
GROUP BY review_status
ORDER BY review_status;
