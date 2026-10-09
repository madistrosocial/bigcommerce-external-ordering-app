-- ============================================================================
-- Incremental PostgreSQL schema update
-- Baseline: latest saved manual SQL update, 2026-09-28
-- Target: shared/schema.ts as of 2026-10-09
--
-- Additive changes since the baseline:
--   * dropship_products.bigcommerce_variant_id
--   * Five attendance_daily_notes work-report fields
--   * Payroll, overtime, leave, payslip, and payroll-audit tables
--
-- This script does not delete or rewrite existing records.
-- It is intended for the project's manually managed PostgreSQL database.
-- Run against a backup/staging database first and inspect any name conflicts.
-- Payroll permission rows and legacy-grant migration are handled by the
-- application when the matching server version starts; they are not DDL here.
-- ============================================================================

BEGIN;

-- Dropship catalog variant mapping added after the previous SQL update.
ALTER TABLE public.dropship_products
  ADD COLUMN IF NOT EXISTS bigcommerce_variant_id integer;

-- Expanded employee daily work notes.
ALTER TABLE public.attendance_daily_notes
  ADD COLUMN IF NOT EXISTS workday_type text NOT NULL DEFAULT 'regular_workday',
  ADD COLUMN IF NOT EXISTS work_completed text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_interactions text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS challenges text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS follow_up text NOT NULL DEFAULT '';

-- Payroll schedules are attached to the existing user groups.
CREATE TABLE public.attendance_payroll_group_schedules (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY
    (SEQUENCE NAME "attendance_payroll_group_schedules_id_seq"
     INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  role_id integer NOT NULL,
  cadence text NOT NULL DEFAULT 'biweekly_friday',
  biweekly_anchor_date text,
  semimonthly_first_payday integer NOT NULL DEFAULT 15,
  semimonthly_second_payday integer NOT NULL DEFAULT 30,
  timezone text NOT NULL DEFAULT 'UTC',
  updated_by integer,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT attendance_payroll_group_schedules_role_id_roles_id_fk
    FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE,
  CONSTRAINT attendance_payroll_group_schedules_updated_by_users_id_fk
    FOREIGN KEY (updated_by) REFERENCES public.users(id)
);
CREATE UNIQUE INDEX attendance_payroll_group_schedules_role_unique
  ON public.attendance_payroll_group_schedules USING btree (role_id);

CREATE TABLE public.employee_pay_profiles (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY
    (SEQUENCE NAME "employee_pay_profiles_id_seq"
     INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  user_id integer NOT NULL,
  hourly_rate numeric(12, 4) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  overtime_multiplier numeric(7, 4) NOT NULL DEFAULT 1.5000,
  holiday_overtime_multiplier numeric(7, 4) NOT NULL DEFAULT 2.0000,
  updated_by integer,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT employee_pay_profiles_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT employee_pay_profiles_updated_by_users_id_fk
    FOREIGN KEY (updated_by) REFERENCES public.users(id)
);
CREATE UNIQUE INDEX employee_pay_profiles_user_unique
  ON public.employee_pay_profiles USING btree (user_id);

CREATE TABLE public.employee_pay_items (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY
    (SEQUENCE NAME "employee_pay_items_id_seq"
     INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  user_id integer NOT NULL,
  item_type text NOT NULL,
  label text NOT NULL,
  amount numeric(12, 2) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by integer,
  updated_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT employee_pay_items_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT employee_pay_items_created_by_users_id_fk
    FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE INDEX employee_pay_items_user_idx
  ON public.employee_pay_items USING btree (user_id, is_active);

CREATE TABLE public.payroll_runs (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY
    (SEQUENCE NAME "payroll_runs_id_seq"
     INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  role_id integer NOT NULL,
  group_name_snapshot text NOT NULL,
  cadence_snapshot text NOT NULL,
  timezone_snapshot text NOT NULL,
  period_start text NOT NULL,
  period_end text NOT NULL,
  payday text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  snapshot_updated_at timestamp NOT NULL DEFAULT now(),
  created_by integer NOT NULL,
  finalized_by integer,
  finalized_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT payroll_runs_role_id_roles_id_fk
    FOREIGN KEY (role_id) REFERENCES public.roles(id),
  CONSTRAINT payroll_runs_created_by_users_id_fk
    FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT payroll_runs_finalized_by_users_id_fk
    FOREIGN KEY (finalized_by) REFERENCES public.users(id)
);
CREATE UNIQUE INDEX payroll_runs_role_period_unique
  ON public.payroll_runs USING btree (role_id, period_start, period_end);
CREATE INDEX payroll_runs_status_payday_idx
  ON public.payroll_runs USING btree (status, payday);

CREATE TABLE public.attendance_overtime_requests (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY
    (SEQUENCE NAME "attendance_overtime_requests_id_seq"
     INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  attendance_id integer NOT NULL,
  user_id integer NOT NULL,
  overtime_type text NOT NULL,
  requested_hours numeric(8, 2) NOT NULL,
  approved_hours numeric(8, 2),
  employee_note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  reviewed_by integer,
  reviewed_at timestamp,
  manager_note text,
  paid_in_run_id integer,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT attendance_overtime_requests_attendance_id_attendance_sessions_id_fk
    FOREIGN KEY (attendance_id) REFERENCES public.attendance_sessions(id),
  CONSTRAINT attendance_overtime_requests_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT attendance_overtime_requests_reviewed_by_users_id_fk
    FOREIGN KEY (reviewed_by) REFERENCES public.users(id),
  CONSTRAINT attendance_overtime_requests_paid_in_run_id_payroll_runs_id_fk
    FOREIGN KEY (paid_in_run_id) REFERENCES public.payroll_runs(id)
);
CREATE UNIQUE INDEX attendance_overtime_requests_attendance_unique
  ON public.attendance_overtime_requests USING btree (attendance_id);
CREATE INDEX attendance_overtime_requests_user_status_idx
  ON public.attendance_overtime_requests USING btree (user_id, status);

CREATE TABLE public.attendance_leave_requests (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY
    (SEQUENCE NAME "attendance_leave_requests_id_seq"
     INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  user_id integer NOT NULL,
  leave_type text NOT NULL,
  start_date text NOT NULL,
  end_date text NOT NULL,
  daily_hours numeric(5, 2) NOT NULL DEFAULT 8.00,
  employee_note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  reviewed_by integer,
  reviewed_at timestamp,
  manager_note text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT attendance_leave_requests_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT attendance_leave_requests_reviewed_by_users_id_fk
    FOREIGN KEY (reviewed_by) REFERENCES public.users(id)
);
CREATE INDEX attendance_leave_requests_user_status_date_idx
  ON public.attendance_leave_requests USING btree (user_id, status, start_date);

CREATE TABLE public.payslips (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY
    (SEQUENCE NAME "payslips_id_seq"
     INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  payroll_run_id integer NOT NULL,
  user_id integer NOT NULL,
  employee_name_snapshot text NOT NULL,
  employee_username_snapshot text NOT NULL,
  currency text NOT NULL,
  regular_hours numeric(10, 2) NOT NULL DEFAULT 0,
  overtime_hours numeric(10, 2) NOT NULL DEFAULT 0,
  paid_leave_hours numeric(10, 2) NOT NULL DEFAULT 0,
  unpaid_leave_hours numeric(10, 2) NOT NULL DEFAULT 0,
  gross_amount numeric(14, 2) NOT NULL DEFAULT 0,
  deductions_amount numeric(14, 2) NOT NULL DEFAULT 0,
  net_amount numeric(14, 2) NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT payslips_payroll_run_id_payroll_runs_id_fk
    FOREIGN KEY (payroll_run_id) REFERENCES public.payroll_runs(id),
  CONSTRAINT payslips_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE UNIQUE INDEX payslips_run_user_unique
  ON public.payslips USING btree (payroll_run_id, user_id);
CREATE INDEX payslips_user_idx
  ON public.payslips USING btree (user_id, created_at);

CREATE TABLE public.payslip_line_items (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY
    (SEQUENCE NAME "payslip_line_items_id_seq"
     INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  payslip_id integer NOT NULL,
  line_type text NOT NULL,
  description text NOT NULL,
  units numeric(10, 2) NOT NULL DEFAULT 0,
  rate numeric(12, 4),
  amount numeric(14, 2) NOT NULL,
  source_type text NOT NULL,
  source_id integer NOT NULL,
  source_date text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT payslip_line_items_payslip_id_payslips_id_fk
    FOREIGN KEY (payslip_id) REFERENCES public.payslips(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX payslip_line_items_source_unique
  ON public.payslip_line_items USING btree (source_type, source_id, source_date);
CREATE INDEX payslip_line_items_payslip_idx
  ON public.payslip_line_items USING btree (payslip_id);

CREATE TABLE public.attendance_payroll_audit_log (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY
    (SEQUENCE NAME "attendance_payroll_audit_log_id_seq"
     INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
  actor_user_id integer NOT NULL,
  entity_type text NOT NULL,
  entity_id integer NOT NULL,
  action text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT attendance_payroll_audit_log_actor_user_id_users_id_fk
    FOREIGN KEY (actor_user_id) REFERENCES public.users(id)
);
CREATE INDEX attendance_payroll_audit_entity_idx
  ON public.attendance_payroll_audit_log USING btree (entity_type, entity_id, created_at);

COMMIT;

-- Verification: every listed table should return one row.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'attendance_payroll_group_schedules',
    'employee_pay_profiles',
    'employee_pay_items',
    'payroll_runs',
    'attendance_overtime_requests',
    'attendance_leave_requests',
    'payslips',
    'payslip_line_items',
    'attendance_payroll_audit_log'
  )
ORDER BY table_name;

-- Verification: these six added columns should return one row each.
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'dropship_products' AND column_name = 'bigcommerce_variant_id')
    OR
    (table_name = 'attendance_daily_notes' AND column_name IN (
      'workday_type',
      'work_completed',
      'customer_interactions',
      'challenges',
      'follow_up'
    ))
  )
ORDER BY table_name, column_name;
