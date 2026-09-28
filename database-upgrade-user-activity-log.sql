BEGIN;

CREATE TABLE IF NOT EXISTS user_activity_logs (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  username text NOT NULL,
  event_type text NOT NULL,
  action text NOT NULL,
  page_path text,
  http_method text,
  status_code integer,
  ip_address text,
  location_city text,
  location_region text,
  location_country text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_activity_logs_created_at_idx
  ON user_activity_logs (created_at, id);

CREATE INDEX IF NOT EXISTS user_activity_logs_user_created_at_idx
  ON user_activity_logs (user_id, created_at);

CREATE INDEX IF NOT EXISTS user_activity_logs_type_created_at_idx
  ON user_activity_logs (event_type, created_at);

COMMIT;