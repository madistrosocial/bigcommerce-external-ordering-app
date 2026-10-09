-- Synthetic attendance data for a non-production test database only.
-- September 2026: weekdays only; excludes U.S. Labor Day (2026-09-07).
-- Creates one completed 9:00 AM-6:00 PM local shift per user/workday,
-- with a one-hour break (8 net hours). Includes every row in public.users,
-- including disabled accounts. No location coordinates or audit records are fabricated.
--
-- Re-running is safe: an attendance row is inserted only if that user has no
-- session at all for that work date.
--
-- Run only against a non-production database. Review the insert count before using this dataset.

BEGIN;
SET LOCAL TIME ZONE 'UTC';

WITH company_timezone AS (
  SELECT COALESCE(
    (
      SELECT s.value #>> '{}'
      FROM public.settings AS s
      JOIN pg_timezone_names AS tz
        ON tz.name = s.value #>> '{}'
      WHERE s.key = 'company_timezone'
        AND jsonb_typeof(s.value) = 'string'
    ),
    'America/New_York'
  ) AS timezone_name
),
business_days AS (
  SELECT generated_day::date AS work_day
  FROM generate_series(
    timestamp '2026-09-01 00:00:00',
    timestamp '2026-09-30 00:00:00',
    interval '1 day'
  ) AS days(generated_day)
  WHERE EXTRACT(ISODOW FROM generated_day) BETWEEN 1 AND 5
    AND generated_day::date <> date '2026-09-07'
),
targets AS (
  SELECT
    u.id AS user_id,
    d.work_day,
    to_char(d.work_day, 'YYYY-MM-DD') AS work_date,
    tz.timezone_name
  FROM public.users AS u
  CROSS JOIN business_days AS d
  CROSS JOIN company_timezone AS tz
),
inserted AS (
  INSERT INTO public.attendance_sessions (
    user_id,
    work_date,
    session_number,
    time_in,
    time_out,
    start_method,
    status,
    total_seconds,
    break_seconds,
    time_in_verification,
    time_out_verification
  )
  SELECT
    t.user_id,
    t.work_date,
    1,
    ((t.work_day + time '09:00') AT TIME ZONE t.timezone_name) AT TIME ZONE 'UTC',
    ((t.work_day + time '18:00') AT TIME ZONE t.timezone_name) AT TIME ZONE 'UTC',
    'offsite',
    'completed',
    28800,
    3600,
    'staging_synthetic_seed',
    'staging_synthetic_seed'
  FROM targets AS t
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.attendance_sessions AS existing
    WHERE existing.user_id = t.user_id
      AND existing.work_date = t.work_date
  )
  RETURNING user_id, work_date
)
SELECT
  count(*) AS inserted_rows,
  count(DISTINCT user_id) AS users_with_inserted_rows,
  min(work_date) AS first_work_date,
  max(work_date) AS last_work_date
FROM inserted;

COMMIT;

-- Verification: counts synthetic rows created by this script, grouped by date.
SELECT work_date, count(*) AS attendance_rows
FROM public.attendance_sessions
WHERE work_date >= '2026-09-01'
  AND work_date <= '2026-09-30'
  AND time_in_verification = 'staging_synthetic_seed'
  AND time_out_verification = 'staging_synthetic_seed'
GROUP BY work_date
ORDER BY work_date;
