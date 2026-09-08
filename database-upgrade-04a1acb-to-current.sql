-- ============================================================================
-- Standalone PostgreSQL schema upgrade
-- Baseline: deployment 04a1acb (04a1acb)
-- Target: current shared/schema.ts
-- Generated from a temporary Drizzle snapshot diff; this file is for manual
-- execution in DBeaver. It has NOT been executed by this task.
--
-- Schema delta:
--   New tables: 16
--   Added columns: 7
--   New foreign keys: 31
--   New indexes: 19
--   Column modifications: none detected
--   Destructive operations: none
--
-- Safety contract:
--   * No DROP, TRUNCATE, DELETE, UPDATE, data backfill, or table recreation.
--   * Existing backup/legacy tables are not referenced.
--   * Existing objects with conflicting names are intentionally not hidden: a
--     PostgreSQL error aborts this transaction so the conflict can be reviewed.
--   * The script assumes the database has the 04a1acb schema represented by the
--     baseline commit. Run the verification file after execution.
-- ============================================================================

BEGIN;

-- ============================================================================
-- NEW TABLES
-- ============================================================================
CREATE TABLE "attendance_audit_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "attendance_audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"attendance_id" integer NOT NULL,
	"actor_user_id" integer NOT NULL,
	"action" text NOT NULL,
	"changed_field" text,
	"old_value" jsonb,
	"new_value" jsonb,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "attendance_exceptions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "attendance_exceptions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"attendance_id" integer,
	"user_id" integer NOT NULL,
	"exception_type" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"review_notes" text
);
CREATE TABLE "attendance_location_checkpoints" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "attendance_location_checkpoints_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"attendance_id" integer NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"accuracy" numeric(10, 2),
	"checkpoint_type" text NOT NULL,
	"capture_status" text DEFAULT 'captured' NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "attendance_sessions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "attendance_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"work_date" text NOT NULL,
	"time_in" timestamp,
	"time_out" timestamp,
	"start_method" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"total_seconds" integer DEFAULT 0 NOT NULL,
	"time_in_latitude" numeric(10, 7),
	"time_in_longitude" numeric(10, 7),
	"time_in_accuracy" numeric(10, 2),
	"time_in_verification" text,
	"time_out_latitude" numeric(10, 7),
	"time_out_longitude" numeric(10, 7),
	"time_out_accuracy" numeric(10, 2),
	"time_out_verification" text,
	"driving_verified" boolean DEFAULT false NOT NULL,
	"driving_verified_at" timestamp,
	"review_status" text DEFAULT 'not_reviewed' NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp,
	"locked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "marketing_audience_members" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "marketing_audience_members_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"audience_id" integer NOT NULL,
	"customer_id" integer,
	"marketing_contact_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "marketing_audiences" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "marketing_audiences_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"audience_type" text DEFAULT 'manual' NOT NULL,
	"dynamic_filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "marketing_automation_executions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "marketing_automation_executions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"automation_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"trigger_event" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_automation_executions_dedupe_key_unique" UNIQUE("dedupe_key")
);
CREATE TABLE "marketing_automation_steps" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "marketing_automation_steps_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"automation_id" integer NOT NULL,
	"step_order" integer NOT NULL,
	"action_type" text NOT NULL,
	"action_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "marketing_automations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "marketing_automations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"trigger_type" text NOT NULL,
	"trigger_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"frequency_days" integer DEFAULT 0 NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "marketing_campaign_activity" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "marketing_campaign_activity_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"campaign_id" integer NOT NULL,
	"user_id" integer,
	"action" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "marketing_campaign_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "marketing_campaign_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"campaign_id" integer NOT NULL,
	"recipient_id" integer,
	"event_type" text NOT NULL,
	"provider_event_id" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "marketing_campaign_recipients" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "marketing_campaign_recipients_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"campaign_id" integer NOT NULL,
	"customer_id" integer,
	"marketing_contact_id" integer,
	"email" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'eligible' NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp,
	"sent_at" timestamp,
	"failure_reason" text,
	"provider_message_id" text,
	"unsubscribed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "marketing_campaigns" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "marketing_campaigns_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"internal_description" text DEFAULT '' NOT NULL,
	"campaign_type" text DEFAULT 'email' NOT NULL,
	"subject_line" text DEFAULT '' NOT NULL,
	"preview_text" text DEFAULT '' NOT NULL,
	"message_content" text DEFAULT '' NOT NULL,
	"sender_email" text DEFAULT '' NOT NULL,
	"audience_type" text DEFAULT '' NOT NULL,
	"audience_id" integer,
	"audience_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"template_id" integer,
	"product_snapshots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"product_display_options" jsonb DEFAULT '{"showProductImages":true,"showProductTitles":true,"showProductPrices":false,"showShopNowButton":true}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"queued_at" timestamp,
	"started_at" timestamp,
	"sent_at" timestamp,
	"completed_at" timestamp,
	"last_error" text,
	"send_attempts" integer DEFAULT 0 NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"suppressed_count" integer DEFAULT 0 NOT NULL,
	"unsubscribed_count" integer DEFAULT 0 NOT NULL,
	"delivered_count" integer DEFAULT 0 NOT NULL,
	"opened_count" integer DEFAULT 0 NOT NULL,
	"clicked_count" integer DEFAULT 0 NOT NULL,
	"test_sent_at" timestamp,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "marketing_contacts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "marketing_contacts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"first_name" text DEFAULT '' NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"company" text,
	"phone" text,
	"contact_type" text DEFAULT 'lead' NOT NULL,
	"source" text DEFAULT 'csv' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_contacts_email_unique" UNIQUE("email")
);
CREATE TABLE "marketing_customer_preferences" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "marketing_customer_preferences_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"customer_id" integer NOT NULL,
	"email_subscribed" boolean DEFAULT true NOT NULL,
	"unsubscribed_at" timestamp,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_customer_preferences_customer_id_unique" UNIQUE("customer_id")
);
CREATE TABLE "marketing_suppressions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "marketing_suppressions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"customer_id" integer NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"reason" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"revoked_by" integer,
	"revoked_at_detail" text
);
ALTER TABLE "email_templates" ADD COLUMN "template_type" text DEFAULT 'transactional' NOT NULL;
ALTER TABLE "email_templates" ADD COLUMN "category" text DEFAULT 'general' NOT NULL;
ALTER TABLE "email_templates" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;
ALTER TABLE "email_templates" ADD COLUMN "archived_at" timestamp;
ALTER TABLE "users" ADD COLUMN "attendance_home_latitude" numeric(10, 7);
ALTER TABLE "users" ADD COLUMN "attendance_home_longitude" numeric(10, 7);
ALTER TABLE "users" ADD COLUMN "attendance_home_set_at" timestamp;
ALTER TABLE "attendance_audit_log" ADD CONSTRAINT "attendance_audit_log_attendance_id_attendance_sessions_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "attendance_audit_log" ADD CONSTRAINT "attendance_audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_attendance_id_attendance_sessions_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "attendance_location_checkpoints" ADD CONSTRAINT "attendance_location_checkpoints_attendance_id_attendance_sessions_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "marketing_audience_members" ADD CONSTRAINT "marketing_audience_members_audience_id_marketing_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "public"."marketing_audiences"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "marketing_audience_members" ADD CONSTRAINT "marketing_audience_members_customer_id_customers_mirror_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers_mirror"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "marketing_audience_members" ADD CONSTRAINT "marketing_audience_members_marketing_contact_id_marketing_contacts_id_fk" FOREIGN KEY ("marketing_contact_id") REFERENCES "public"."marketing_contacts"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "marketing_audiences" ADD CONSTRAINT "marketing_audiences_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "marketing_automation_executions" ADD CONSTRAINT "marketing_automation_executions_automation_id_marketing_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."marketing_automations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "marketing_automation_executions" ADD CONSTRAINT "marketing_automation_executions_customer_id_customers_mirror_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers_mirror"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "marketing_automation_steps" ADD CONSTRAINT "marketing_automation_steps_automation_id_marketing_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."marketing_automations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "marketing_automations" ADD CONSTRAINT "marketing_automations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "marketing_campaign_activity" ADD CONSTRAINT "marketing_campaign_activity_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "marketing_campaign_activity" ADD CONSTRAINT "marketing_campaign_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "marketing_campaign_events" ADD CONSTRAINT "marketing_campaign_events_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "marketing_campaign_events" ADD CONSTRAINT "marketing_campaign_events_recipient_id_marketing_campaign_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."marketing_campaign_recipients"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "marketing_campaign_recipients" ADD CONSTRAINT "marketing_campaign_recipients_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "marketing_campaign_recipients" ADD CONSTRAINT "marketing_campaign_recipients_customer_id_customers_mirror_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers_mirror"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "marketing_campaign_recipients" ADD CONSTRAINT "marketing_campaign_recipients_marketing_contact_id_marketing_contacts_id_fk" FOREIGN KEY ("marketing_contact_id") REFERENCES "public"."marketing_contacts"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_template_id_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."email_templates"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "marketing_contacts" ADD CONSTRAINT "marketing_contacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "marketing_customer_preferences" ADD CONSTRAINT "marketing_customer_preferences_customer_id_customers_mirror_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers_mirror"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "marketing_customer_preferences" ADD CONSTRAINT "marketing_customer_preferences_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "marketing_suppressions" ADD CONSTRAINT "marketing_suppressions_customer_id_customers_mirror_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers_mirror"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "marketing_suppressions" ADD CONSTRAINT "marketing_suppressions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "marketing_suppressions" ADD CONSTRAINT "marketing_suppressions_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "attendance_audit_attendance_created_idx" ON "attendance_audit_log" USING btree ("attendance_id","created_at");
CREATE INDEX "attendance_exceptions_status_detected_idx" ON "attendance_exceptions" USING btree ("status","detected_at");
CREATE INDEX "attendance_exceptions_user_idx" ON "attendance_exceptions" USING btree ("user_id");
CREATE INDEX "attendance_checkpoints_attendance_captured_idx" ON "attendance_location_checkpoints" USING btree ("attendance_id","captured_at");
CREATE INDEX "attendance_sessions_user_date_idx" ON "attendance_sessions" USING btree ("user_id","work_date");
CREATE INDEX "attendance_sessions_status_idx" ON "attendance_sessions" USING btree ("status");
CREATE UNIQUE INDEX "marketing_audience_customer_member_idx" ON "marketing_audience_members" USING btree ("audience_id","customer_id");
CREATE UNIQUE INDEX "marketing_audience_contact_member_idx" ON "marketing_audience_members" USING btree ("audience_id","marketing_contact_id");
CREATE INDEX "marketing_automation_executions_automation_idx" ON "marketing_automation_executions" USING btree ("automation_id","created_at");
CREATE INDEX "marketing_automation_executions_customer_idx" ON "marketing_automation_executions" USING btree ("customer_id","created_at");
CREATE UNIQUE INDEX "marketing_automation_steps_order_idx" ON "marketing_automation_steps" USING btree ("automation_id","step_order");
CREATE INDEX "marketing_campaign_events_campaign_idx" ON "marketing_campaign_events" USING btree ("campaign_id","occurred_at");
CREATE INDEX "marketing_campaign_events_recipient_idx" ON "marketing_campaign_events" USING btree ("recipient_id","occurred_at");
CREATE UNIQUE INDEX "marketing_campaign_recipients_campaign_customer_idx" ON "marketing_campaign_recipients" USING btree ("campaign_id","customer_id");
CREATE UNIQUE INDEX "marketing_campaign_recipients_campaign_contact_idx" ON "marketing_campaign_recipients" USING btree ("campaign_id","marketing_contact_id");
CREATE INDEX "marketing_campaign_recipients_status_idx" ON "marketing_campaign_recipients" USING btree ("campaign_id","status");
CREATE INDEX "marketing_contacts_type_active_idx" ON "marketing_contacts" USING btree ("contact_type","is_active");
CREATE INDEX "marketing_suppressions_active_customer_idx" ON "marketing_suppressions" USING btree ("customer_id","revoked_at");
CREATE INDEX "marketing_suppressions_active_email_idx" ON "marketing_suppressions" USING btree ("email","revoked_at");

-- ============================================================================
-- CHANGE REPORT
-- ============================================================================
-- TABLES TO CREATE:
--   attendance_audit_log
--   attendance_exceptions
--   attendance_location_checkpoints
--   attendance_sessions
--   marketing_audience_members
--   marketing_audiences
--   marketing_automation_executions
--   marketing_automation_steps
--   marketing_automations
--   marketing_campaign_activity
--   marketing_campaign_events
--   marketing_campaign_recipients
--   marketing_campaigns
--   marketing_contacts
--   marketing_customer_preferences
--   marketing_suppressions
--
-- COLUMNS TO ADD:
--   email_templates.template_type text NOT NULL DEFAULT 'transactional'
--   email_templates.category text NOT NULL DEFAULT 'general'
--   email_templates.is_active boolean NOT NULL DEFAULT true
--   email_templates.archived_at timestamp
--   users.attendance_home_latitude numeric(10, 7)
--   users.attendance_home_longitude numeric(10, 7)
--   users.attendance_home_set_at timestamp
--
-- COLUMNS TO MODIFY:
--   None detected by the baseline/current Drizzle snapshot comparison.
--
-- INDEXES TO CREATE:
--   attendance_audit_attendance_created_idx on attendance_audit_log
--   attendance_exceptions_status_detected_idx on attendance_exceptions
--   attendance_exceptions_user_idx on attendance_exceptions
--   attendance_checkpoints_attendance_captured_idx on attendance_location_checkpoints
--   attendance_sessions_user_date_idx on attendance_sessions
--   attendance_sessions_status_idx on attendance_sessions
--   marketing_audience_customer_member_idx on marketing_audience_members (UNIQUE)
--   marketing_audience_contact_member_idx on marketing_audience_members (UNIQUE)
--   marketing_automation_executions_automation_idx on marketing_automation_executions
--   marketing_automation_executions_customer_idx on marketing_automation_executions
--   marketing_automation_steps_order_idx on marketing_automation_steps (UNIQUE)
--   marketing_campaign_events_campaign_idx on marketing_campaign_events
--   marketing_campaign_events_recipient_idx on marketing_campaign_events
--   marketing_campaign_recipients_campaign_customer_idx on marketing_campaign_recipients (UNIQUE)
--   marketing_campaign_recipients_campaign_contact_idx on marketing_campaign_recipients (UNIQUE)
--   marketing_campaign_recipients_status_idx on marketing_campaign_recipients
--   marketing_contacts_type_active_idx on marketing_contacts
--   marketing_suppressions_active_customer_idx on marketing_suppressions
--   marketing_suppressions_active_email_idx on marketing_suppressions
--
-- CONSTRAINTS TO CREATE:
--   attendance_audit_log_attendance_id_attendance_sessions_id_fk
--   attendance_audit_log_actor_user_id_users_id_fk
--   attendance_exceptions_attendance_id_attendance_sessions_id_fk
--   attendance_exceptions_user_id_users_id_fk
--   attendance_exceptions_reviewed_by_users_id_fk
--   attendance_location_checkpoints_attendance_id_attendance_sessions_id_fk
--   attendance_sessions_user_id_users_id_fk
--   attendance_sessions_approved_by_users_id_fk
--   marketing_audience_members_audience_id_marketing_audiences_id_fk
--   marketing_audience_members_customer_id_customers_mirror_id_fk
--   marketing_audience_members_marketing_contact_id_marketing_contacts_id_fk
--   marketing_audiences_created_by_users_id_fk
--   marketing_automation_executions_automation_id_marketing_automations_id_fk
--   marketing_automation_executions_customer_id_customers_mirror_id_fk
--   marketing_automation_steps_automation_id_marketing_automations_id_fk
--   marketing_automations_created_by_users_id_fk
--   marketing_campaign_activity_campaign_id_marketing_campaigns_id_fk
--   marketing_campaign_activity_user_id_users_id_fk
--   marketing_campaign_events_campaign_id_marketing_campaigns_id_fk
--   marketing_campaign_events_recipient_id_marketing_campaign_recipients_id_fk
--   marketing_campaign_recipients_campaign_id_marketing_campaigns_id_fk
--   marketing_campaign_recipients_customer_id_customers_mirror_id_fk
--   marketing_campaign_recipients_marketing_contact_id_marketing_contacts_id_fk
--   marketing_campaigns_template_id_email_templates_id_fk
--   marketing_campaigns_created_by_users_id_fk
--   marketing_contacts_created_by_users_id_fk
--   marketing_customer_preferences_customer_id_customers_mirror_id_fk
--   marketing_customer_preferences_updated_by_users_id_fk
--   marketing_suppressions_customer_id_customers_mirror_id_fk
--   marketing_suppressions_created_by_users_id_fk
--   marketing_suppressions_revoked_by_users_id_fk
--   marketing_automation_executions_dedupe_key_unique (UNIQUE)
--   marketing_contacts_email_unique (UNIQUE)
--   marketing_customer_preferences_customer_id_unique (UNIQUE)
--
-- OTHER CHANGES:
--   Four email_templates columns and three users attendance-home columns are added.
--   Identity definitions are included in each newly created table primary key.
--   inventory_push_logs has no schema delta between the baseline and target.
--
-- POTENTIAL CONFLICTS:
--   Existing objects with any target name cause the transaction to fail rather than
--   being silently accepted. Inspect the reported object definition before retrying.
--   Foreign-key statements require the referenced tables/columns to exist and
--   existing rows in any pre-existing referenced relation to be compatible.
--
-- UNSAFE CHANGES:
--   None generated. No data-changing or destructive statements are present.

COMMIT;